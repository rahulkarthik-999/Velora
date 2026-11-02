use std::path::PathBuf;

fn main() {
    build_whisper();
    tauri_build::build()
}

/// Builds the pinned whisper.cpp (CPU backend) and the C shim in native/.
fn build_whisper() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let src = manifest_dir.join("third_party").join("whisper.cpp");
    if !src.join("CMakeLists.txt").exists() {
        panic!(
            "whisper.cpp source not found at {}.\nRun scripts/fetch-whisper.ps1 from the repo root first.",
            src.display()
        );
    }

    // Always build whisper.cpp optimised: a debug build is far too slow to use.
    // The baseline is AVX2 (no -march=native), so the exe runs on any AVX2 CPU,
    // not just the build machine. The app checks for AVX2 before loading a model.
    // Static C/C++ runtime (/MT) to match Rust's crt-static, so the exe doesn't need MSVCP140.dll.
    let dst = cmake::Config::new(&src)
        .profile("Release")
        .static_crt(true)
        .define("CMAKE_POLICY_DEFAULT_CMP0091", "NEW")
        .define("CMAKE_MSVC_RUNTIME_LIBRARY", "MultiThreaded")
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("WHISPER_BUILD_TESTS", "OFF")
        .define("WHISPER_BUILD_EXAMPLES", "OFF")
        .define("WHISPER_BUILD_SERVER", "OFF")
        .define("WHISPER_SDL2", "OFF")
        .define("GGML_NATIVE", "OFF")
        .define("GGML_AVX", "ON")
        .define("GGML_AVX2", "ON")
        .define("GGML_FMA", "ON")
        .define("GGML_F16C", "ON")
        .define("GGML_BMI2", "OFF")
        .define("GGML_AVX512", "OFF")
        // OpenMP would add a vcomp140.dll dependency; ggml's own thread pool is used instead.
        .define("GGML_OPENMP", "OFF")
        .define("GGML_CCACHE", "OFF")
        .build();

    let lib = dst.join("lib");
    println!("cargo:rustc-link-search=native={}", lib.display());
    for name in ["whisper", "ggml", "ggml-base", "ggml-cpu"] {
        println!("cargo:rustc-link-lib=static={name}");
    }
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-lib=advapi32");

    cc::Build::new()
        .static_crt(true)
        .file(manifest_dir.join("native").join("velora_whisper.c"))
        .include(src.join("include"))
        .include(src.join("ggml").join("include"))
        .flag_if_supported("/std:c11")
        .compile("velora_whisper");

    println!("cargo:rerun-if-changed=native/velora_whisper.c");
    println!("cargo:rerun-if-changed=third_party/whisper.cpp/.velora-version");
}
