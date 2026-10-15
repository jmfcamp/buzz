// Minimal in-memory Nostr relay on :3100 (AUTH/EVENT/REQ/CLOSE + stub HTTP) for UI-only e2e checks without the real relay stack.
import http from "node:http";
import { WebSocketServer } from "ws";
const events = [];
const subs = new Set();
const match = (f, e) => (!f.kinds || f.kinds.includes(e.kind)) && (!f.authors || f.authors.includes(e.pubkey)) && (!f.ids || f.ids.includes(e.id)) &&
  Object.keys(f).filter(k => k.startsWith("#")).every(k => e.tags.some(t => t[0] === k.slice(1) && f[k].includes(t[1])));
const srv = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "*"); res.setHeader("access-control-allow-methods", "*");
  if (req.method === "OPTIONS") { res.end(); return; }
  console.log("HTTP", req.method, req.url);
  res.setHeader("content-type", "application/json");
  res.end(req.url.includes("nip11") || req.headers.accept === "application/nostr+json" ? JSON.stringify({ name: "mock", supported_nips: [1, 42] }) : "[]");
});
const wss = new WebSocketServer({ server: srv });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify(["AUTH", "challenge-" + Math.random()]));
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m[0] === "AUTH") ws.send(JSON.stringify(["OK", m[1].id, true, ""]));
    else if (m[0] === "EVENT") { events.push(m[1]); ws.send(JSON.stringify(["OK", m[1].id, true, ""])); for (const s of subs) if (s.f.some(f => match(f, m[1]))) s.ws.send(JSON.stringify(["EVENT", s.id, m[1]])); }
    else if (m[0] === "REQ") { const [, id, ...f] = m; for (const e of events) if (f.some(x => match(x, e))) ws.send(JSON.stringify(["EVENT", id, e])); ws.send(JSON.stringify(["EOSE", id])); subs.add({ ws, id, f }); }
    else if (m[0] === "CLOSE") { for (const s of subs) if (s.ws === ws && s.id === m[1]) subs.delete(s); }
  });
  ws.on("close", () => { for (const s of subs) if (s.ws === ws) subs.delete(s); });
});
srv.listen(3100, "::", () => console.log("mock relay 3100"));
