**Purpose**: Retrieve stored repository memories to recall important context

**When to Use:**
- Start of new tasks to understand repository context
- Before making architectural decisions
- When debugging to recall known issues
- To check testing approaches before writing tests
- Before refactoring to understand conventions

**Parameters:**
- category: Optional filter (INFRA, SETUP, STYLES, ARCHITECTURE, TESTING, PATTERNS, BUGS, PERFORMANCE, CONFIG, GENERAL)
- explanation: Why you're retrieving memories

**Examples:**
```
list_memories({
  explanation: "Starting new feature, need repository context"
})
```

```
list_memories({
  category: "TESTING",
  explanation: "Understanding test setup before adding tests"
})
```