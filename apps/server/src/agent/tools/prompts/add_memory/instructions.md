**Purpose**: Store important information about the codebase, patterns, decisions, or findings that should be remembered for future sessions in this repository

**When to Use:**
- Learning important architectural patterns or design decisions
- Discovering critical setup steps or configuration details
- Finding bugs or issues that may recur
- Understanding complex business logic or domain concepts  
- Noting performance optimizations or important constraints
- Recording debugging approaches

**When NOT to Use:**
- For temporary information only relevant to current session
- For obvious or standard coding patterns
- For information already well-documented in the codebase

**Memory Categories:**
- INFRA: Infrastructure, deployment, environment setup
- SETUP: Project setup, installation, configuration steps
- STYLES: Code style guidelines, formatting preferences
- ARCHITECTURE: System design, component relationships, data flow
- TESTING: Testing strategies, mock patterns, test setup
- PATTERNS: Code patterns, utilities, common approaches  
- BUGS: Known issues, gotchas, troubleshooting steps
- PERFORMANCE: Optimization techniques, bottlenecks, monitoring
- CONFIG: Configuration details, environment variables, settings
- GENERAL: Other important repository-specific information

**Parameters:**
- content: Clear, concise description of the information to remember
- category: One of the categories above (defaults to GENERAL)
- explanation: Brief reason why this should be remembered

**Examples:**

GOOD Usage - Architecture Pattern:
```
add_memory({
  content: "Uses Turborepo monorepo with shared packages. Frontend (Next.js) communicates with server via WebSocket for real-time updates. Agent execution can run in local or remote mode via tool executor abstraction.",
  category: "ARCHITECTURE", 
  explanation: "Recording key architectural decisions for future development"
})
```

GOOD Usage - Setup Knowledge:
```
add_memory({
  content: "Run 'npm run db:push' to sync Prisma schema changes to database. Required after schema modifications before server restart.",
  category: "SETUP",
  explanation: "Critical setup step that's easy to forget"
})
```

GOOD Usage - Bug Pattern:
```
add_memory({
  content: "Checkbox onCheckedChange receives boolean | 'indeterminate' but can cast to boolean for simple toggles. Radix UI never actually passes indeterminate for basic checkboxes.",
  category: "BUGS",
  explanation: "Documenting UI component behavior to avoid future confusion"
})
```