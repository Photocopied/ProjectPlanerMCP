# Project Planer MCP

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for creating and managing rich project plans with features, technical specifications, research sessions, implementation plans, and tasks. Designed to work with AI assistants like Cline.

## Architecture

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

### Data Flow

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

## Tools

### Project Tools

#### `create_project`
Create a new project with its full directory scaffold.

- **name** (string, required) — Name of the project (becomes the directory name)
- **description** (string, optional) — What the project aims to solve or add

#### `list_projects`
List all projects with their metadata.

#### `get_project`
Get detailed information about a specific project.

- **projectName** (string, required) — Name of the project

#### `update_project`
Update a project's description or status.

- **projectName** (string, required) — Name of the project
- **description** (string, optional) — New description
- **status** (enum: `active`, `archived`, optional) — New project status

#### `delete_project`
Permanently delete a project and all its files.

- **projectName** (string, required) — Name of the project to delete

### Feature Tools

#### `add_feature`
Add a feature capability to a project.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the feature (e.g. `project-wide-search`)
- **description** (string, required) — Description of the feature capability
- **priority** (enum: `low`, `medium`, `high`, `critical`, optional) — Priority (default: `medium`)

#### `list_features`
List all features for a project.

- **projectName** (string, required) — Name of the project

#### `get_feature`
Get a single feature by name.

- **projectName** (string, required) — Name of the project
- **featureName** (string, required) — Name of the feature

#### `update_feature`
Update a feature's description, priority, status, or dependencies.

- **projectName** (string, required) — Name of the project
- **featureName** (string, required) — Name of the feature
- **description** (string, optional) — New description
- **priority** (enum: `low`, `medium`, `high`, `critical`, optional)
- **status** (enum: `proposed`, `approved`, `in-progress`, `completed`, `cancelled`, optional)
- **dependencies** (string[], optional) — Array of feature IDs this depends on

#### `delete_feature`
Delete a feature from a project.

- **projectName** (string, required) — Name of the project
- **featureName** (string, required) — Name of the feature to delete

### TechSpec Tools

#### `add_techspec`
Add a technical specification tied to a feature.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the technical spec
- **description** (string, required) — Brief description
- **featureId** (string, required) — ID of the feature this spec belongs to
- **details** (string, required) — Full technical specification details

#### `list_techspecs`
List all technical specifications for a project.

- **projectName** (string, required) — Name of the project

#### `get_techspec`
Get a single technical specification by name.

- **projectName** (string, required) — Name of the project
- **techSpecName** (string, required) — Name of the technical specification

#### `update_techspec`
Update a technical specification's description, featureId, or details.

- **projectName** (string, required) — Name of the project
- **techSpecName** (string, required) — Name of the technical specification
- **description** (string, optional) — New description
- **featureId** (string, optional) — ID of the feature this spec belongs to
- **details** (string, optional) — Full technical specification details

#### `delete_techspec`
Delete a technical specification from a project.

- **projectName** (string, required) — Name of the project
- **techSpecName** (string, required) — Name of the technical specification to delete

### Research Tools

#### `add_research`
Add a research session with findings to a project.

- **projectName** (string, required) — Name of the project
- **sessionName** (string, required) — Name for this research session
- **query** (string, required) — The research question or query
- **findings** (string, required) — What was found during research
- **conclusions** (string, required) — Conclusions drawn from the research
- **sources** (string[], optional) — URLs or references to sources

#### `list_research`
List all research sessions for a project.

- **projectName** (string, required) — Name of the project

#### `get_research`
Get a single research session by name.

- **projectName** (string, required) — Name of the project
- **sessionName** (string, required) — Name of the research session

#### `update_research`
Update a research session's findings, conclusions, or sources.

- **projectName** (string, required) — Name of the project
- **sessionName** (string, required) — Name of the research session
- **findings** (string, optional) — Updated findings
- **conclusions** (string, optional) — Updated conclusions
- **sources** (string[], optional) — Updated list of sources

#### `delete_research`
Delete a research session from a project.

- **projectName** (string, required) — Name of the project
- **sessionName** (string, required) — Name of the research session to delete

### Plan Tools

#### `create_plan`
Create an implementation plan for a project.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the plan
- **description** (string, required) — Description of the plan
- **featureIds** (string[], optional) — IDs of features this plan covers
- **techSpecIds** (string[], optional) — IDs of tech specs this plan references
- **steps** (string[], optional) — Step-by-step implementation steps

