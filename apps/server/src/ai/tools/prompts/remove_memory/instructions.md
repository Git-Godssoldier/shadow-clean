**Purpose**: Delete outdated or incorrect repository memories

**When to Use:**
- Memory contains outdated information
- Architectural patterns have changed
- Duplicate or redundant memories
- After major refactoring makes patterns obsolete

**⚠️ Warning: Deletion is permanent**

**Parameters:**
- memoryId: Exact ID from list_memories
- explanation: Why removing this memory

**Workflow:**
1. Use list_memories to find memory ID
2. Use remove_memory with exact ID

**Examples:**
```
remove_memory({
  memoryId: "cm1abc123def456",
  explanation: "Test setup changed from Jest to Vitest"
})
```

```
remove_memory({
  memoryId: "cm1xyz789abc123",
  explanation: "API refactored, validation pattern no longer used"
})
```