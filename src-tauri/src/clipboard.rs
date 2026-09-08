use serde::Serialize;

use crate::notes::CommandError;

#[derive(Debug, PartialEq, Serialize)]
pub struct CodeClipboard {
    language: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
mod metadata {
    use serde::Deserialize;

    use super::CodeClipboard;

    const INVALID: &str = "the clipboard metadata is invalid";

    #[derive(Deserialize)]
    struct VsCode {
        mode: Option<String>,
    }

    #[derive(Deserialize)]
    struct ZedSelection {
        len: usize,
    }

    fn read_u32(bytes: &mut &[u8]) -> Result<u32, &'static str> {
        let value = bytes.get(..4).ok_or(INVALID)?;
        *bytes = &bytes[4..];
        Ok(u32::from_le_bytes(value.try_into().map_err(|_| INVALID)?))
    }

    fn read_string(bytes: &mut &[u8]) -> Result<String, &'static str> {
        let length = usize::try_from(read_u32(bytes)?).map_err(|_| INVALID)?;
        let size = length.checked_mul(2).ok_or(INVALID)?;
        let padded = size.checked_add(3).ok_or(INVALID)? & !3;
        let value = bytes.get(..size).ok_or(INVALID)?;
        *bytes = bytes.get(padded..).ok_or(INVALID)?;
        let units = value
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]));
        String::from_utf16(&units.collect::<Vec<_>>()).map_err(|_| INVALID)
    }

    /// Decode Chromium's Pickle map, whose strings are UTF-16 and aligned to four bytes.
    pub(super) fn chromium(data: &[u8]) -> Result<Option<CodeClipboard>, &'static str> {
        let payload_size = usize::try_from(read_u32(&mut &data[..])?).map_err(|_| INVALID)?;
        let header_size = data.len().checked_sub(payload_size).ok_or(INVALID)?;
        if header_size < 4 || header_size % 4 != 0 {
            return Err(INVALID);
        }
        let mut payload = &data[header_size..];
        let count = read_u32(&mut payload)?;
        for _ in 0..count {
            let kind = read_string(&mut payload)?;
            let value = read_string(&mut payload)?;
            if kind == "vscode-editor-data" {
                let metadata: VsCode = serde_json::from_str(&value).map_err(|_| INVALID)?;
                return Ok(Some(CodeClipboard {
                    language: metadata.mode,
                }));
            }
        }
        Ok(None)
    }

    pub(super) fn zed(data: &[u8], text_len: usize) -> Result<Option<CodeClipboard>, &'static str> {
        let selections: Vec<ZedSelection> = serde_json::from_slice(data).map_err(|_| INVALID)?;
        if selections.is_empty() {
            return Ok(None);
        }
        if selections.iter().any(|selection| selection.len > text_len) {
            return Err(INVALID);
        }
        Ok(Some(CodeClipboard { language: None }))
    }
}

#[cfg(target_os = "macos")]
fn read_matching_clipboard(text: &str) -> Result<Option<CodeClipboard>, CommandError> {
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::ns_string;

    let board = NSPasteboard::generalPasteboard();
    let change_count = board.changeCount();
    let Some(current) = board.stringForType(ns_string!("public.utf8-plain-text")) else {
        return Ok(None);
    };
    if current.to_string() != text {
        return Ok(None);
    }

    // WebKit omits these native types from ClipboardEvent, including Chromium's
    // map carrying VS Code and Cursor's language. Read them only for this paste.
    let chromium = board.dataForType(ns_string!("org.chromium.web-custom-data"));
    let zed = board.dataForType(ns_string!("zed-metadata"));
    if board.changeCount() != change_count {
        return Ok(None);
    }
    if let Some(data) = chromium {
        if let Some(code) = metadata::chromium(&data.to_vec())? {
            return Ok(Some(code));
        }
    }
    if let Some(data) = zed {
        return Ok(metadata::zed(&data.to_vec(), text.len())?);
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::{metadata, CodeClipboard};

    fn chromium_bytes(kind: &str, value: &str) -> Vec<u8> {
        let mut payload = 1_u32.to_le_bytes().to_vec();
        for text in [kind, value] {
            let units: Vec<_> = text.encode_utf16().collect();
            payload.extend(u32::try_from(units.len()).unwrap().to_le_bytes());
            for unit in units {
                payload.extend(unit.to_le_bytes());
            }
            while payload.len() % 4 != 0 {
                payload.push(0);
            }
        }
        let mut data = u32::try_from(payload.len()).unwrap().to_le_bytes().to_vec();
        data.extend(payload);
        data
    }

    #[test]
    fn should_read_vscode_and_cursor_language_metadata() {
        let data = chromium_bytes(
            "vscode-editor-data",
            r#"{"version":1,"mode":"typescript","multicursorText":null,"isFromEmptySelection":false}"#,
        );
        assert_eq!(
            metadata::chromium(&data),
            Ok(Some(CodeClipboard {
                language: Some("typescript".into())
            }))
        );
    }

    #[test]
    fn should_recognize_code_when_syntax_copy_is_disabled() {
        let data = chromium_bytes("vscode-editor-data", r#"{"version":1,"mode":null}"#);
        assert_eq!(
            metadata::chromium(&data),
            Ok(Some(CodeClipboard { language: None }))
        );
    }

    #[test]
    fn should_leave_other_chromium_clipboard_formats_alone() {
        let data = chromium_bytes("other-editor-data", "{\"mode\":\"python\"}");
        assert_eq!(metadata::chromium(&data), Ok(None));
    }

    #[test]
    fn should_reject_truncated_chromium_metadata_without_panicking() {
        let data = chromium_bytes("vscode-editor-data", "{\"mode\":\"python\"}");
        for length in 0..data.len() {
            assert!(metadata::chromium(&data[..length]).is_err());
        }
    }

    #[test]
    fn should_reject_invalid_language_metadata() {
        let data = chromium_bytes("vscode-editor-data", "{\"mode\":12}");
        assert!(metadata::chromium(&data).is_err());
    }

    #[test]
    fn should_recognize_zed_without_inventing_a_language() {
        let data = br#"[{"len":12,"is_entire_line":false,"first_line_indent":0}]"#;
        assert_eq!(
            metadata::zed(data, 12),
            Ok(Some(CodeClipboard { language: None }))
        );
    }

    #[test]
    fn should_reject_invalid_zed_metadata() {
        assert!(metadata::zed(br#"[{"len":"12"}]"#, 12).is_err());
        assert!(metadata::zed(br#"[{"len":13}]"#, 12).is_err());
    }
}

/// Read code editor metadata only when the native clipboard still matches the pasted text.
#[tauri::command]
pub fn read_code_clipboard(text: String) -> Result<Option<CodeClipboard>, CommandError> {
    #[cfg(target_os = "macos")]
    {
        read_matching_clipboard(&text)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        Ok(None)
    }
}
