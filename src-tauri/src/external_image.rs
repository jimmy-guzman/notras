use std::path::{Path, PathBuf};

use tauri::http::{header, HeaderValue, Request, Response, StatusCode};
use tauri::Url;

use notras_core::ErrorKind;

/// The scheme an external document's images load through, checked per request.
pub const SCHEME: &str = "external-image";

fn content_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "gif" => "image/gif",
        "jpeg" | "jpg" => "image/jpeg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => return None,
    })
}

fn parse(uri: &str) -> Option<(PathBuf, String)> {
    let url = Url::parse(uri).ok()?;
    let mut document = None;
    let mut src = None;
    for (key, value) in url.query_pairs() {
        match &*key {
            "doc" => document = Some(PathBuf::from(value.into_owned())),
            "src" => src = Some(value.into_owned()),
            _ => {}
        }
    }
    Some((document?, src?))
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

/// Answer one image request with the bytes and their type, or a status.
///
/// A status leaves the image broken and says why in the inspector.
pub fn respond(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some((document, src)) = parse(&request.uri().to_string()) else {
        return status(StatusCode::BAD_REQUEST);
    };
    let image = match notras_core::external_image(&document, &src) {
        Ok(image) => image,
        Err(error) if error.kind == ErrorKind::NotFound => return status(StatusCode::NOT_FOUND),
        Err(_) => return status(StatusCode::FORBIDDEN),
    };
    let Some(mime) = content_type(&image) else {
        return status(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    match std::fs::read(&image) {
        Ok(bytes) => {
            let mut response = Response::new(bytes);
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            response
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => status(StatusCode::NOT_FOUND),
        Err(_) => status(StatusCode::FORBIDDEN),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn request(base: &str, document: &Path, src: &str) -> Request<Vec<u8>> {
        let url = Url::parse_with_params(
            base,
            [("doc", document.to_string_lossy().as_ref()), ("src", src)],
        )
        .unwrap();
        Request::builder()
            .uri(url.as_str())
            .body(Vec::new())
            .unwrap()
    }

    fn document() -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir_all(directory.path().join("docs/images")).unwrap();
        fs::write(directory.path().join("docs/note.md"), "# Note").unwrap();
        fs::write(directory.path().join("docs/my shot.PNG"), b"png bytes").unwrap();
        fs::write(directory.path().join("docs/images/x.webp"), b"webp bytes").unwrap();
        fs::write(directory.path().join("docs/notes.txt"), "text").unwrap();
        fs::write(directory.path().join("up.gif"), b"gif bytes").unwrap();
        directory
    }

    #[test]
    fn should_serve_an_image_beside_the_document_with_its_type() {
        let directory = document();
        let note = directory.path().join("docs/note.md");

        let response = respond(&request(
            "external-image://localhost/",
            &note,
            "my shot.PNG",
        ));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "image/png"
        );
        assert_eq!(response.body(), b"png bytes");
    }

    #[test]
    fn should_serve_images_below_and_above_the_document() {
        let directory = document();
        let note = directory.path().join("docs/note.md");

        for (src, mime, bytes) in [
            ("images/x.webp", "image/webp", &b"webp bytes"[..]),
            ("../up.gif", "image/gif", &b"gif bytes"[..]),
        ] {
            let response = respond(&request("external-image://localhost/", &note, src));
            assert_eq!(response.status(), StatusCode::OK, "{src}");
            assert_eq!(
                response.headers().get(header::CONTENT_TYPE).unwrap(),
                mime,
                "{src}"
            );
            assert_eq!(response.body(), bytes, "{src}");
        }
    }

    #[test]
    fn should_answer_the_windows_shape_of_the_scheme() {
        let directory = document();
        let note = directory.path().join("docs/note.md");

        let response = respond(&request(
            "http://external-image.localhost/",
            &note,
            "images/x.webp",
        ));

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn should_answer_a_status_for_what_it_will_not_serve() {
        let directory = document();
        let note = directory.path().join("docs/note.md");

        for (src, expected) in [
            ("gone.png", StatusCode::NOT_FOUND),
            ("/etc/hosts", StatusCode::FORBIDDEN),
            ("images", StatusCode::FORBIDDEN),
            ("notes.txt", StatusCode::UNSUPPORTED_MEDIA_TYPE),
        ] {
            let response = respond(&request("external-image://localhost/", &note, src));
            assert_eq!(response.status(), expected, "{src}");
            assert!(response.body().is_empty(), "{src}");
        }
        assert_eq!(
            respond(&request(
                "external-image://localhost/",
                &directory.path().join("docs/notes.txt"),
                "my shot.PNG"
            ))
            .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn should_reject_a_request_missing_its_document_or_source() {
        for uri in [
            "external-image://localhost/",
            "external-image://localhost/?doc=%2Ftmp%2Fnote.md",
            "external-image://localhost/?src=shot.png",
        ] {
            let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
            assert_eq!(respond(&request).status(), StatusCode::BAD_REQUEST, "{uri}");
        }
    }
}
