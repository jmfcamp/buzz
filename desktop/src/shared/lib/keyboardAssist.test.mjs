import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const assist = await import("./keyboardAssist.ts");

test("keyboard assist is off by default and the composer keeps its old attributes", () => {
  values.clear();
  assert.equal(assist.isKeyboardAssistOn(), false);
  assert.deepEqual(assist.composerKeyboardAttrs(false), {
    autocapitalize: "none",
    autocorrect: "off",
    spellcheck: "true",
  });
  assert.equal(assist.searchKeyboardProps(false).autoCorrect, "off");
  assert.equal(assist.searchKeyboardProps(false).spellCheck, false);
});

test("turning it on enables autocorrect, sentence caps and spellcheck in the composer, and notifies", () => {
  values.clear();
  let calls = 0;
  const off = assist.subscribeKeyboardAssist(() => calls++);
  assist.setKeyboardAssist(true);
  assert.equal(values.get(assist.KEYBOARD_ASSIST_KEY), "1");
  assert.equal(assist.isKeyboardAssistOn(), true);
  assert.deepEqual(assist.composerKeyboardAttrs(true), {
    autocapitalize: "sentences",
    autocorrect: "on",
    spellcheck: "true",
  });
  // Search: corrections on, but never capitalized (from:/in: operators, @names).
  assert.deepEqual(assist.searchKeyboardProps(true), {
    autoCapitalize: "none",
    autoComplete: "off",
    autoCorrect: "on",
    spellCheck: true,
  });
  assist.setKeyboardAssist(false);
  assert.equal(values.has(assist.KEYBOARD_ASSIST_KEY), false);
  assert.equal(calls, 2);
  off();
});

test("the desktop app ignores the setting", () => {
  values.clear();
  assist.setKeyboardAssist(true);
  globalThis.isTauri = true;
  try {
    assert.equal(assist.isKeyboardAssistOn(), false);
  } finally {
    delete globalThis.isTauri;
    values.clear();
  }
});

test("Buzz Term props are always off", () => {
  assert.deepEqual(
    { ...assist.TERMINAL_KEYBOARD_PROPS },
    {
      autoCapitalize: "off",
      autoComplete: "off",
      autoCorrect: "off",
      spellCheck: false,
    },
  );
  assert.ok(Object.isFrozen(assist.TERMINAL_KEYBOARD_PROPS));
});
