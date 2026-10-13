# Buzz signer relay (wss://signer.huladesk.com)

A minimal Nostr relay for NIP-46 only (kind 24133):
- no storage
- no auth
- events must be validly signed
- per-IP and per-pubkey rate limits
- 30s ping keepalive

Deployed on the relay host as compose service `signer-relay` (project `buzz-prod`, overlay `compose.signer.yml`). It runs on its own `sr-net` network, and Caddy routes `signer.huladesk.com` to `signer-relay:7777`.

Build: `docker build -t hulabuzz/signer-relay:<date> .`

Smoke test with two throwaway clients: `node smoke.mjs wss://signer.huladesk.com`

Rollback:
1. Remove the `signer.huladesk.com` block from the Caddyfile, then run `caddy reload`.
2. `docker rm -f buzz-prod-signer-relay-1`
3. Web clients fall back to relay.primal.net.
