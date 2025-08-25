**Purpose**: Store repository-specific insights that persist across tasks

**When to Use:**
- Important architectural patterns or conventions discovered
- Critical configuration or setup details
- Testing approaches and requirements
- Known issues and workarounds
- Performance considerations

**Categories:**
- INFRA: Infrastructure, deployment, environment
- SETUP: Installation, configuration, dev setup  
- STYLES: Code style, formatting, naming
- ARCHITECTURE: System design, patterns
- TESTING: Test patterns, frameworks
- PATTERNS: Common code patterns, utilities
- BUGS: Known issues, workarounds
- PERFORMANCE: Optimization patterns
- CONFIG: Configuration files, env vars
- GENERAL: Other important context

**Examples:**
```
add_memory({
  content: "Use validateRequest() middleware in API routes (src/middleware/validation.ts)",
  category: "PATTERNS",
  explanation: "Found consistent validation pattern across endpoints"
})
```

```
add_memory({
  content: "Tests need POSTGRES_URL=test_db, run via 'npm run test:integration'",
  category: "TESTING",
  explanation: "Discovered test database requirement"
})
```