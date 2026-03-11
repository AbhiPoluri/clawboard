use std::path::PathBuf;
use std::process::Command;

fn openclaw_config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openclaw").join("openclaw.json")
}

#[tauri::command]
fn read_config() -> Result<String, String> {
    let path = openclaw_config_path();
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_config(content: String) -> Result<(), String> {
    let path = openclaw_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn openclaw_installed() -> bool {
    which::which("openclaw").is_ok()
}

#[tauri::command]
fn openclaw_status() -> String {
    let output = Command::new("openclaw")
        .args(["status", "--json"])
        .output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => r#"{"running": false}"#.to_string(),
    }
}

#[tauri::command]
fn openclaw_doctor() -> String {
    let output = Command::new("openclaw").args(["doctor"]).output();
    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(e) => format!("Error: {}", e),
    }
}

#[tauri::command]
fn openclaw_start() -> Result<(), String> {
    Command::new("openclaw")
        .args(["start"])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn openclaw_stop() -> Result<(), String> {
    Command::new("openclaw")
        .args(["stop"])
        .output()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_config,
            write_config,
            openclaw_installed,
            openclaw_status,
            openclaw_doctor,
            openclaw_start,
            openclaw_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
