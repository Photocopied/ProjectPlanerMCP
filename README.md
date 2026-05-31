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
        └── Tasks/
            └── task-name-YYYYMMDD-HHMMSS.json
```

### Data Flow

```
Features (capabilities)
    ↕ referenced by
TechSpecs (technical approach)
    ↕ referenced by
Plans (implementation strategy)
    ↕ referenced by
Tasks (executable work items)
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

### Advanced Tools

#### `search_project`
Full-text search across all entities (features, techspecs, research, plans, tasks) in a project. Searches names, descriptions, details, steps, findings, and more.

- **projectName** (string, required) — Name of the project
- **query** (string, required) — Search query string (case-insensitive)

#### `project_summary`
Generate a comprehensive summary of a project including counts and breakdowns by status and priority for features, plans, and tasks.

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