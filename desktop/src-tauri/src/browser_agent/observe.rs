//! Observe event ring + page instrumentation script.

use std::collections::{HashMap, VecDeque};
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const RING_CAP: usize = 500;
const BODY_CAP: usize = 32_768;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObserveEvent {
    pub id: u64,
    pub webview_label: String,
    pub kind: String,
    pub at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Default)]
pub struct BrowserObserveBuffer {
    next_id: Mutex<u64>,
    rings: Mutex<HashMap<String, VecDeque<ObserveEvent>>>,
    root: Mutex<Option<PathBuf>>,
}

impl BrowserObserveBuffer {
    pub fn set_root(&self, root: PathBuf) {
        if let Ok(mut slot) = self.root.lock() {
            *slot = Some(root);
        }
    }

    pub fn push(&self, webview_label: &str, kind: &str, payload: Option<Value>, at_ms: u64) {
        let id = {
            let Ok(mut next) = self.next_id.lock() else {
                return;
            };
            let id = *next;
            *next = next.saturating_add(1);
            id
        };
        let event = ObserveEvent {
            id,
            webview_label: webview_label.to_string(),
            kind: kind.to_string(),
            at_ms,
            payload: payload.map(truncate_payload),
        };
        if let Ok(mut rings) = self.rings.lock() {
            let ring = rings.entry(webview_label.to_string()).or_default();
            if ring.len() >= RING_CAP {
                ring.pop_front();
            }
            ring.push_back(event.clone());
        }
        self.mirror_jsonl(&event);
    }

    pub fn poll(
        &self,
        webview_label: &str,
        after_id: u64,
        limit: usize,
    ) -> Vec<ObserveEvent> {
        let Ok(rings) = self.rings.lock() else {
            return Vec::new();
        };
        let Some(ring) = rings.get(webview_label) else {
            return Vec::new();
        };
        ring.iter()
            .filter(|e| e.id > after_id)
            .take(limit.max(1).min(200))
            .cloned()
            .collect()
    }

    pub fn clear(&self, webview_label: &str) {
        if let Ok(mut rings) = self.rings.lock() {
            rings.remove(webview_label);
        }
    }

    pub fn clear_surface_prefix(&self, prefix: &str) {
        if let Ok(mut rings) = self.rings.lock() {
            rings.retain(|k, _| !k.starts_with(prefix) && k != prefix);
        }
    }

