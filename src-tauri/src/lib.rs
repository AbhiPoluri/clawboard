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
fn ollama_installed() -> bool {
    which::which("ollama").is_ok()
}

#[tauri::command]
fn ollama_list_models() -> Vec<String> {
    let output = Command::new("ollama").args(["list"]).output();
    match output {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            text.lines()
                .skip(1) // skip header
                .filter_map(|line| line.split_whitespace().next())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        }
        Err(_) => vec![],
    }
}

#[tauri::command]
fn ollama_pull(model: String) -> Result<String, String> {
    let output = Command::new("ollama")
        .args(["pull", &model])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn vllm_check(base_url: String) -> bool {
    // Try hitting /v1/models — standard OpenAI-compatible endpoint
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let output = Command::new("curl")
        .args(["-sf", "--max-time", "2", &url])
        .output();
    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
fn vllm_list_models(base_url: String) -> Vec<String> {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let output = Command::new("curl")
        .args(["-sf", "--max-time", "3", &url])
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            // Parse {"data": [{"id": "model-name"}, ...]}
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                val["data"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v["id"].as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default()
            } else {
                vec![]
            }
        }
        _ => vec![],
    }
}

/// Install openclaw via npm (no terminal needed)
#[tauri::command]
fn install_openclaw() -> Result<String, String> {
    // Find npm in common locations
    let npm = ["npm", "/usr/local/bin/npm", "/opt/homebrew/bin/npm"]
        .iter()
        .find(|p| which::which(p).is_ok() || std::path::Path::new(p).exists())
        .copied()
        .ok_or("npm not found — install Node.js from nodejs.org")?;

    let output = Command::new(npm)
        .args(["install", "-g", "openclaw"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("OpenClaw installed successfully.".to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Install Ollama on macOS via curl | sh (no terminal needed)
#[tauri::command]
fn install_ollama() -> Result<String, String> {
    // On macOS, Ollama has a .app installer — open the download page
    let output = Command::new("open")
        .args(["https://ollama.ai/download"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok("Opened ollama.ai/download in your browser.".to_string())
    } else {
        Err("Could not open browser.".to_string())
    }
}

/// Check if Node.js / npm is available
#[tauri::command]
fn node_installed() -> bool {
    which::which("node").is_ok()
        || std::path::Path::new("/usr/local/bin/node").exists()
        || std::path::Path::new("/opt/homebrew/bin/node").exists()
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
            ollama_installed,
            ollama_list_models,
            ollama_pull,
            vllm_check,
            vllm_list_models,
            install_openclaw,
            install_ollama,
            node_installed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
