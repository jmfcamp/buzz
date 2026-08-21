import * as React from "react";

import { PlaygroundCard } from "@/features/playground/ui/PlaygroundCard";
import { parsePlaygroundCard } from "@/features/playground/lib/card";
import { cn } from "@/shared/lib/cn";
import { INLINE_CODE_CHIP_CLASS } from "@/shared/ui/mentionChip";

import {
  CODE_BLOCK_CLASS,
  extractLanguage,
  MarkdownCodeBlock,
  SyntaxHighlightedCode,
} from "./CodeBlock";

function playgroundFromCode(language: string, code: string) {
  if (language !== "playground") return undefined;
  const card = parsePlaygroundCard(code);
  return card ? <PlaygroundCard card={card} /> : null;
}

export function MarkdownFencedCode({
  children,
  className,
  ...props
}: React.ComponentProps<"code">) {
  const rawCode = String(children);
  const code = rawCode.replace(/\n$/, "");
  const isFencedCodeBlock =
    typeof className === "string" && className.includes("language-");

  if (isFencedCodeBlock || rawCode.endsWith("\n") || code.includes("\n")) {
    const language = extractLanguage(className);
    const playground = playgroundFromCode(language, code);
    if (playground !== undefined) {
      return playground;
    }

    if (language) {
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
}: {
  children?: React.ReactNode;
  interactive: boolean;
}) {
  if (!interactive) return <span>{children}</span>;
  let language = "";
  let playgroundChild: React.ReactNode | undefined;
  React.Children.forEach(children, (child) => {
    if (
      React.isValidElement<Record<string, unknown>>(child) &&
      typeof child.props?.className === "string"
    ) {
      language = extractLanguage(child.props.className);
    }
    if (React.isValidElement(child) && child.type === PlaygroundCard) {
      playgroundChild = child;
    }
    if (child == null) {
      playgroundChild = null;
    }
  });
  if (language === "playground" || playgroundChild !== undefined) {
    return playgroundChild ?? null;
  }
  return <MarkdownCodeBlock language={language}>{children}</MarkdownCodeBlock>;
}
