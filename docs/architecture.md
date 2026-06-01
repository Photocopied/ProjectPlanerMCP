# Architecture

## Directory Structure

Each project is stored as a directory with a hierarchical file structure:

```
project-planer-mcp/
└── projects/
    └── ProjectName/
        ├── Project.json                      # Project metadata
        ├── Features/
        │   └── feature-name.json             # Feature capability files
        ├── TechSpecs/
        │   └── techspec-name.json            # Technical specifications
        ├── Research/
        │   └── research-session-YYYYMMDD-HHMMSS.json
        ├── Plans/
        │   └── plan-name-YYYYMMDD-HHMMSS.json
        ├── Tasks/
        │   └── task-name-YYYYMMDD-HHMMSS.json
        ├── Decisions/
        │   └── decision-title-YYYYMMDD-HHMMSS.json  # Architecture Decision Records
        ├── Risks/
        │   └── risk-title-YYYYMMDD-HHMMSS.json       # Risk register entries
        ├── Milestones/
        │   └── milestone-name-YYYYMMDD-HHMMSS.json   # Time-boxed milestones
        ├── Tags/
        │   ├── index.json                            # Tag definitions
        │   └── assignments.json                      # Tag-to-entity mappings
        └── Activity/
            └── activity-entity-YYYYMMDD-HHMMSS.json  # Audit log entries
```

## Data Flow

```
Features (capabilities)
    ↕ referenced by
TechSpecs (technical approach) ── tagged with ── Tags (cross-cutting labels)
    ↕ referenced by                ↕
Plans (implementation strategy)    ↕
    ↕ referenced by                ↕
Tasks (executable work items)      ↕
    ↕                              ↕
Decisions (architectural rationale)─↕
    ↕                              ↕
Risks (uncertainty & mitigation) ─ ↕

Activity Log (audit trail) ← every mutation records a timestamped entry
```

## Persistence

All projects and their files are stored on disk in an OS-appropriate data directory:

| Platform | Data directory |
|---|---|
| **macOS** | `~/Library/Application Support/project-planer-mcp/` |
| **Linux** | `~/.local/share/project-planer-mcp/` |
| **Windows** | `%APPDATA%/project-planer-mcp/` |

Each entity (project, feature, techspec, research session, plan, task) is stored as an individual JSON file, providing natural version control and easy inspection.

## Source Tree

```
ProjectPlanerMCP/
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   ├── architecture.md        # This file
│   ├── tools.md               # Complete tool reference
│   └── clinerules/
│       └── project-planer-mcp.md
├── src/
│   ├── index.ts               # MCP server entry point
│   ├── server.ts              # MCP server implementation
│   ├── helpers.ts             # Utility helpers
│   ├── store.ts               # Data store / file I/O
│   ├── types.ts               # TypeScript type definitions
│   └── __tests__/             # Test suite
└── build/                     # Compiled output (gitignored)
    ├── index.js
    ├── index.js.map
    ├── index.d.ts
    └── index.d.ts.map