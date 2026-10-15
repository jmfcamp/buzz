//! Tailscale integration. The user manages Tailscale: this module only DETECTS it and, when asked, adds/removes
//! one `tailscale serve` entry on a single https port that this app owns. It never installs, starts, signs in,
//! resets other serve config, or uses funnel.
use std::path::PathBuf;
use std::process::Stdio;

use serde_json::Value;
use tokio::process::Command;

/// The tailnet https port this app publishes on (the user's own serve entries on other ports are untouched).
pub const SERVE_PORT: u16 = 9443;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TailscaleStatus {
    pub up: bool,
    pub dns_name: Option<String>,
    pub addrs: Vec<String>,
    /// Human reason shown next to the disabled switch.
    pub reason: Option<String>,
}

impl TailscaleStatus {
    pub fn down(reason: impl Into<String>) -> Self {
        Self { up: false, dns_name: None, addrs: vec![], reason: Some(reason.into()) }
    }
}

/// Parses `tailscale status --json`. "Up" means BackendState == Running and a tailnet address exists.
pub fn parse_status(json: &str) -> TailscaleStatus {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return TailscaleStatus::down("Couldn't read Tailscale's status.");
    };
    let state = v.get("BackendState").and_then(Value::as_str).unwrap_or("");
    if state != "Running" {
        return TailscaleStatus::down(match state {
            "NeedsLogin" | "NeedsMachineAuth" => "Tailscale needs you to sign in on this Mac.",
            "Stopped" => "Tailscale is turned off on this Mac.",
            _ => "Tailscale isn't running on this Mac.",
        });
    }
    let me = v.get("Self");
    let addrs: Vec<String> = me
        .and_then(|s| s.get("TailscaleIPs"))
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let dns = me
        .and_then(|s| s.get("DNSName"))
        .and_then(Value::as_str)
        .map(|s| s.trim_end_matches('.').to_string())
        .filter(|s| !s.is_empty());
    if addrs.is_empty() {
        return TailscaleStatus::down("This Mac has no tailnet address yet.");
    }
    TailscaleStatus { up: true, dns_name: dns, addrs, reason: None }
}

/// True if `serve status --json` has an entry for our port that proxies to loopback (i.e. one we created).
pub fn owns_entry(serve_json: &str, port: u16) -> bool {
    let Ok(v) = serde_json::from_str::<Value>(serve_json) else { return false };
    let Some(web) = v.get("Web").and_then(Value::as_object) else { return false };
    web.iter().any(|(host, cfg)| {
        host.ends_with(&format!(":{port}"))
            && cfg
                .get("Handlers")
                .and_then(Value::as_object)
                .map(|h| h.values().any(|x| x.get("Proxy").and_then(Value::as_str).map_or(false, |p| p.contains("127.0.0.1") || p.contains("localhost"))))
                .unwrap_or(false)
    })
}

/// The loopback port our https entry proxies to, if `serve status --json` has a loopback entry on `port`.
pub fn entry_target(serve_json: &str, port: u16) -> Option<u16> {
    let v: Value = serde_json::from_str(serve_json).ok()?;
    let web = v.get("Web")?.as_object()?;
    web.iter().filter(|(host, _)| host.ends_with(&format!(":{port}"))).find_map(|(_, cfg)| {
        cfg.get("Handlers")?.as_object()?.values().find_map(|x| {
            let p = x.get("Proxy")?.as_str()?;
            let rest = p.strip_prefix("http://127.0.0.1:").or_else(|| p.strip_prefix("http://localhost:"))?;
            rest.trim_end_matches('/').split('/').next()?.parse().ok()
        })
    })
}

/// Turns a raw `tailscale serve` failure into something a user can act on.
pub fn friendly_serve_error(raw: &str) -> String {
    let l = raw.to_ascii_lowercase();
    if l.contains("access denied") || l.contains("permission") || l.contains("operator") {
        "Tailscale didn't let Hula Buzz publish Direct (serve not permitted). In Tailscale, allow this user to manage serve, or run `sudo tailscale set --operator=$USER` once.".into()
    } else if l.contains("https") && (l.contains("not enabled") || l.contains("enable")) {
        "HTTPS certificates are off for your tailnet. Turn on HTTPS in the Tailscale admin console (DNS page), then try again.".into()
    } else if l.contains("serve") && l.contains("not") && l.contains("allow") {
        "Your tailnet policy doesn't allow Tailscale Serve on this Mac.".into()
    } else if raw.trim().is_empty() {
        "Tailscale couldn't publish Direct on port 9443.".into()
    } else {
        format!("Tailscale couldn't publish Direct: {}", raw.trim())
    }
}