#### `list_plans`
List all plans for a project.

- **projectName** (string, required) — Name of the project

#### `update_plan_status`
Update a plan's status and optional steps.

- **projectName** (string, required) — Name of the project
- **planName** (string, required) — Name of the plan
- **status** (enum: `draft`, `review`, `approved`, `implementing`, `complete`, required)
- **steps** (string[], optional) — Updated implementation steps

#### `delete_plan`
Delete a plan from a project.

- **projectName** (string, required) — Name of the project
- **planName** (string, required) — Name of the plan to delete

### Task Tools

#### `create_task`
Create a task (job-board style) for a project.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the task
- **description** (string, required) — Description of the task
- **priority** (enum: `low`, `medium`, `high`, `critical`, optional) — Priority (default: `medium`)
- **dependencies** (string[], optional) — Task IDs this task depends on
- **planId** (string, optional) — ID of the plan this task belongs to

#### `list_tasks`
List all tasks for a project.

- **projectName** (string, required) — Name of the project

#### `get_task`
Get a single task by name.

- **projectName** (string, required) — Name of the project
- **taskName** (string, required) — Name of the task

#### `update_task_status`
Update a task's status.

- **projectName** (string, required) — Name of the project
- **taskName** (string, required) — Name of the task
- **status** (enum: `pending`, `in-progress`, `completed`, `blocked`, required)

#### `update_task`
Update a task's description, priority, status, assignee, or dependencies.

- **projectName** (string, required) — Name of the project
- **taskName** (string, required) — Name of the task
- **description** (string, optional) — New description
- **priority** (enum: `low`, `medium`, `high`, `critical`, optional) — New priority
- **status** (enum: `pending`, `in-progress`, `completed`, `blocked`, optional) — New status
- **assignedTo** (string, optional) — Who to assign the task to
- **dependencies** (string[], optional) — Task IDs this task depends on

#### `assign_task`
Assign a task to someone.

- **projectName** (string, required) — Name of the project
- **taskName** (string, required) — Name of the task
- **assignee** (string, required) — Who to assign the task to

#### `delete_task`
Delete a task from a project.

- **projectName** (string, required) — Name of the project
- **taskName** (string, required) — Name of the task to delete

#### `bulk_create_tasks`
Create multiple tasks in a single call. Tasks are created sequentially — earlier tasks persist even if later ones fail. The response includes `succeeded` and `errors` arrays for caller inspection.

- **projectName** (string, required) — Name of the project
- **tasks** (array, required) — Array of task objects with `name`, `description`, optional `priority`, `dependencies`, and `planId`

#### `bulk_update_tasks`
Update status, assignee, or priority on multiple tasks at once. Updates are applied sequentially — earlier updates persist even if later ones fail. The response includes `succeeded` and `errors` arrays.

- **projectName** (string, required) — Name of the project
- **updates** (array, required) — Array of update objects with `name` and optional `status`, `assignedTo`, and `priority`

### Decision Record Tools

#### `add_decision`
Add an architecture decision record (ADR) to document why a technical decision was made.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the decision
- **context** (string, required) — Background and constraints leading to this decision
- **decision** (string, required) — What was decided
- **rationale** (string, required) — Why this approach was chosen
- **consequences** (string, required) — Trade-offs and consequences accepted
- **options** (string[], optional) — Alternatives considered
- **tags** (string[], optional) — Tag names to associate
- **relatedFeatures** (string[], optional) — Related feature IDs

#### `list_decisions`
List all decision records for a project.

- **projectName** (string, required) — Name of the project

#### `get_decision`
Get a single decision record by title.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the decision

#### `update_decision`
Update a decision record's fields or status.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the decision
- **context** (string, optional) — Updated context
- **options** (string[], optional) — Updated alternatives considered
- **decision** (string, optional) — Updated decision
- **rationale** (string, optional) — Updated rationale
- **consequences** (string, optional) — Updated consequences
- **status** (enum: `proposed`, `accepted`, `deprecated`, `superseded`, optional)
- **supersededBy** (string, optional) — ID of the decision that supersedes this one
- **tags** (string[], optional) — Updated tag names
- **relatedFeatures** (string[], optional) — Updated related feature IDs

#### `delete_decision`
Delete a decision record from a project.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the decision to delete

### Milestone Tools

