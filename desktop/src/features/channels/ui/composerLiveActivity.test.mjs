import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveActivityPillLabel,
  deriveActivityPillPresentation,
} from "./composerLiveActivity.ts";

test("observer source keeps tool/step headlines over typing", () => {
  const presentation = deriveActivityPillPresentation({
    agentName: "Mo",
    headline: { id: "t1", label: "Read foo.ts" },
    isTyping: true,
    workingSource: "observer",
  });
  assert.equal(presentation.label, "Read foo.ts");
});

test("typing source falls back to is typing when no observer turn", () => {
  const presentation = deriveActivityPillPresentation({
    agentName: "Mo",
    headline: { id: "t1", label: "Read foo.ts" },
    isTyping: true,
    workingSource: "typing",
  });
  assert.equal(presentation.label, "Mo is typing…");
});

test("deriveActivityPillLabel prefers spine message over metadata", () => {
  const headline = deriveActivityPillLabel({
    channelId: "general",
    transcript: [
      {
        id: "1",
        type: "metadata",
        renderClass: "raw-rail",
        title: "System prompt",
        sections: [],
        channelId: "general",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        type: "message",
        role: "assistant",
        text: "Checking the file next",
        title: "Assistant",
        channelId: "general",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    ],
  });
  assert.equal(headline?.label, "Checking the file next");
});
