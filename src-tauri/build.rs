fn main() -> Result<(), Box<dyn std::error::Error>> {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS")?;
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV")?;
    let attributes = if target_os == "windows" && target_env == "msvc" {
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR")?)
            .join("windows_manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        // Tauri's resource manifest does not reach unit-test executables.
        // Link it directly so their Common Controls v6 imports resolve too.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
    } else {
        tauri_build::Attributes::new()
    };
    tauri_build::try_build(attributes)?;
    Ok(())
}
