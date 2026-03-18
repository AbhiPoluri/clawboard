use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

fn openclaw_config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openclaw").join("openclaw.json")
}

fn openclaw_log_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openclaw").join("openclaw.log")
}

fn openclaw_history_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openclaw").join("history.json")
}

// ── Config ──────────────────────────────────────────────────────────────────

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

// ── OpenClaw ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn openclaw_installed() -> bool {
    which::which("openclaw").is_ok()
}

#[tauri::command]
fn openclaw_status() -> String {
    let output = Command::new("openclaw").args(["status", "--json"]).output();
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

/// Read last N lines from openclaw log
#[tauri::command]
fn read_logs(lines: usize) -> String {
    let path = openclaw_log_path();
    if !path.exists() {
        return String::new();
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let all: Vec<&str> = content.lines().collect();
    let start = if all.len() > lines { all.len() - lines } else { 0 };
    all[start..].join("\n")
}

/// Stream openclaw log to frontend via "log-line" events
#[tauri::command]
async fn stream_logs(app: AppHandle) -> Result<(), String> {
    let path = openclaw_log_path();
    let app2 = app.clone();
    std::thread::spawn(move || {
        // Tail the log file — re-open and seek to end, then follow
        let mut last_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if let Ok(meta) = std::fs::metadata(&path) {
                let size = meta.len();
                if size > last_size {
                    if let Ok(f) = std::fs::File::open(&path) {
                        use std::io::Seek;
                        let mut reader = BufReader::new(f);
                        let _ = reader.seek(std::io::SeekFrom::Start(last_size));
                        for line in reader.lines().flatten() {
                            let _ = app2.emit("log-line", line);
                        }
                        last_size = size;
                    }
                }
            }
        }
    });
    Ok(())
}

// ── OpenClaw Channels ─────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ChannelStatus {
    pub name: String,
    pub connected: bool,
    pub description: String,
}

#[tauri::command]
fn get_channel_statuses() -> Vec<ChannelStatus> {
    let config_str = read_config().unwrap_or_default();
    let config: serde_json::Value = serde_json::from_str(&config_str).unwrap_or_default();
    let channels = config.get("channels");

    vec![
        ChannelStatus {
            name: "imessage".to_string(),
            connected: channels
                .and_then(|c| c.get("imessage"))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            description: "iMessage (macOS only)".to_string(),
        },
        ChannelStatus {
            name: "whatsapp".to_string(),
            connected: channels
                .and_then(|c| c.get("whatsapp"))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            description: "WhatsApp".to_string(),
        },
        ChannelStatus {
            name: "telegram".to_string(),
            connected: channels
                .and_then(|c| c.get("telegram"))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            description: "Telegram".to_string(),
        },
        ChannelStatus {
            name: "discord".to_string(),
            connected: channels
                .and_then(|c| c.get("discord"))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            description: "Discord".to_string(),
        },
        ChannelStatus {
            name: "slack".to_string(),
            connected: channels
                .and_then(|c| c.get("slack"))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            description: "Slack".to_string(),
        },
    ]
}

#[tauri::command]
fn enable_channel(channel: String, token: String) -> Result<(), String> {
    let raw = read_config().unwrap_or("{}".to_string());
    let mut config: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    if config.get("channels").is_none() {
        config["channels"] = serde_json::json!({});
    }
    config["channels"][&channel] = serde_json::json!({
        "enabled": true,
        "token": token
    });
    write_config(config.to_string())
}

#[tauri::command]
fn disable_channel(channel: String) -> Result<(), String> {
    let raw = read_config().unwrap_or("{}".to_string());
    let mut config: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    if let Some(channels) = config.get_mut("channels") {
        channels[&channel] = serde_json::json!({ "enabled": false });
    }
    write_config(config.to_string())
}

// ── Ollama ────────────────────────────────────────────────────────────────────

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
                .skip(1)
                .filter_map(|line| line.split_whitespace().next())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        }
        Err(_) => vec![],
    }
}

