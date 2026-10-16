// The desktop shell: one window around the web app (dist/). Everything else is in the web code —
// saves go through tauri-plugin-fs into the app data folder (src/lib/desktop.ts), exports through the
// save dialog, links to the web through the system browser.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("Cunmu could not start");
}
