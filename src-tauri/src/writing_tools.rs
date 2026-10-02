//! Keeps AppKit's Writing Tools check from reading the selection. WebKit
//! converts every styled run to answer, and a select-all over highlighted code
//! stalled input for seconds.

use std::ffi::{c_char, c_void, CStr};
use std::mem::transmute;
use std::sync::OnceLock;

use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::sel;

/// `BLOCK_HAS_COPY_DISPOSE` and `BLOCK_HAS_SIGNATURE` from the Blocks ABI.
const HAS_COPY_DISPOSE: i32 = 1 << 25;
const HAS_SIGNATURE: i32 = 1 << 30;

/// `void (^)(BOOL)` as clang encodes it: `BOOL` is `bool` on Apple silicon
/// and `signed char` on Intel.
#[cfg(target_arch = "aarch64")]
const BOOL_COMPLETION: &CStr = c"v12@?0B8";
#[cfg(target_arch = "x86_64")]
const BOOL_COMPLETION: &CStr = c"v12@?0c8";

#[repr(C)]
struct Block {
    isa: *const c_void,
    flags: i32,
    reserved: i32,
    invoke: *const c_void,
    descriptor: *const *const c_void,
}

type SuppressCheck = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut Block);
type BoolCompletion = unsafe extern "C-unwind" fn(*mut Block, Bool);

static ORIGINAL: OnceLock<SuppressCheck> = OnceLock::new();

unsafe fn signature<'a>(block: *const Block) -> Option<&'a CStr> {
    // SAFETY: callers pass a live block.
    let block = unsafe { &*block };
    if block.flags & HAS_SIGNATURE == 0 {
        return None;
    }
    // Descriptor: reserved, size, [copy, dispose], signature.
    let index = if block.flags & HAS_COPY_DISPOSE == 0 {
        2
    } else {
        4
    };
    // SAFETY: the flags promise a signature slot at `index`.
    let pointer = unsafe { *block.descriptor.add(index) }.cast::<c_char>();
    // SAFETY: the slot holds a C string.
    (!pointer.is_null()).then(|| unsafe { CStr::from_ptr(pointer) })
}

/// Answers "suppress", or defers to AppKit for a completion it does not know.
unsafe extern "C-unwind" fn suppress_check(
    context: *mut AnyObject,
    selector: Sel,
    completion: *mut Block,
) {
    // SAFETY: AppKit passes a live completion block or nil.
    if !completion.is_null() && unsafe { signature(completion) } == Some(BOOL_COMPLETION) {
        // SAFETY: the signature matches `BoolCompletion`.
        unsafe {
            let invoke: BoolCompletion = transmute((*completion).invoke);
            invoke(completion, Bool::YES);
        }
        return;
    }

    let original = ORIGINAL
        .get()
        .expect("the original check is stored before it is replaced");
    // SAFETY: forwards AppKit's own arguments.
    unsafe { original(context, selector, completion) };
}

/// Replaces AppKit's private check for the Writing Tools button. A changed
/// check is logged and left alone.
pub(crate) fn suppress_affordance_check() {
    let selector = sel!(_shouldSuppressWritingToolsAffordanceWithCompletionHandler:);
    let Some(method) =
        AnyClass::get(c"NSTextInputContext").and_then(|class| class.instance_method(selector))
    else {
        log::error!("could not find AppKit's Writing Tools check");
        return;
    };
    if method.return_type().to_bytes() != b"v"
        || method.arguments_count() != 3
        || method.argument_type(2).as_deref().map(CStr::to_bytes) != Some(b"@?")
    {
        log::error!("AppKit's Writing Tools check changed its signature");
        return;
    }

    // SAFETY: the encoding checked above matches `SuppressCheck`.
    let original: SuppressCheck = unsafe { transmute(method.implementation()) };
    let _ = ORIGINAL.set(original);
    // SAFETY: same signature, and unknown completions reach the original.
    unsafe { method.set_implementation(transmute::<SuppressCheck, Imp>(suppress_check)) };
}