/// Health of our https entry, reported to settings and to the web via the heartbeat.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServeHealth {
    Off,
    /// Published: https port -> our loopback port.
    On,
    /// Tailscale is down; the listener stays up and the entry is re-added when it returns.
    Waiting(String),
    /// Another live app on this Mac owns the https port; we don't take it from them.
    Conflict(u16),
    Error(String),
}

#[allow(async_fn_in_trait)]
pub trait TailscaleCli: Send + Sync {
    /// Is something listening on this loopback port? (Used to tell a live entry from one left by a crash.)
    async fn port_alive(&self, port: u16) -> bool {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        tokio::time::timeout(std::time::Duration::from_millis(500), tokio::net::TcpStream::connect(addr))
            .await
            .map_or(false, |r| r.is_ok())
    }
    async fn status(&self) -> TailscaleStatus;
    async fn serve_status_json(&self) -> Option<String>;
    async fn serve_on(&self, https_port: u16, local_port: u16) -> Result<(), String>;
    async fn serve_off(&self, https_port: u16) -> Result<(), String>;
}

pub struct SystemTailscale;

impl SystemTailscale {
    pub fn bin() -> Option<PathBuf> {
        ["/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file())
            .or_else(|| std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join("tailscale")).find(|c| c.is_file())))
    }
    async fn run(args: &[&str]) -> Result<String, String> {
        let bin = Self::bin().ok_or("Tailscale isn't installed on this Mac.")?;
        let out = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            Command::new(bin).args(args).stdin(Stdio::null()).kill_on_drop(true).output(),
        )
        .await
        .map_err(|_| "Tailscale didn't answer in time.".to_string())?
        .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }
}

impl TailscaleCli for SystemTailscale {
    async fn status(&self) -> TailscaleStatus {
        match Self::run(&["status", "--json"]).await {
            Ok(j) => parse_status(&j),
            Err(e) => TailscaleStatus::down(e),
        }
    }
    async fn serve_status_json(&self) -> Option<String> {
        Self::run(&["serve", "status", "--json"]).await.ok()
    }
    async fn serve_on(&self, https_port: u16, local_port: u16) -> Result<(), String> {
        let https = format!("--https={https_port}");
        let target = format!("http://127.0.0.1:{local_port}");
        Self::run(&["serve", "--bg", &https, &target]).await.map(|_| ())
    }
    async fn serve_off(&self, https_port: u16) -> Result<(), String> {
        let https = format!("--https={https_port}");
        Self::run(&["serve", &https, "off"]).await.map(|_| ())
    }
}

/// Owns the serve entry's lifecycle. Idempotent: `enable`/`tick` make sure https:`port` proxies to our loopback port,
/// re-adding it if something removed it, without touching other ports (443/8443) and without taking the port from
/// another live Hula Buzz on this Mac. A short Tailscale blip doesn't turn Direct off; a sustained one does.
pub struct ServeManager<T: TailscaleCli> {
    cli: T,
    port: u16,
    enabled: bool,
    local: Option<u16>,
    health: ServeHealth,
    down_ticks: u32,
}

/// Consecutive down polls (~10 s each) before Direct turns itself off.
pub const DOWN_TICKS_TO_OFF: u32 = 3;

#[derive(Debug, PartialEq, Eq)]
pub enum TickOutcome {
    Unchanged,
    /// Health changed (repaired, conflict, waiting...): re-publish status.
    Changed,
    /// Tailscale stayed down: the switch was turned off and the serve entry removed.
    TurnedOff,
}

