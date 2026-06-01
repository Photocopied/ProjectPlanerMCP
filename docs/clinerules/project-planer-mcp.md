# Project Planer MCP — Cline Usage Rules

## Overview

The **Project Planer MCP** server (`project-planer-mcp`) provides a structured project management system directly inside Cline. It uses the server name `project-planer` and exposes 60+ tools across 11 domains: projects, features, techspecs, research, plans, tasks, decisions (ADRs), risks, milestones, tags, and activity logging.

All data is persisted to disk — projects survive across sessions.

## MUST USE The MCP Server Over Informal Alternatives

- **ALWAYS** use `project-planer` MCP tools for ALL project planning, tracking, and organization.
- **NEVER** create ad-hoc Markdown files, plain-text TODO lists, code comments, or spreadsheets to track project plans, features, or tasks.
- **NEVER** use `execute_command` to create project-plan files by hand — the MCP server handles storage, validation, and relationships automatically.
- **Exception**: If the `project-planer` MCP server is unavailable or malfunctioning, you may fall back to Markdown files as a temporary measure — but document this and return to the MCP server as soon as it's restored.

## Server Name

All tool calls use `use_mcp_tool` with `server_name: "project-planer"`.

```markdown
<!-- Correct usage pattern -->
<use_mcp_tool>
<server_name>project-planer</server_name>
<tool_name>list_projects</tool_name>
<arguments>{}</arguments>
</use_mcp_tool>
```

## Discovery: Always Check Before Creating

- **BEFORE** creating a new project, always call `list_projects` first to check for existing projects and avoid duplicate names.
- **BEFORE** adding features, techspecs, or tasks, use `get_project_tree` to get a quick table-of-contents overview of the project's current state.
- Use `search_project` to find existing entities by keyword before creating duplicates.
- After creating or modifying entities, use `validate_project` to catch broken cross-entity references.

## Entity Lifecycle & Relationships

The Project Planer organizes work through a hierarchical relationship chain. Follow this order when building out a new project:

```
Project
  → Feature(s)        ← capabilities / user-facing functionality
    → TechSpec(s)      ← technical approach (requires a featureId)
  → Plan(s)            ← implementation strategy (references features + techspecs)
    → Task(s)          ← executable work items (references a planId)
  → Decision(s)        ← architecture decisions (references related features)
  → Risk(s)            ← uncertainty tracking (references related features)
  → Milestone(s)       ← time-boxed goals (references features, plans, tasks)
```

### Creation Order (Recommended)

