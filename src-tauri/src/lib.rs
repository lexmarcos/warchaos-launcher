use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
    pub remember: bool,
}

impl Default for Credentials {
    fn default() -> Self {
        Self {
            username: String::new(),
            password: String::new(),
            remember: true,
        }
    }
}

struct GameProcess(Mutex<Option<Child>>);

fn find_game_path(custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path {
        let p = std::path::Path::new(path);
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }

    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();

    let local = exe_dir.join("Bin64Release").join("Game.exe");
    if local.exists() {
        return Some(local.to_string_lossy().to_string());
    }

    if let Some(parent) = exe_dir.parent() {
        let parent_path = parent.join("Bin64Release").join("Game.exe");
        if parent_path.exists() {
            return Some(parent_path.to_string_lossy().to_string());
        }
    }

    let prog_path = std::path::Path::new(r"C:\Program Files\WarChaos\Bin64Release\Game.exe");
    if prog_path.exists() {
        return Some(prog_path.to_string_lossy().to_string());
    }

    None
}

#[tauri::command]
fn launch_game(username: String, password: String, custom_path: Option<String>, state: State<GameProcess>) -> Result<String, String> {
    if username.trim().is_empty() || password.trim().is_empty() {
        return Err("Usuario e senha sao obrigatorios.".into());
    }

    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = *guard {
            match child.try_wait() {
                Ok(Some(_)) => { *guard = None; }
                Ok(None) => return Err("O jogo ja esta em execucao.".into()),
                Err(_) => { *guard = None; }
            }
        }
    }

    let game_path = find_game_path(custom_path.as_deref())
        .ok_or("Game.exe nao encontrado. Verifique nas configuracoes.")?;

    let game_dir = std::path::Path::new(&game_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let child = Command::new(&game_path)
        .args([
            "+ui_show_cohtml", "0",
            "+sys_use_cohtml_ui", "0",
            "+r_DisplayInfo", "0",
            "-Language", "Portuguese",
            "-username", &username,
            "-password", &password,
        ])
        .current_dir(&game_dir)
        .spawn()
        .map_err(|e| format!("Erro ao iniciar o jogo: {}", e))?;

    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    Ok("Jogo iniciado com sucesso!".into())
}

#[tauri::command]
fn check_game_running(state: State<GameProcess>) -> bool {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if let Some(ref mut child) = *guard {
        match child.try_wait() {
            Ok(Some(_)) => { *guard = None; false }
            Ok(None) => true,
            Err(_) => { *guard = None; false }
        }
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(GameProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![launch_game, check_game_running])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
