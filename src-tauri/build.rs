fn main() {
    // tauri-build reruns only when tauri.conf.json or capabilities change; the exe's icon resource
    // comes from icons/icon.ico, so a new icon must rebuild it too
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