#[tauri::command]
async fn ollama_pull(app: AppHandle, model: String) -> Result<(), String> {
    let mut child = Command::new("ollama")
        .args(["pull", &model])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let app2 = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app2.emit("pull-progress", line);
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        let _ = app.emit("pull-progress", "Done!");
        Ok(())
    } else {
        Err("Pull failed".to_string())
    }
}

// ── vLLM ──────────────────────────────────────────────────────────────────────

#[tauri::command]
fn vllm_check(base_url: String) -> bool {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    Command::new("curl")
        .args(["-sf", "--max-time", "2", &url])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
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

// ── Persona ───────────────────────────────────────────────────────────────────

fn persona_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".openclaw").join("persona.json")
}

#[tauri::command]
fn read_persona() -> Result<String, String> {
    let path = persona_path();
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_persona(persona: String) -> Result<(), String> {
    let path = persona_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, persona).map_err(|e| e.to_string())
}

// ── Settings export / import ──────────────────────────────────────────────────

#[tauri::command]
fn export_settings() -> Result<String, String> {
    let config = read_config().unwrap_or("{}".to_string());
    let parsed: serde_json::Value = serde_json::from_str(&config).unwrap_or_default();
    let persona = read_persona().unwrap_or("{}".to_string());
    let persona_parsed: serde_json::Value = serde_json::from_str(&persona).unwrap_or_default();
    let combined = serde_json::json!({
        "config": parsed,
        "persona": persona_parsed,
    });
    serde_json::to_string_pretty(&combined).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_settings(data: String) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&data).map_err(|e| format!("Invalid JSON: {}", e))?;
    // Support both wrapped format {"config": ..., "persona": ...} and bare config
    if let Some(config) = parsed.get("config") {
        write_config(config.to_string())?;
    } else {
        write_config(data.clone())?;
    }
    if let Some(persona) = parsed.get("persona") {
        write_persona(persona.to_string())?;
    }
    Ok(())
}

// ── History ───────────────────────────────────────────────────────────────────

#[tauri::command]
fn read_history() -> String {
    let path = openclaw_history_path();
    if !path.exists() {
        return "[]".to_string();
    }
    std::fs::read_to_string(&path).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    let path = openclaw_history_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Export logs ───────────────────────────────────────────────────────────────

#[tauri::command]
async fn save_logs(content: String) -> Result<String, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Save Logs")
        .set_file_name("openclaw-logs.txt")
        .add_filter("Text files", &["txt"])
        .save_file()
        .await;

    match handle {
        Some(path) => {
            std::fs::write(path.path(), content).map_err(|e| e.to_string())?;
            Ok("Saved.".to_string())
        }
        None => Err("Cancelled".to_string()),
    }
}

// ── Install helpers ───────────────────────────────────────────────────────────

#[tauri::command]
fn node_installed() -> bool {
    which::which("node").is_ok()
        || std::path::Path::new("/usr/local/bin/node").exists()
        || std::path::Path::new("/opt/homebrew/bin/node").exists()
}

#[tauri::command]
fn install_openclaw() -> Result<String, String> {
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

#[tauri::command]
fn install_ollama() -> Result<String, String> {
    Command::new("open")
        .args(["https://ollama.ai/download"])
        .output()
        .map(|_| "Opened ollama.ai/download".to_string())
        .map_err(|e| e.to_string())
}

// ── Entry point ───────────────────────────────────────────────────────────────

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
            read_logs,
            stream_logs,
            get_channel_statuses,
            enable_channel,
            disable_channel,
            ollama_installed,
            ollama_list_models,
            ollama_pull,
            vllm_check,
            vllm_list_models,
            node_installed,
            install_openclaw,
            install_ollama,
            save_logs,
            read_persona,
            write_persona,
            export_settings,
            import_settings,
            read_history,
            clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
