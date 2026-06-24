// Tauri v2 entry point. Registers the three plugins the desktop app relies on:
//   - http   : native requests that bypass CORS (replaces the fpd-cors-proxy)
//   - dialog : native Save-As dialog for .scn / ruleset exports
//   - fs     : writes the chosen file directly to disk
// The frontend (Vite + React) is served from ../dist in release and from the
// dev server in development (see tauri.conf.json build.devUrl).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
