import * as React from "react";

import { PlaygroundCard } from "@/features/playground/ui/PlaygroundCard";
import { parsePlaygroundCard } from "@/features/playground/lib/card";
import { TermSessionCard } from "@/features/term-session/ui/TermSessionCard";
import { parseTermSessionCard } from "@/features/term-session/lib/card";
import { cn } from "@/shared/lib/cn";
import { INLINE_CODE_CHIP_CLASS } from "@/shared/ui/mentionChip";

import {
  CODE_BLOCK_CLASS,
  extractLanguage,
  MarkdownCodeBlock,
  SyntaxHighlightedCode,
} from "./CodeBlock";
import { getReactNodeText } from "./utils";

function fenceText(node: React.ReactNode) {
  return getReactNodeText(node).replace(/\n$/, "");
}

function playgroundFromCode(_language: string, code: string) {
  const card = parsePlaygroundCard(code);
  // Valid playground JSON renders as the card regardless of fence language
  // (`playground`, `json`, unlabeled, etc.). Invalid JSON falls through.
  return card ? <PlaygroundCard card={card} /> : undefined;
}

function termSessionFromCode(_language: string, code: string) {
  const card = parseTermSessionCard(code);
  return card ? <TermSessionCard card={card} /> : undefined;
}

function cardFromCode(language: string, code: string) {
  return playgroundFromCode(language, code) ?? termSessionFromCode(language, code);
}

export function MarkdownFencedCode({
  children,
  className,
  ...props
}: React.ComponentProps<"code">) {
  // react-markdown can pass fenced text as several child nodes (a blank line
  // after the opener is the common case). String(children) would join those
  // with commas and break JSON.parse.
  const rawCode = getReactNodeText(children);
  const code = fenceText(children);
  const isFencedCodeBlock =
    typeof className === "string" && className.includes("language-");

  if (isFencedCodeBlock || rawCode.endsWith("\n") || code.includes("\n")) {
    const language = extractLanguage(className);
    const card = cardFromCode(language, code);
    if (card !== undefined) {
      return card;
    }

    // Card fence languages are not highlight languages — show the source as-is.
    if (language && language !== "playground" && language !== "term-session") {
      return (
        <SyntaxHighlightedCode code={code} language={language} {...props} />
      );
    }

    const lines = code.split("\n");
    return (
      <code {...props} className={CODE_BLOCK_CLASS}>
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
          <span key={i} data-line="">
            {line}
          </span>
        ))}
      </code>
    );
  }

  return (
    <code {...props} className={cn(INLINE_CODE_CHIP_CLASS, className)}>
      {children}
    </code>
  );
}

export function MarkdownFencedPre({
  children,
  interactive,
  blockCode = false,
}: {
  children?: React.ReactNode;
  interactive: boolean;
  blockCode?: boolean;
}) {
  let language = "";
  React.Children.forEach(children, (child) => {
    if (
      React.isValidElement<Record<string, unknown>>(child) &&
      typeof child.props?.className === "string"
    ) {
      language = extractLanguage(child.props.className);
    }
  });
  // `pre` receives the `code` element, not the rendered card. Re-parse the
  // joined fence text so a valid card is unwrapped from code-block chrome.
  const card = cardFromCode(language, fenceText(children));
  if (card !== undefined) {
    return card;
  }
  if (!interactive && !blockCode) {
    return <span>{children}</span>;
  }
  if (!interactive) {
    // Keep a real <pre>. A <span> unwrap makes
    // `.message-markdown :not(pre) > code` treat the fenced
    // `.code-block-lines` as an inline-flex chip, so sibling
    // [data-line] spans concatenate into one horizontal row.
    return <pre className="overflow-x-auto">{children}</pre>;
  }
  return <MarkdownCodeBlock language={language}>{children}</MarkdownCodeBlock>;
}