#### `add_milestone`
Add a milestone with a due date to a project.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the milestone
- **description** (string, required) — Description of the milestone
- **dueDate** (string, required) — ISO date string (e.g. `2026-06-30`)
- **featureIds** (string[], optional) — IDs of features this milestone covers
- **planIds** (string[], optional) — IDs of plans this milestone references
- **taskIds** (string[], optional) — IDs of tasks this milestone references

#### `list_milestones`
List all milestones for a project.

- **projectName** (string, required) — Name of the project

#### `get_milestone`
Get a single milestone by name.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the milestone

#### `update_milestone`
Update a milestone's fields or status.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the milestone
- **description** (string, optional) — New description
- **dueDate** (string, optional) — New due date
- **status** (enum: `planned`, `in-progress`, `completed`, `overdue`, optional)
- **featureIds** (string[], optional) — Updated feature IDs
- **planIds** (string[], optional) — Updated plan IDs
- **taskIds** (string[], optional) — Updated task IDs

#### `delete_milestone`
Delete a milestone from a project.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the milestone to delete

### Risk Register Tools

#### `add_risk`
Add a risk entry to the project risk register. Severity is automatically computed as likelihood × impact.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the risk
- **description** (string, required) — Detailed description of the risk
- **category** (enum: `technical`, `schedule`, `people`, `external`, `budget`, `other`, required)
- **likelihood** (number, required) — Rating 1 (almost never) to 5 (certain)
- **impact** (number, required) — Rating 1 (negligible) to 5 (catastrophic)
- **mitigation** (string, optional) — Mitigation strategy
- **contingency** (string, optional) — Contingency plan
- **owner** (string, optional) — Risk owner
- **tags** (string[], optional) — Tag names to associate
- **relatedFeatures** (string[], optional) — Related feature IDs

#### `list_risks`
List all risks for a project.

- **projectName** (string, required) — Name of the project

#### `get_risk`
Get a single risk by title.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the risk

#### `update_risk`
Update a risk's fields or status. When likelihood or impact changes, severity is automatically recalculated.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the risk
- **description** (string, optional) — Updated description
- **category** (enum: `technical`, `schedule`, `people`, `external`, `budget`, `other`, optional)
- **likelihood** (number, optional) — Updated likelihood rating (1–5)
- **impact** (number, optional) — Updated impact rating (1–5)
- **status** (enum: `identified`, `mitigating`, `materialized`, `closed`, optional)
- **mitigation** (string, optional) — Updated mitigation strategy
- **contingency** (string, optional) — Updated contingency plan
- **owner** (string, optional) — Updated risk owner
- **tags** (string[], optional) — Updated tag names
- **relatedFeatures** (string[], optional) — Updated related feature IDs

#### `delete_risk`
Delete a risk from the project.

- **projectName** (string, required) — Name of the project
- **title** (string, required) — Title of the risk to delete

### Tag Tools

#### `add_tag`
Create a new tag for cross-cutting categorization across all entity types.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Tag name (must be unique within the project)
- **color** (string, optional) — Hex color (e.g. `#ff6600`). Auto-generated if omitted.
- **description** (string, optional) — Description of the tag

#### `list_tags`
List all tags with their assignment counts for a project.

- **projectName** (string, required) — Name of the project

#### `remove_tag`
Delete a tag and remove all its assignments from entities.

- **projectName** (string, required) — Name of the project
- **name** (string, required) — Name of the tag to delete

#### `assign_tag`
Assign a tag to an entity (feature, techspec, research session, plan, task, decision, or risk).

- **projectName** (string, required) — Name of the project
- **tagName** (string, required) — Name of the tag
- **targetType** (enum: `feature`, `techspec`, `research`, `plan`, `task`, `decision`, `risk`, required) — Entity type
- **targetId** (string, required) — ID of the entity to tag

#### `unassign_tag`
Remove a tag from an entity.

- **projectName** (string, required) — Name of the project
- **tagName** (string, required) — Name of the tag
- **targetType** (enum: `feature`, `techspec`, `research`, `plan`, `task`, `decision`, `risk`, required) — Entity type
- **targetId** (string, required) — ID of the entity

#### `search_by_tag`
Find all entity assignments for a given tag.

- **projectName** (string, required) — Name of the project
- **tagName** (string, required) — Name of the tag

### Activity Log Tools

#### `project_activity`
List activity log entries for a project, optionally filtered by entity type, action, entity ID, or count limit.

