// "Sign in with your desktop": scan the QR code the Hula Buzz desktop shows (Settings → Desktop signing → Show code) or
// paste its bunker:// code. Inline styles: also rendered on the unlock screen before the app CSS loads.
import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { isDesktopBunkerUri } from "./signer/desktopBunker";

const INK = "#171717";
const pill: React.CSSProperties = {
  height: 38,
  padding: "0 20px",
  borderRadius: 999,
  border: 0,
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  boxSizing: "border-box",
};
const primary: React.CSSProperties = {
  ...pill,
  background: INK,
  color: "#fff",
};
const ghost: React.CSSProperties = {
  ...pill,
  height: 36,
  background: "rgba(23,23,23,0.1)",
  color: INK,
};
const off: React.CSSProperties = {
  ...pill,
  background: "rgba(23,23,23,0.06)",
  color: "#a3a3a3",
  cursor: "not-allowed",
};
const input: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #e5e5e5",
  background: "#fff",
  color: INK,
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};
const note: React.CSSProperties = { color: "#737373", fontSize: 13, margin: 0 };

/** Camera QR scanner; calls onCode with the first desktop sign-in code it sees. */
function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (done) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        await v.play().catch(() => undefined);
        timer = setInterval(() => {
          if (!ctx || !v.videoWidth) return;
          const scale = Math.min(1, 640 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const r = jsQR(img.data, img.width, img.height, {
            inversionAttempts: "dontInvert",
          });
          if (!r?.data) return;
          if (isDesktopBunkerUri(r.data)) {
            done = true;
            clearInterval(timer);
            onCode(r.data.trim());
          } else
            setHint("That QR code isn't a Hula Buzz desktop sign-in code.");
        }, 250);
      } catch (e) {
        setErr(
          e instanceof Error &&
            /denied|NotAllowed/i.test(`${e.name} ${e.message}`)
            ? "Camera access was denied. Allow the camera for this app in Settings, or paste the code instead."
            : "The camera isn't available here. Paste the code instead.",
        );
      }
    })();
    return () => {
      done = true;
      clearInterval(timer);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [onCode]);
  return (
    <div
      style={{ display: "grid", gap: 8 }}
      data-testid="desktop-signin-scanner"
    >
      {err ? (
        <p style={{ ...note, color: "#dc2626" }}>{err}</p>
      ) : (
        <video
          ref={video}
          muted
          playsInline
          style={{
            width: "100%",
            maxHeight: 320,
            borderRadius: 12,
            background: "#000",
            objectFit: "cover",
          }}
        />
      )}
      {hint && <p style={{ ...note, color: "#a16207" }}>{hint}</p>}
      <button type="button" style={ghost} onClick={onClose}>
        Stop scanning
      </button>
    </div>
  );
}

/**
 * `connect(code)` does the pairing (sign in, or add the desktop to this session) and resolves when the desktop clicked
 * Allow; its rejection message is shown.
 */
export function DesktopSignInPanel({
  connect,
  cta = "Sign in with your desktop",
}: {
  connect: (code: string) => Promise<unknown>;
  cta?: string;
}) {
  const [code, setCode] = useState("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (c: string) => {
    setScan(false);
    setErr(null);
    if (!isDesktopBunkerUri(c)) {
      setErr(
        "That isn't a desktop sign-in code. On your desktop open Settings → Desktop signing → Show code.",
      );
      return;
    }
    setBusy(true);
    try {
      await connect(c.trim());
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(
        /didn't respond|timeout|in time/i.test(m)
          ? "Your desktop didn't answer. Make sure Hula Buzz is open on it and the code hasn't expired, then try again."
          : /expired|invalid/i.test(m)
            ? "That code was already used or has expired. Show a new one on your desktop."
            : /declined/i.test(m)
              ? "Declined on your desktop."
              : m,
      );
    }
    setBusy(false);
  };
  return (
    <div style={{ display: "grid", gap: 8 }} data-testid="desktop-signin-panel">
      <p style={note}>
        On your desktop, open Hula Buzz → Settings → Desktop signing → Show
        code. Then scan it here, or paste it. You'll click Allow on the desktop.
        Needs the latest Hula Buzz desktop.
      </p>
      {busy ? (
        <p style={note} data-testid="desktop-signin-waiting">
          Waiting for you to click Allow on your desktop…
        </p>
      ) : scan ? (
        <Scanner onCode={(c) => void run(c)} onClose={() => setScan(false)} />
      ) : (
        <>
          <button
            type="button"
            style={primary}
            onClick={() => setScan(true)}
            data-testid="desktop-signin-scan"
          >
            Scan QR code
          </button>
          <input
            style={input}
            placeholder="bunker://… (desktop sign-in code)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="desktop-signin-input"
          />
          <button
            type="button"
            style={code.trim() ? ghost : off}
            disabled={!code.trim()}
            onClick={() => void run(code)}
            data-testid="desktop-signin-go"
          >
            {cta}
          </button>
        </>
      )}
      {err && (
        <p
          role="alert"
          style={{ ...note, color: "#dc2626" }}
          data-testid="desktop-signin-error"
        >
          {err}
        </p>
      )}
    </div>
  );
}
