//! macOS asks the app delegate before ending a quit it delivers itself: ⌘Q, the
//! Dock, an Apple event, a logout. tao's delegate has no
//! `applicationShouldTerminate:`, so those end the process with no
//! `ExitRequested` to hold it. This adds the method and holds them through the
//! same handshake, answering `NSTerminateLater` because a cancel would have
//! macOS report that notras stopped the logout.

use std::ffi::c_char;
use std::mem;
use std::sync::OnceLock;

use dispatch2::DispatchQueue;
use objc2::ffi::{class_addMethod, NSUInteger};
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{sel, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
use tauri::{AppHandle, Manager};

use crate::state::{AppState, Ending, QuitHandshake};

/// The app the delegate method holds a quit for.
static APP: OnceLock<AppHandle> = OnceLock::new();

fn reply(proceed: bool) {
    let main_thread = MainThreadMarker::new().expect("the main queue runs on the main thread");

    NSApplication::sharedApplication(main_thread).replyToApplicationShouldTerminate(proceed);
}

unsafe extern "C-unwind" fn should_terminate(
    _delegate: *mut AnyObject,
    _selector: Sel,
    _sender: *mut AnyObject,
) -> NSUInteger {
    let app = APP
        .get()
        .expect("the app is stored before the method is added");

    if !app.state::<AppState>().quit.hold() {
        return NSApplicationTerminateReply::TerminateNow.0;
    }
    crate::begin_quit(app, Ending::Exit);
    NSApplicationTerminateReply::TerminateLater.0
}

/// Answer a quit macOS is holding, and say whether one was held. `proceed` ends
/// the process through `applicationWillTerminate:`, which still reaches
/// `RunEvent::Exit`.
pub(crate) fn answer(quit: &QuitHandshake, proceed: bool) -> bool {
    if !quit.release() {
        return false;
    }

    // The reply runs `applicationWillTerminate:`, which re-enters tao's event
    // callback. From inside that callback, as `run_on_main_thread` would be,
    // its `RefCell` borrow panics, so this goes through the main queue instead.
    // That also makes it safe from the backstop's thread.
    DispatchQueue::main().exec_async(move || reply(proceed));

    true
}

/// Add `applicationShouldTerminate:` to tao's app delegate.
///
/// TODO: drop this module once tao's delegate answers that itself and Tauri
/// raises `ExitRequested` from it. Through tao 0.37.2 it has neither.
pub(crate) fn intercept(app: &AppHandle) {
    let _ = APP.set(app.clone());

    let main_thread = MainThreadMarker::new().expect("setup runs on the main thread");
    let application = NSApplication::sharedApplication(main_thread);
    let Some(delegate) = application.delegate() else {
        log::error!("could not hold a quit: the app has no delegate");
        return;
    };
    let object: &AnyObject = delegate.as_ref();
    let class: *const AnyClass = object.class();
    let types: *const c_char = c"Q@:@".as_ptr();

    // SAFETY: `class` is a live class, `types` is a NUL-terminated encoding, and it
    // describes `should_terminate`, whose signature the transmute leaves intact:
    // `Imp` is only how the runtime stores it.
    let added = unsafe {
        class_addMethod(
            class.cast_mut(),
            sel!(applicationShouldTerminate:),
            mem::transmute::<
                unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> NSUInteger,
                Imp,
            >(should_terminate),
            types,
        )
    };

    if !added.as_bool() {
        log::error!("could not hold a quit: the delegate already answers it");
    }
}