    fn mirror_jsonl(&self, event: &ObserveEvent) {
        let Ok(root_guard) = self.root.lock() else {
            return;
        };
        let Some(root) = root_guard.as_ref() else {
            return;
        };
        let dir = root.join(&event.webview_label);
        if create_dir_all(&dir).is_err() {
            return;
        }
        let path = dir.join("events.jsonl");
        let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
            return;
        };
        if let Ok(line) = serde_json::to_string(event) {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn truncate_payload(value: Value) -> Value {
    match value {
        Value::Object(mut map) => {
            if let Some(Value::String(body)) = map.get("body").cloned() {
                if body.len() > BODY_CAP {
                    let truncated: String = body.chars().take(BODY_CAP).collect();
                    map.insert(
                        "body".into(),
                        Value::String(format!(
                            "{truncated}\n…[truncated {} chars]",
                            body.len().saturating_sub(BODY_CAP)
                        )),
                    );
                    map.insert("bodyTruncated".into(), Value::Bool(true));
                }
            }
            Value::Object(map)
        }
        other => other,
    }
}

/// Page script: console + fetch/XHR hooks + ghost-cursor helpers shared with Drive.
pub fn instrumentation_js(webview_label: &str, drive: bool) -> String {
    let label = serde_json::to_string(webview_label).unwrap_or_else(|_| "\"\"".into());
    let drive_flag = if drive { "true" } else { "false" };
    format!(
        r#"(function(){{
  if (window.__buzzBrowserAgent && window.__buzzBrowserAgent.label === {label}) {{
    window.__buzzBrowserAgent.setDrive({drive_flag});
    return 'already';
  }}
  var LABEL = {label};
  var DRIVE = {drive_flag};
  var q = [];
  var seq = 0;
  function push(kind, payload) {{
    q.push({{ id: ++seq, kind: kind, atMs: Date.now(), payload: payload || null }});
    if (q.length > 500) q.shift();
  }}
  function drain(afterId, limit) {{
    afterId = afterId || 0; limit = Math.min(Math.max(limit || 50, 1), 200);
    var out = [];
    for (var i = 0; i < q.length; i++) {{
      if (q[i].id > afterId) {{ out.push(q[i]); if (out.length >= limit) break; }}
    }}
    return JSON.stringify(out);
  }}
  ['log','info','warn','error','debug'].forEach(function(level) {{
    var orig = console[level];
    console[level] = function() {{
      try {{
        var args = Array.prototype.slice.call(arguments).map(function(a) {{
          try {{ return typeof a === 'string' ? a : JSON.stringify(a); }} catch (e) {{ return String(a); }}
        }});
        push('console', {{ level: level, args: args }});
      }} catch (e) {{}}
      return orig.apply(console, arguments);
    }};
  }});
  function headersObject(h) {{
    var o = {{}};
    try {{
      if (!h) return o;
      if (typeof h.forEach === 'function') {{ h.forEach(function(v,k){{ o[k]=v; }}); return o; }}
      if (Array.isArray(h)) {{ h.forEach(function(pair){{ if(pair&&pair[0]) o[pair[0]]=pair[1]; }}); return o; }}
      Object.keys(h).forEach(function(k){{ o[k]=h[k]; }});
    }} catch (e) {{}}
    return o;
  }}
  if (window.fetch) {{
    var ofetch = window.fetch.bind(window);
    window.fetch = function(input, init) {{
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';
      var reqBody = init && init.body != null ? String(init.body).slice(0, 32768) : null;
      return ofetch(input, init).then(function(res) {{
        var clone = res.clone();
        clone.text().then(function(text) {{
          push('network', {{
            phase: 'response', url: url, method: method,
            status: res.status, ok: res.ok,
            requestHeaders: headersObject(init && init.headers),
            responseHeaders: headersObject(res.headers),
            requestBody: reqBody,
            body: text.slice(0, 32768),
            bodyTruncated: text.length > 32768
          }});
        }}).catch(function() {{
          push('network', {{
            phase: 'response', url: url, method: method,
            status: res.status, ok: res.ok, body: null
          }});
        }});
        return res;
      }}).catch(function(err) {{
        push('network', {{ phase: 'error', url: url, method: method, error: String(err) }});
        throw err;
      }});
    }};
  }}
  (function() {{
    var XO = XMLHttpRequest.prototype.open;
    var XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {{
      this.__buzz = {{ method: method, url: String(url) }};
      return XO.apply(this, arguments);
    }};
    XMLHttpRequest.prototype.send = function(body) {{
      var self = this;
      var meta = self.__buzz || {{}};
      var reqBody = body != null ? String(body).slice(0, 32768) : null;
      self.addEventListener('loadend', function() {{
        push('network', {{
          phase: 'xhr', url: meta.url, method: meta.method,
          status: self.status, ok: self.status >= 200 && self.status < 400,
          requestBody: reqBody,
          body: (self.responseText || '').slice(0, 32768),
          bodyTruncated: (self.responseText || '').length > 32768
        }});
      }});
      return XS.apply(this, arguments);
    }};
  }})();
  push('nav', {{ url: location.href, title: document.title }});
  window.addEventListener('hashchange', function() {{
    push('nav', {{ url: location.href, title: document.title }});
  }});
  var cursor = document.getElementById('__buzz_agent_cursor');
  if (!cursor) {{
    cursor = document.createElement('div');
    cursor.id = '__buzz_agent_cursor';
    cursor.style.cssText = 'position:fixed;z-index:2147483646;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #ff6b00;border-radius:50%;background:rgba(255,107,0,0.25);pointer-events:none;display:none;transition:left 80ms linear,top 80ms linear,opacity 120ms;';
    document.documentElement.appendChild(cursor);
  }}
  var lock = document.getElementById('__buzz_agent_lock');
  if (!lock) {{
    lock = document.createElement('div');
    lock.id = '__buzz_agent_lock';
    lock.style.cssText = 'position:fixed;inset:0;z-index:2147483645;display:none;cursor:not-allowed;background:transparent;';
    document.documentElement.appendChild(lock);
  }}
  function setDrive(on) {{
    DRIVE = !!on;
    lock.style.display = DRIVE ? 'block' : 'none';
    cursor.style.display = DRIVE ? 'block' : 'none';
  }}
  function moveCursor(x, y, flash) {{
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    cursor.style.display = 'block';
    if (flash) {{
      cursor.style.opacity = '1';
      cursor.style.transform = 'scale(1.4)';
      setTimeout(function(){{ cursor.style.transform = 'scale(1)'; }}, 120);
    }}
  }}
  function clickAt(x, y) {{
    moveCursor(x, y, true);
    var el = document.elementFromPoint(x, y);
    if (!el) return JSON.stringify({{ ok:false, error:'no element' }});
    ['mouseover','mousedown','mouseup','click'].forEach(function(type) {{
      el.dispatchEvent(new MouseEvent(type, {{ bubbles:true, cancelable:true, clientX:x, clientY:y, view:window }}));
    }});
    return JSON.stringify({{ ok:true, tag: el.tagName }});
  }}
  function typeText(text, selector) {{
    var el = selector ? document.querySelector(selector) : document.activeElement;
    if (!el) return JSON.stringify({{ ok:false, error:'no target' }});
    el.focus();
    if ('value' in el) {{
      el.value = (el.value || '') + text;
      el.dispatchEvent(new Event('input', {{ bubbles:true }}));
      el.dispatchEvent(new Event('change', {{ bubbles:true }}));
    }} else if (el.isContentEditable) {{
      el.textContent = (el.textContent || '') + text;
    }}
    return JSON.stringify({{ ok:true }});
  }}
  function scrollBy(dx, dy) {{
    window.scrollBy(dx || 0, dy || 0);
    return JSON.stringify({{ ok:true, x: window.scrollX, y: window.scrollY }});
  }}
  window.__buzzBrowserAgent = {{
    label: LABEL,
    push: push,
    drain: drain,
    setDrive: setDrive,
    moveCursor: moveCursor,
    clickAt: clickAt,
    typeText: typeText,
    scrollBy: scrollBy
  }};
  setDrive(DRIVE);
  return 'ok';
}})();"#
    )
}

/// JS snippet that drains the in-page queue into a cookie for host readback.
pub fn drain_to_cookie_js(after_id: u64, limit: usize) -> String {
    format!(
        r#"(function(){{
  var agent = window.__buzzBrowserAgent;
  if (!agent) return;
  var raw = agent.drain({after_id}, {limit});
  try {{
    document.cookie = '__buzz_ba_drain=' + encodeURIComponent(raw) + '; path=/; SameSite=Lax';
  }} catch (e) {{}}
}})();"#
    )
}

pub const DRAIN_COOKIE: &str = "__buzz_ba_drain";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_polls_after_cursor() {
        let buf = BrowserObserveBuffer::default();
        buf.push("playground-a", "console", None, 1);
        buf.push("playground-a", "nav", None, 2);
        let first = buf.poll("playground-a", 0, 10);
        assert_eq!(first.len(), 2);
        let after = buf.poll("playground-a", first[0].id, 10);
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].kind, "nav");
    }

    #[test]
    fn instrumentation_mentions_network_and_cursor() {
        let js = instrumentation_js("playground-x", true);
        assert!(js.contains("fetch"));
        assert!(js.contains("__buzz_agent_cursor"));
        assert!(js.contains("setDrive"));
    }
}
