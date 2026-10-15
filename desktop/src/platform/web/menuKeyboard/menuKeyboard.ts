import { isTouchWeb } from "@/shared/lib/touchFocus";

// Web/PWA only: the software keyboard and menus/pickers are mutually exclusive. Opening a menu, picker, context
// menu or phone message-action row blurs the focused text field first (so nothing opens behind the keyboard and
// popups anchor against the real viewport); focusing a text field closes any open menu/picker.

const POPPER = "[data-radix-popper-content-wrapper]";
const ROW_OPEN = "data-phone-actions-open";

function isTextField(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement)
    return !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/.test(
      el.type,
    );
  return false;
}

function blurField(except?: Element | null) {
  const el = document.activeElement;
  if (!isTextField(el)) return;
  if (except && except.contains(el)) return;
  el.blur();
}

export function installMenuKeyboardExclusion(): void {
  if (typeof document === "undefined") return;

  // Touch: a text field inside a popup that gains focus without being tapped itself (autoFocus / focus-on-open)
  // right after the opening tap is blurred, so the keyboard appears only when the user taps the field.
  let lastPointer: { target: EventTarget | null; at: number } = {
    target: null,
    at: 0,
  };
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointer = { target: event.target, at: Date.now() };
    },
    true,
  );
  document.addEventListener(
    "focusin",
    (event) => {
      if (!isTouchWeb()) return;
      const field = event.target as Element | null;
      if (!isTextField(field) || !field.closest(POPPER)) return;
      const tappedField =
        lastPointer.target instanceof Node &&
        field.contains(lastPointer.target);
      if (!tappedField && Date.now() - lastPointer.at < 1500) {
        queueMicrotask(() => field.blur());
      }
    },
    true,
  );

  // A menu/picker trigger (Radix sets aria-haspopup) or a right-click/long-press context menu: close the keyboard.
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as Element | null;
      const trigger = target?.closest?.(
        '[aria-haspopup]:not([aria-haspopup="false"])',
      );
      if (!trigger || isTextField(trigger) || trigger.closest(POPPER)) return;
      blurField();
    },
    true,
  );
  document.addEventListener("contextmenu", () => blurField(), true);

  // Popups or phone action rows that open without a trigger tap (long-press, programmatic).
  new MutationObserver((records) => {
    for (const r of records) {
      if (
        r.type === "attributes" &&
        r.attributeName === ROW_OPEN &&
        (r.target as Element).hasAttribute(ROW_OPEN)
      ) {
        blurField();
        return;
      }
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue;
        const popper = node.matches(POPPER) ? node : node.querySelector(POPPER);
        if (!popper) continue;
        const content = popper.firstElementChild;
        // Typing-driven popups (mention/autocomplete) stay alongside the keyboard; only menus/dialog pickers blur.
        const role = content?.getAttribute("role");
        if (
          role === "menu" ||
          role === "dialog" ||
          popper.querySelector("em-emoji-picker")
        )
          blurField(popper);
        return;
      }
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [ROW_OPEN],
  });

  // Focusing a text field outside any popup closes open menus/pickers (Esc reaches only the topmost Radix layer,
  // so a dialog behind the menu stays open) and any open phone action row.
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target as Element | null;
      if (!isTextField(target) || target.closest(POPPER)) return;
      for (const row of document.querySelectorAll(`[${ROW_OPEN}]`))
        row.removeAttribute(ROW_OPEN);
      if (document.querySelector(POPPER)) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    true,
  );
}
