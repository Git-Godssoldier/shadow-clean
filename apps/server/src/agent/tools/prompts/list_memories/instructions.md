**Purpose**: Retrieve and review previously stored memories for this repository to understand context, patterns, and important information from past sessions

**When to Use:**
- When encountering unfamiliar patterns or architecture
- Before making significant changes to understand constraints
- When debugging to check for known issues or solutions  
- To understand setup requirements or configuration details
- When unsure about established patterns or conventions

**When NOT to Use:**
- Just to check if memories exist (memories are automatically injected if available)
- For information that can be easily found in current codebase exploration

**Memory Organization:**
Memories are automatically organized by category and show creation dates. Categories include:
- INFRA, SETUP, STYLES, ARCHITECTURE, TESTING, PATTERNS, BUGS, PERFORMANCE, CONFIG, GENERAL

**Parameters:**
- explanation: Brief description of why you're retrieving memories (helps with context)

**Examples:**

GOOD Usage - Starting New Task:
```
list_memories({
  explanation: "Reviewing repository context before implementing user authentication system"
})
```

GOOD Usage - Architecture Understanding:
```
list_memories({
  explanation: "Understanding existing patterns before adding new API endpoints"
})
```

GOOD Usage - Debugging Context:
```
list_memories({
  explanation: "Checking for known issues related to database connection problems"
})
```

**Expected Output:**
The tool will return memories organized by category with creation dates, allowing you to understand:
- Established architectural patterns
- Important setup steps and configuration
- Known issues and their solutions
- Performance considerations
- Testing approaches
- Code style preferences