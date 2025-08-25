interface PartialArgs {
  target_file?: string;
  file_path?: string;
  command?: string;
  is_new_file?: boolean;
}

/**
 * Tools that support streaming argument extraction and should only be shown
 * when useful arguments are extracted during streaming
 */
export const STREAMING_ENABLED_TOOLS = [
  "edit_file",
  "read_file",
  "search_replace",
  "delete_file",
  "run_terminal_cmd",
] as const;

export function extractStreamingArgs(
  accumulatedText: string,
  toolName: string
): PartialArgs {
  const partialArgs: PartialArgs = {};

  // Extract target_file for file operations
  if (["edit_file", "read_file", "delete_file"].includes(toolName)) {
    /**
     * Regex: /"target_file"\s*:\s*"([^"]+)"/
     *
     * Example matches:
     * ✅ `"target_file": "src/components/ui/button.tsx"`
     * ✅ `"target_file":"template.tsx"` (no spaces)
     * ✅ `"target_file" : "package.json"` (extra spaces)
     *
     * Pattern breakdown:
     * - "target_file" = literal string "target_file"
     * - \s* = zero or more whitespace characters
     * - : = literal colon
     * - \s* = zero or more whitespace characters
     * - " = opening quote for value
     * - ([^"]+) = capture group: one or more non-quote characters (the filename)
     * - " = closing quote
     */
    const fileMatch = accumulatedText.match(/"target_file"\s*:\s*"([^"]+)"/);
    if (fileMatch) {
      partialArgs.target_file = fileMatch[1];
    }
  }

  // Extract is_new_file for edit_file and search_replace operations
  if (["edit_file", "search_replace"].includes(toolName)) {
    /**
     * Regex: /"is_new_file"\s*:\s*(true|false)/
     *
     * Example matches:
     * ✅ `"is_new_file": true`
     * ✅ `"is_new_file":false` (no spaces)
     * ✅ `"is_new_file" : true` (extra spaces)
     *
     * Pattern breakdown:
     * - "is_new_file" = literal string "is_new_file"
     * - \s* = zero or more whitespace characters
     * - : = literal colon
     * - \s* = zero or more whitespace characters
     * - (true|false) = capture group: literal true or false
     */
    const isNewFileMatch = accumulatedText.match(
      /"is_new_file"\s*:\s*(true|false)/
    );
    if (isNewFileMatch) {
      partialArgs.is_new_file = isNewFileMatch[1] === "true";
    }
  }

  // Extract file_path for search_replace operations
  if (toolName === "search_replace") {
    /**
     * Regex: /"file_path"\s*:\s*"([^"]+)"/
     *
     * Example matches:
     * ✅ `"file_path": "src/components/ui/button.tsx"`
     * ✅ `"file_path":"template.tsx"` (no spaces)
     * ✅ `"file_path" : "package.json"` (extra spaces)
     *
     * Pattern breakdown:
     * - "file_path" = literal string "file_path"
     * - \s* = zero or more whitespace characters
     * - : = literal colon
     * - \s* = zero or more whitespace characters
     * - " = opening quote for value
     * - ([^"]+) = capture group: one or more non-quote characters (the filename)
     * - " = closing quote
     */
    const filePathMatch = accumulatedText.match(/"file_path"\s*:\s*"([^"]+)"/);
    if (filePathMatch) {
      partialArgs.file_path = filePathMatch[1];
    }
  }

  // Extract command for terminal operations
  if (toolName === "run_terminal_cmd") {
    /**
     * Regex: /"command"\s*:\s*"([^"]+)"/
     *
     * Example matches:
     * ✅ `"command": "npm run build"`
     * ✅ `"command":"git status"` (no spaces)
     * ✅ `"command" : "ls -la"` (extra spaces)
     *
     * Pattern breakdown:
     * - "command" = literal string "command"
     * - \s* = zero or more whitespace characters
     * - : = literal colon
     * - \s* = zero or more whitespace characters
     * - " = opening quote for value
     * - ([^"]+) = capture group: one or more non-quote characters (the command)
     * - " = closing quote
     */
    const cmdMatch = accumulatedText.match(/"command"\s*:\s*"([^"]+)"/);
    if (cmdMatch) {
      partialArgs.command = cmdMatch[1];
    }
  }

  return partialArgs;
}

/**
 * Check if we have useful partial arguments for displaying to user
 */
export function hasUsefulPartialArgs(
  partialArgs: PartialArgs,
  toolName: string
): boolean {
  if (["edit_file", "read_file", "delete_file"].includes(toolName)) {
    return !!partialArgs.target_file;
  }

  if (toolName === "search_replace") {
    return !!partialArgs.file_path;
  }

  if (toolName === "run_terminal_cmd") {
    return !!partialArgs.command;
  }

  return false;
}
