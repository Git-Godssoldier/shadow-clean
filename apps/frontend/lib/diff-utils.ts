import { BundledLanguage } from "shiki";
import * as Diff from "diff";
import { getLanguageFromPath } from "@repo/types";

/**
 * Create a simple unified diff display for small changes
 */
export function createSimpleDiff(
  oldString: string,
  newString: string,
  filePath?: string
): { content: string; language: BundledLanguage } {
  const language = filePath
    ? (getLanguageFromPath(filePath) as BundledLanguage)
    : "markdown";

  // Use the diff library for accurate diffing
  const diff = Diff.diffLines(oldString, newString);
  const diffLines: string[] = [];

  diff.forEach((part) => {
    if (part.removed) {
      const lines = part.value.split("\n").filter((line) => line !== "");
      lines.forEach((line) => {
        diffLines.push(`\t${line} // [!code --]`);
      });
    } else if (part.added) {
      const lines = part.value.split("\n").filter((line) => line !== "");
      lines.forEach((line) => {
        diffLines.push(`\t${line} // [!code ++]`);
      });
    } else {
      const lines = part.value.split("\n").filter((line) => line !== "");
      lines.forEach((line) => {
        diffLines.push(`\t${line}`);
      });
    }
  });

  return {
    content: diffLines.join("\n"),
    language,
  };
}
