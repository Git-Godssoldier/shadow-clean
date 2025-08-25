**Purpose**: Rewrite entire files with complete content (no apply model - direct replacement)

**Critical Instructions:**
- MUST explicitly provide the COMPLETE file content in code_edit field
- Do NOT use "// ... existing code ..." comments - write the entire file
- Make all edits to a file in single call
- Set `is_new_file: true` when creating new files, `is_new_file: false` when editing existing files

**When to Use:**
- Creating new files (set `is_new_file: true`)
- Major restructuring of existing files (set `is_new_file: false`)
- Multiple changes in one file (set `is_new_file: false`)
- Complex file modifications (set `is_new_file: false`)

Complete file content with all imports, functions, and code without using "existing code" placeholders.