- **projectName** (string, required) — Name of the project
- **entityType** (enum: `project`, `feature`, `techspec`, `research`, `plan`, `task`, `decision`, `risk`, `tag`, optional) — Filter by entity type
- **action** (enum: `created`, `updated`, `deleted`, `status_changed`, `reassigned`, `tagged`, `untagged`, optional) — Filter by action type
- **entityId** (string, optional) — Filter by specific entity ID
- **limit** (number, optional) — Maximum number of entries to return

### Export / Import Tools

#### `export_project`
Export an entire project as a portable JSON bundle containing all entities, tags, assignments, and activity history.

- **projectName** (string, required) — Name of the project

#### `import_project`
Import a project from a previously exported JSON bundle. Automatically remaps all IDs to avoid collisions.

- **projectExport** (object, required) — The project export JSON object (from `export_project`)
- **importAs** (string, optional) — New name for the imported project (defaults to original name)
- **overwriteExisting** (boolean, optional) — Overwrite if project already exists (default: `false`)

### Tier 4 Utility Tools

#### `archive_project`
Archive a project (sets status to `archived`). Archived projects remain on disk but are excluded from `list_projects` by default.

- **projectName** (string, required) — Name of the project to archive

#### `unarchive_project`
Unarchive a project (sets status back to `active`).

- **projectName** (string, required) — Name of the project to unarchive

#### `get_project_tree`
Get a lightweight table-of-contents view of a project showing all entities with their IDs and statuses, plus entity counts per category.

- **projectName** (string, required) — Name of the project

#### `template_project`
Create a new project seeded from an existing project's structure. Copies features, techspecs, plans, decisions, and tags with reset statuses and new IDs. Optionally copies tasks as well.

- **sourceProjectName** (string, required) — Project to template from
- **newProjectName** (string, required) — Name for the new project
- **newDescription** (string, optional) — Description for the new project
- **copyTasks** (boolean, optional) — Also copy tasks (reset to pending, unassigned)

### Validation & Export Tools

#### `validate_project`
Check a project for broken cross-entity references. Scans all entities and reports issues like broken feature dependencies, orphaned techspecs, tasks referencing deleted plans, and milestone references to non-existent entities.

- **projectName** (string, required) — Name of the project

#### `export_markdown`
Export a project as a formatted Markdown document suitable for sharing, README files, or documentation sites. Includes summary tables, ADR sections, risk register, milestone timeline, task board grouped by status, and more.

- **projectName** (string, required) — Name of the project

### Advanced Tools

#### `search_project`
Full-text search across all entities (features, techspecs, research, plans, tasks, decisions, risks, milestones) in a project.

- **projectName** (string, required) — Name of the project
- **query** (string, required) — Search query string (case-insensitive)

#### `project_summary`
Generate a comprehensive summary of a project including counts and breakdowns by status and priority for features, plans, tasks, decisions, risks, and tags.

- **projectName** (string, required) — Name of the project

#### `dependency_graph`
Trace dependencies for a feature or task. Shows what it depends on and what depends on it, up to a configurable depth (default 1, max 3).

- **projectName** (string, required) — Name of the project
- **entityType** (enum: `feature`, `task`, required) — Type of entity
- **entityName** (string, required) — Name of the feature or task
- **maxDepth** (number, optional) — Maximum traversal depth (default: 1, max: 3)

## Persistence

All projects and their files are stored on disk in an OS-appropriate data directory:

| Platform | Data directory |
|---|---|
| **macOS** | `~/Library/Application Support/project-planer-mcp/` |
| **Linux** | `~/.local/share/project-planer-mcp/` |
| **Windows** | `%APPDATA%/project-planer-mcp/` |

Each entity (project, feature, techspec, research session, plan, task) is stored as an individual JSON file, providing natural version control and easy inspection.

## Usage

### Local development

```bash
npm run build
node build/index.js
```

### npx (from local checkout)

```bash
npx project-planer-mcp
```

### MCP Settings Configuration

Add to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "project-planer": {
      "command": "node",
      "args": ["/path/to/ProjectPlanerMCP/build/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Project Structure

```
ProjectPlanerMCP/
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   └── index.ts        # MCP server implementation
└── build/              # Compiled output (gitignored)
    ├── index.js
    ├── index.js.map
    ├── index.d.ts
    └── index.d.ts.map