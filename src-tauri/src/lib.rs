use std::{
  io::{Read, Write},
  net::{TcpListener, TcpStream},
  sync::Mutex,
  thread,
  time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

struct SidecarState {
  child: Mutex<Option<CommandChild>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let handle = app.handle().clone();
      let port = reserve_port()?;
      let token = generate_token()?;
      let allowed_origin = if tauri::is_dev() {
        "http://localhost:3000"
      } else {
        "tauri://localhost"
      };

      let (mut rx, child) = handle
        .shell()
        .sidecar("server")?
        .envs([
          ("PORT", port.to_string()),
          ("APP_TOKEN", token.clone()),
          ("APP_ORIGIN", allowed_origin.to_string()),
        ])
        .spawn()?;

      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          match event {
            CommandEvent::Stdout(line) => {
              log::info!("server sidecar: {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Stderr(line) => {
              log::warn!("server sidecar: {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Error(error) => {
              log::error!("server sidecar error: {error}");
            }
            CommandEvent::Terminated(payload) => {
              log::info!("server sidecar exited with code {:?}", payload.code);
            }
          }
        }
      });

      let mut child = Some(child);

      if let Err(error) = wait_for_health(port, Duration::from_secs(30)) {
        if let Some(child) = child.take() {
          let _ = child.kill();
        }
        return Err(error.into());
      }

      let init_script = format!(
        "window.__APP_PORT__ = {port}; window.__APP_TOKEN__ = {};",
        serde_json::to_string(&token).expect("token serialization should not fail")
      );

      if let Err(error) = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("freelance-flow-control")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .fullscreen(false)
        .initialization_script(init_script)
        .build()
      {
        if let Some(child) = child.take() {
          let _ = child.kill();
        }
        return Err(error.into());
      }

      app.manage(SidecarState {
        child: Mutex::new(child),
      });

      Ok(())
    })
    .on_event(|app, event| {
      if matches!(event, RunEvent::Exit) {
        stop_sidecar(app);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn reserve_port() -> std::io::Result<u16> {
  let listener = TcpListener::bind(("127.0.0.1", 0))?;
  let port = listener.local_addr()?.port();
  drop(listener);
  Ok(port)
}

fn generate_token() -> std::io::Result<String> {
  let mut bytes = [0u8; 32];
  getrandom::fill(&mut bytes).map_err(std::io::Error::other)?;

  let mut token = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    use std::fmt::Write as _;
    write!(&mut token, "{:02x}", byte).map_err(std::io::Error::other)?;
  }

  Ok(token)
}

fn wait_for_health(port: u16, timeout: Duration) -> std::io::Result<()> {
  let deadline = Instant::now() + timeout;

  loop {
    if health_check(port)? {
      return Ok(());
    }

    if Instant::now() >= deadline {
      return Err(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        format!("sidecar did not become healthy on port {port}"),
      ));
    }

    thread::sleep(Duration::from_millis(150));
  }
}

fn health_check(port: u16) -> std::io::Result<bool> {
  let mut stream = TcpStream::connect(("127.0.0.1", port))?;
  stream.set_read_timeout(Some(Duration::from_secs(2)))?;
  stream.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")?;

  let mut response = String::new();
  stream.read_to_string(&mut response)?;

  Ok(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
}

fn stop_sidecar(app: &AppHandle) {
  if let Some(state) = app.try_state::<SidecarState>() {
    if let Some(child) = state.child.lock().ok().and_then(|mut guard| guard.take()) {
      let _ = child.kill();
    }
  }
}