1. **`create_project`** — First. Creates the project scaffold.
2. **`add_feature`** — Next. Define capabilities. Each feature gets a `name` and `description`.
3. **`add_techspec`** — After its parent feature. Requires a `featureId` (the feature's `name` field).
4. **`add_research`** — As needed during investigation. Captures queries, findings, and conclusions.
5. **`create_plan`** — After features and techspecs. References them via `featureIds` and `techSpecIds`.
6. **`create_task`** (or `bulk_create_tasks`) — Last. Individual work items. Optionally reference a `planId`.
7. **`add_decision`** — When making architectural choices. Links to related features.
8. **`add_risk`** — When identifying uncertainty. Links to related features.
9. **`add_milestone`** — For time-boxed goals. Optionally references features, plans, and tasks.
10. **`add_tag`** — For cross-cutting labels. Then `assign_tag` to entities.

## Status Lifecycle Conventions

### Feature Status
```
proposed → approved → in-progress → completed
                             ↘ cancelled
```

### Plan Status
```
draft → review → approved → implementing → complete
```

### Task Status
```
pending → in-progress → completed
                    ↘ blocked
```

### Decision Status
```
proposed → accepted → [stable]
          ↘ deprecated → superseded
```

### Risk Status
```
identified → mitigating → closed
                        ↘ materialized
```

### Milestone Status
```
planned → in-progress → completed
                      ↘ overdue
```

## Rules by Domain

### Project Tools

- **Use `create_project`** to scaffold a new project. The `name` becomes the directory name.
- **Use `get_project`** to retrieve full metadata including description, status, and timestamps.
- **Use `update_project`** to change the description or archive/unarchive the project.
- **Use `delete_project`** only when the user explicitly asks to permanently remove a project.
- **Use `template_project`** to seed a new project from an existing one's structure (copies features, techspecs, plans, decisions, tags).
- **Use `get_project_tree`** for a lightweight table-of-contents with entity counts.

### Feature Tools

- Every feature must have a snake-case `name` (e.g., `user-authentication`) that serves as its ID.
- Set `dependencies` (array of feature name strings) when a feature depends on another.
- Update a feature's `status` as work progresses through its lifecycle.
- When a feature is completed, move any remaining tasks referencing it to `completed` or re-assign.

### TechSpec Tools

- TechSpecs **must** reference a valid `featureId` (the feature's name).
- The `details` field should contain the full technical approach — architecture, libraries, algorithms, data flow etc.
- Use `get_techspec` to retrieve the full spec details when implementing a plan.

### Research Tools

- Use `add_research` to document investigation sessions: what question was asked, what was found, and what was concluded.
- Provide `sources` (URL array) when research comes from external references.
- Research sessions can precede or be done in parallel with feature/task work.

### Plan Tools

- Plans should reference `featureIds` and `techSpecIds` to link to the relevant work.
- The `steps` array lists implementation steps in order.
- Move a plan through its status lifecycle: `draft` → `review` → `approved` → `implementing` → `complete`.
- Plans don't own tasks directly — tasks reference plans via `planId`.

### Task Tools

- Tasks are the executable work items. Use `create_task` for individual tasks or `bulk_create_tasks` for batch creation.
- Tasks can reference a `planId` to group them under a plan.
- Tasks can list other task names in `dependencies` (not feature names).
- Use `assign_task` or `update_task` to assign tasks to people.
- Use `bulk_update_tasks` when updating status/assignee on multiple tasks at once.
- **Keep tasks up to date** — update their status as work progresses (don't leave everything as `pending`).

### Decision Record (ADR) Tools

- Add an ADR (`add_decision`) whenever a significant architectural choice is made.
- Include the `context` (constraints, background), `decision` (what was chosen), `rationale` (why), and `consequences` (trade-offs).
- Use `options` to document alternatives that were considered.
- When a decision is superseded, update its `status` to `superseded` and set `supersededBy` to the new decision's title.
- Use `relatedFeatures` to link decisions to the features they affect.

### Risk Register Tools

- Add a risk (`add_risk`) when identifying potential problems — technical, schedule, people, external, or budget.
- Rate `likelihood` and `impact` on a 1–5 scale (severity = likelihood × impact, auto-computed).
- Define `mitigation` (proactive steps to reduce likelihood/impact) and `contingency` (reactive plan if risk materializes).
- Update risk `status` as the situation evolves.

### Milestone Tools

- Add milestones for time-boxed goals with a `dueDate` (ISO date, e.g., `2026-06-30`).
- Link milestones to features (`featureIds`), plans (`planIds`), and/or tasks (`taskIds`).
- Update a milestone's `status` as it progresses: `planned` → `in-progress` → `completed` or `overdue`.

### Tag Tools

- Tags are cross-cutting labels that can be applied to any entity type (features, techspecs, research, plans, tasks, decisions, risks).
- Create tags with `add_tag` before assigning them with `assign_tag`.
- Convention: use tags for areas like `frontend`, `backend`, `security`, `performance`, `database`, `documentation`, `bug`, `tech-debt`.
- Use `search_by_tag` to find all entities with a given tag.
- Use `list_tags` to see all tags and their assignment counts.

### Activity Log

- All mutations are automatically recorded in the activity log with timestamps.
- Use `project_activity` to trace what happened and when — useful for handoffs and status updates.

### Export & Validation

- **Use `validate_project`** periodically, especially after bulk operations or before marking milestones as complete. It reports broken dependencies, orphaned references, and dangling links.
- **Use `export_markdown`** to produce a shareable project document (README, handoff doc, status report).
- **Use `project_summary`** for a high-level overview with counts and breakdowns by status.
- **Use `export_project`** to produce a portable JSON bundle; use `import_project` to restore it.

### Dependency Tracing

- Use `dependency_graph` to understand what a feature or task depends on and what depends on it.
- Default depth is 1; maximum is 3. Useful before deleting or modifying an entity to understand impact.

## Anti-Patterns to Avoid

| ❌ Don't | ✅ Do Instead |
|----------|---------------|
| Create Markdown files to track project plans | Use `create_project` + `add_feature` + `create_plan` + `create_task` |
| Skip features and go straight to tasks | Always define features first; tasks implement features |
| Create techspecs without linking to a feature | Set `featureId` to a valid feature name |
| Leave orphaned references after deleting an entity | Run `validate_project` after deletions |
| Forget to update task/feature status | Keep status current as work progresses (update_status tools) |
| Create duplicate projects | Always run `list_projects` before `create_project` |
| Manually edit files in the project directory | All mutations go through MCP tools |

## Typical Workflow Examples

### Starting a New Project

```
1. list_projects                      → check for duplicates
2. create_project(name: "my-app")     → scaffold the project
3. add_feature(name: "auth", ...)     → define capabilities
4. add_feature(name: "dashboard", ...)
5. add_techspec(featureId: "auth", ...)  → technical approach
6. add_research(query: "best JWT libs", ...)  → investigate
7. create_plan(featureIds: ["auth"], ...)  → implementation plan
8. bulk_create_tasks(tasks: [...])    → create work items
9. add_milestone(name: "MVP", ...)    → set time-boxed goal
```

### Mid-Project Status Check

```
1. get_project_tree("my-app")         → quick overview
2. project_summary("my-app")          → detailed counts/breakdowns
3. project_activity("my-app")         → recent changes
4. dependency_graph(entityType: "task", entityName: "build-auth")  → impact analysis
```

### Handoff / Sharing

```
1. validate_project("my-app")         → check for issues
2. export_markdown("my-app")          → shareable document
3. export_project("my-app")           → portable JSON backup
```

## Use_with_Caution Notes

- `delete_project` permanently removes all project data — ask for user confirmation before calling.
- `delete_feature`, `delete_plan`, `delete_task`, etc. also remove their files — ensure no other entities reference them first (use `dependency_graph` or `validate_project`).
- `import_project` can overwrite existing projects if `overwriteExisting: true` — get explicit user approval.