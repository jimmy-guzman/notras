use tauri::Runtime;

use notras_core::CommandError;

#[cfg(target_os = "macos")]
mod native {
    use std::ffi::c_void;
    use std::sync::mpsc::Sender;

    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob};
    use objc2_foundation::{NSCopying, NSObject, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    /// Whether AppKit wrote the file, or why the export never got that far.
    pub(super) type Outcome = Result<(), &'static str>;

    /// An inch above and below, in PostScript points.
    const BLOCK_MARGIN: f64 = 72.0;
    /// The note surface's `max-w-2xl`, 42rem at 96dpi, in points. The side
    /// margins are whatever the paper has left after it, so the text block
    /// and the tables fitted to it are the same width on Letter and A4, and
    /// the surface's own 24px side padding puts the text an inch in on Letter.
    const COLUMN: f64 = 504.0;
    /// Half an inch, for a paper too narrow to hold the column.
    const MIN_INLINE_MARGIN: f64 = 36.0;

    define_class!(
        // SAFETY: NSObject has no subclassing requirements and `PrintDone`
        // does not implement `Drop`.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "NotrasPrintDone"]
        #[ivars = Sender<Outcome>]
        struct PrintDone;

        impl PrintDone {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _operation: &NSPrintOperation, success: Bool, context: *mut c_void) {
                // SAFETY: `context` is the retain `start` leaked for this one
                // callback, and AppKit invokes it once.
                let _keep_alive = unsafe { Retained::from_raw(context.cast::<Self>()) };
                let _ = self.ivars().send(
                    success
                        .as_bool()
                        .then_some(())
                        .ok_or("The PDF could not be written"),
                );
            }
        }
    );

    impl PrintDone {
        fn new(mtm: MainThreadMarker, done: Sender<Outcome>) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(done);
            // SAFETY: NSObject's `init` takes no arguments and returns the
            // initialized instance.
            unsafe { msg_send![super(this), init] }
        }
    }

    /// Run the webview's print operation as a save job with no panel. AppKit
    /// paginates, embeds the fonts and writes `path`, then messages `done`.
    pub(super) fn start(
        webview: *mut c_void,
        path: &str,
        title: &str,
        done: Sender<Outcome>,
    ) -> Result<(), &'static str> {
        let mtm = MainThreadMarker::new().ok_or("The export left the main thread")?;
        // SAFETY: Tauri hands over the retained WKWebView pointer on the main
        // thread, and the borrow ends before this function returns.
        let webview: &WKWebView = unsafe { &*webview.cast::<WKWebView>() };
        let window = webview.window().ok_or("The window is gone")?;

        // A copy: the shared print info outlives this job, and a save
        // disposition left on it would redirect the next print.
        let info = NSPrintInfo::sharedPrintInfo().copy();
        // SAFETY: the disposition and the saving URL key are AppKit's own
        // constants, and the dictionary takes any object under a string key.
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            info.dictionary().insert(
                NSPrintJobSavingURL,
                &NSURL::fileURLWithPath(&NSString::from_str(path)),
            );
        }
        let inline_margin = ((info.paperSize().width - COLUMN) / 2.0).max(MIN_INLINE_MARGIN);
        info.setTopMargin(BLOCK_MARGIN);
        info.setBottomMargin(BLOCK_MARGIN);
        info.setLeftMargin(inline_margin);
        info.setRightMargin(inline_margin);

        // SAFETY: the print info is fully initialized and stays retained for
        // the operation's lifetime.
        let operation = unsafe { webview.printOperationWithPrintInfo(&info) };
        // WebKit sets this on the operation it hands out; stated here so the
        // job leaving the main thread reads from this file.
        operation.setCanSpawnSeparateThread(true);
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        operation.setJobTitle(Some(&NSString::from_str(title)));

        // AppKit does not retain the delegate. `context` carries a second
        // retain across the job, which the callback reclaims.
        let delegate = PrintDone::new(mtm, done);
        let context = Retained::into_raw(delegate.clone()).cast::<c_void>();
        // SAFETY: the delegate implements the selector with the documented
        // signature, and `context` is the pointer that selector reclaims.
        unsafe {
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                context,
            );
        }
        Ok(())
    }
}

/// Write the webview's current document to `path` as a paginated PDF.
#[tauri::command]
#[specta::specta]
pub async fn export_pdf<R: Runtime>(
    webview: tauri::Webview<R>,
    path: String,
    title: String,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    {
        let (done, outcome) = std::sync::mpsc::channel();
        webview
            .with_webview(move |platform| {
                if let Err(reason) = native::start(platform.inner(), &path, &title, done.clone()) {
                    let _ = done.send(Err(reason));
                }
            })
            .map_err(|error| CommandError::with_source("The PDF export could not start", error))?;
        // A closure that never ran drops its sender, which ends the wait
        // rather than hanging it.
        tauri::async_runtime::spawn_blocking(move || outcome.recv())
            .await
            .ok()
            .and_then(Result::ok)
            .ok_or("The PDF export did not run")?
            .map_err(CommandError::from)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (webview, path, title);
        Err("PDF export is only available on macOS".into())
    }
}