impl<T: TailscaleCli> ServeManager<T> {
    pub fn new(cli: T) -> Self {
        Self { cli, port: SERVE_PORT, enabled: false, local: None, health: ServeHealth::Off, down_ticks: 0 }
    }
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }
    pub fn enabled(&self) -> bool {
        self.enabled
    }
    pub fn health(&self) -> &ServeHealth {
        &self.health
    }
    pub fn https_port(&self) -> u16 {
        self.port
    }
    pub async fn status(&self) -> TailscaleStatus {
        self.cli.status().await
    }
    /// Removes a leftover loopback entry on our port whose target is dead (crash). Never removes a live one: that's
    /// another running Hula Buzz (or this one) and removing it is what broke Direct before.
    pub async fn cleanup_stale(&self) {
        if let Some(j) = self.cli.serve_status_json().await {
            if let Some(t) = entry_target(&j, self.port) {
                if Some(t) != self.local && !self.cli.port_alive(t).await {
                    let _ = self.cli.serve_off(self.port).await;
                }
            }
        }
    }
    /// Make the entry point at `local_port`. `takeover` = explicit user action: replace a live entry of another app.
    async fn ensure(&mut self, local_port: u16, takeover: bool) -> ServeHealth {
        let current = self.cli.serve_status_json().await;
        let target = current.as_deref().and_then(|j| entry_target(j, self.port));
        let foreign = current.as_deref().map_or(false, |j| entry_target(j, self.port).is_none() && has_port(j, self.port));
        if target == Some(local_port) {
            return ServeHealth::On;
        }
        if foreign && !takeover {
            return ServeHealth::Error(format!("Port {} on this Mac's tailnet address is used by another Tailscale Serve entry.", self.port));
        }
        if let Some(t) = target {
            if !takeover && self.cli.port_alive(t).await {
                return ServeHealth::Conflict(t);
            }
        }
        match self.cli.serve_on(self.port, local_port).await {
            Ok(()) => ServeHealth::On,
            Err(e) => ServeHealth::Error(friendly_serve_error(&e)),
        }
    }
    /// Turns the switch on. Refuses unless Tailscale is already up; never brings it up.
    pub async fn enable(&mut self, local_port: u16) -> Result<TailscaleStatus, String> {
        let st = self.cli.status().await;
        if !st.up {
            return Err(st.reason.clone().unwrap_or_else(|| "Tailscale isn't running on this Mac.".into()));
        }
        self.local = Some(local_port);
        self.cleanup_stale().await;
        let h = self.ensure(local_port, true).await;
        if let ServeHealth::Error(e) = &h {
            self.local = None;
            self.health = ServeHealth::Off;
            return Err(e.clone());
        }
        self.health = h;
        self.enabled = true;
        self.down_ticks = 0;
        Ok(st)
    }
    /// Removes our entry only if it still points at us; leaves another app's entry and other ports alone.
    pub async fn disable(&mut self) {
        if self.enabled {
            let ours = match self.cli.serve_status_json().await {
                Some(j) => entry_target(&j, self.port) == self.local,
                None => true,
            };
            if ours {
                let _ = self.cli.serve_off(self.port).await;
            }
        }
        self.enabled = false;
        self.local = None;
        self.health = ServeHealth::Off;
        self.down_ticks = 0;
    }
    /// Call every ~10 s while enabled: re-adds a missing entry, tolerates brief Tailscale drops.
    pub async fn tick(&mut self) -> TickOutcome {
        let (true, Some(local)) = (self.enabled, self.local) else { return TickOutcome::Unchanged };
        let before = self.health.clone();
        let st = self.cli.status().await;
        if !st.up {
            self.down_ticks += 1;
            if self.down_ticks >= DOWN_TICKS_TO_OFF {
                self.disable().await;
                return TickOutcome::TurnedOff;
            }
            self.health = ServeHealth::Waiting(st.reason.unwrap_or_else(|| "Waiting for Tailscale.".into()));
        } else {
            self.down_ticks = 0;
            self.health = self.ensure(local, false).await;
        }
        if self.health == before { TickOutcome::Unchanged } else { TickOutcome::Changed }
    }
}

fn has_port(serve_json: &str, port: u16) -> bool {
    serde_json::from_str::<Value>(serve_json)
        .ok()
        .and_then(|v| v.get("Web").and_then(Value::as_object).map(|w| w.keys().any(|h| h.ends_with(&format!(":{port}")))))
        .unwrap_or(false)
}
