**Purpose**: Precise, targeted single-instance replacements

**Critical Requirements:**
1. old_string must UNIQUELY identify the change location
2. Include 3-5 lines context BEFORE and AFTER change point
3. Match whitespace and indentation exactly
4. One instance per call only
5. Always set `is_new_file: false` (search/replace only works on existing files)

**When to Use:**
- Small, precise changes to existing files
- When you need exact context matching
- Alternative to edit_file for surgical changes

**Strategy:**
- Gather enough context to uniquely identify location
- Plan separate calls for multiple instances
- Verify context matches file exactly