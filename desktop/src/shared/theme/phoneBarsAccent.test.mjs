import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const bars = await import("./phoneBarsAccent.ts");
const DEFAULT = "#3b82f6";

test("Use accent color for phone bars is on by default and saved on this device", () => {
  values.clear();
  assert.equal(bars.isPhoneBarsAccentOn(), true);
  let calls = 0;
  const off = bars.subscribePhoneBarsAccent(() => calls++);
  bars.setPhoneBarsAccent(false);
  assert.equal(values.get(bars.PHONE_BARS_ACCENT_KEY), "0");
  assert.equal(bars.isPhoneBarsAccentOn(), false);
  bars.setPhoneBarsAccent(true);
  assert.equal(values.has(bars.PHONE_BARS_ACCENT_KEY), false);
  assert.equal(bars.isPhoneBarsAccentOn(), true);
  assert.equal(calls, 2, "live update: subscribers hear both changes");
  off();
});

test("Buzz themes use the accent the user picked for the bars; no pick or Neutral = no accent", () => {
  const r = (storedAccent) =>
    bars.resolvePhoneBarsAccent({
      buzzTheme: true,
      storedAccent,
      defaultAccent: DEFAULT,
    });
  assert.equal(r("#ec4899"), "#ec4899");
  assert.equal(r(null), null);
  assert.equal(r("neutral"), null);
});

test("other themes use the applied accent (stored or default); Neutral = no accent", () => {
  const r = (storedAccent) =>
    bars.resolvePhoneBarsAccent({
      buzzTheme: false,
      storedAccent,
      defaultAccent: DEFAULT,
    });
  assert.equal(r("#22c55e"), "#22c55e");
  assert.equal(r(null), DEFAULT);
  assert.equal(r("neutral"), null);
  assert.equal(r("not-a-colour"), null);
});

test("phone.css: accent mode reads --phone-bars-accent, plain mode the theme foreground, desktop app --primary", () => {
  const css = readFileSync(
    new URL("../styles/globals/phone.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\[data-phone\]\[data-phone-bars="accent"\] \{\s*--phone-bars-raw: hsl\(var\(--phone-bars-accent/,
  );
  assert.match(
    css,
    /\[data-phone\]\[data-phone-bars="plain"\] \{\s*--phone-bars-raw: hsl\(var\(--foreground\)\);/,
  );
  assert.match(
    css,
    /\[data-phone\] \{[^}]*--phone-bars-raw: hsl\(var\(--primary\)\);/,
  );
});

test("Settings: the toggle sits right under the accent picker, web only, only when there is an accent", () => {
  const panels = readFileSync(
    new URL("../../features/settings/ui/SettingsPanels.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    panels,
    /webRuntime && !accentPickerHidden && phoneBarsAccentFor\(themeName\) !== null/,
  );
  const picker = panels.lastIndexOf("<AccentPickerContent");
  const toggle = panels.indexOf(
    "{showPhoneBarsAccent ? <PhoneBarsAccentSetting /> : null}",
  );
  const glass = panels.indexOf("<GlassBackgroundSetting />");
  assert.ok(picker > 0 && toggle > picker && glass > toggle);
  assert.match(
    panels,
    /const accentPickerHidden = buzzThemeSelected && !webRuntime;/,
  );
});
