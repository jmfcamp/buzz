import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

/** @type {(command: string, args?: unknown) => Promise<unknown>} */
let invokeImpl = async () => {
  throw new Error("unmocked Tauri command");
};

const media = {
  /** @type {Array<{ deviceId: string, kind: string, label: string }>} */
  devices: [],
  /** @type {{ audio?: boolean, video?: boolean } | null} */
  requested: null,
  stopped: false,
  async enumerateDevices() {
    return media.devices;
  },
  async getUserMedia(constraints) {
    media.requested = constraints;
    return {
      getTracks: () => [
        {
          stop() {
            media.stopped = true;
          },
        },
      ],
    };
  },
};

before(() => {
  Object.defineProperty(dom.window.navigator, "mediaDevices", {
    configurable: true,
    value: media,
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
  dom.window.__TAURI_INTERNALS__ = {
    invoke: (command, args) => invokeImpl(command, args),
    transformCallback: () => 0,
  };
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  media.devices = [];
  media.requested = null;
  media.stopped = false;
});

after(() => dom.window.close());

function savedDefaults() {
  return {
    version: 1,
    pushToTalk: true,
    microphoneDeviceId: "",
    speakerDeviceName: "",
    cameraDeviceId: "",
    microphoneGain: 1,
  };
}

async function renderCard(huddle) {
  invokeImpl = async (command) => {
    if (command === "get_huddle_defaults") return savedDefaults();
    if (command === "list_audio_output_devices") return [];
    throw new Error(`unmocked Tauri command: ${command}`);
  };
  const React = await import("react");
  const { render } = await import("@testing-library/react");
  const { HuddleContext } = await import("@/features/huddle/HuddleContext.tsx");
  const { HuddleSettingsCard } = await import("./HuddleSettingsCard.tsx");
  return render(
    React.createElement(
      HuddleContext.Provider,
      { value: huddle },
      React.createElement(HuddleSettingsCard),
    ),
  );
}

test("huddle defaults start with Push to Talk and save the chosen mode", async () => {
  const modes = [];
  const gains = [];
  const view = await renderCard({
    setMicGain: (gain) => gains.push(gain),
    setSelectedDeviceId: async () => {},
    setSelectedOutputDevice: async () => {},
    setVoiceInputMode: async (mode) => {
      modes.push(mode);
    },
  });
  const { waitFor, fireEvent } = await import("@testing-library/react");
  await waitFor(() => {
    const toggle = view.getByRole("switch", { name: "Push to Talk" });
    assert.equal(toggle.getAttribute("data-state"), "checked");
    assert.equal(toggle.hasAttribute("disabled"), false);
  });
  assert.match(
    view.container.textContent ?? "",
    /Buzz does not turn the camera on/,
  );
  assert.match(
    view.container.textContent ?? "",
    /A device change takes effect on the next huddle/,
  );

  fireEvent.click(view.getByRole("switch", { name: "Push to Talk" }));
  await waitFor(() => {
    assert.deepEqual(modes, ["voice_activity"]);
  });

  fireEvent.change(view.getByTestId("huddle-input-volume"), {
    target: { value: "0.4" },
  });
  assert.deepEqual(gains, [0.4]);
});

test("show device names asks for the camera and then turns it off", async () => {
  const view = await renderCard({
    setMicGain: () => {},
    setSelectedDeviceId: async () => {},
    setSelectedOutputDevice: async () => {},
    setVoiceInputMode: async () => {},
  });
  const { waitFor, fireEvent } = await import("@testing-library/react");
  const button = view.getByTestId("huddle-show-device-names");
  await waitFor(() => {
    assert.equal(button.hasAttribute("disabled"), false);
  });
  fireEvent.click(button);
  await waitFor(() => {
    assert.equal(media.stopped, true);
  });
  assert.deepEqual(media.requested, { audio: true, video: true });
});

test("an unreadable defaults file disables the controls", async () => {
  invokeImpl = async (command) => {
    if (command === "get_huddle_defaults") {
      throw new Error("huddle defaults version 2 is newer");
    }
    if (command === "list_audio_output_devices") return [];
    throw new Error(`unmocked Tauri command: ${command}`);
  };
  const React = await import("react");
  const { render, waitFor } = await import("@testing-library/react");
  const { HuddleContext } = await import("@/features/huddle/HuddleContext.tsx");
  const { HuddleSettingsCard } = await import("./HuddleSettingsCard.tsx");
  const view = render(
    React.createElement(
      HuddleContext.Provider,
      {
        value: {
          setMicGain: () => {},
          setSelectedDeviceId: async () => {},
          setSelectedOutputDevice: async () => {},
          setVoiceInputMode: async () => {},
        },
      },
      React.createElement(HuddleSettingsCard),
    ),
  );
  await waitFor(() => {
    assert.match(
      view.getByRole("alert").textContent ?? "",
      /version 2 is newer/,
    );
  });
  assert.equal(
    view.getByRole("switch", { name: "Push to Talk" }).hasAttribute("disabled"),
    true,
  );
  assert.ok(view.getByTestId("settings-huddle"));
});
