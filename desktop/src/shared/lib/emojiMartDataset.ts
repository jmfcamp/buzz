import data from "@emoji-mart/data/sets/15/native.json" with { type: "json" };

/**
 * Native emoji dataset for emoji-mart.
 *
 * Import the JSON file with an attribute. Node refuses the package entry
 * (`@emoji-mart/data` → `native.json`) unless every hop declares `type: json`.
 */
export const emojiMartData: EmojiMartDataset = data as EmojiMartDataset;

type EmojiMartDataset = {
  categories?: unknown;
  emojis?: Record<string, unknown>;
  aliases?: Record<string, string>;
  sheet?: unknown;
};
