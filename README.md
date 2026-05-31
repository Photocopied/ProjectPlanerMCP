# Project Planer MCP

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for creating and managing project plans with tasks. Designed to work with AI assistants like Cline.

## Tools

### `create_project`
Create a new project plan.

- **name** (string, required) — Name of the project
- **description** (string, optional) — Description of the project

### `add_task`
Add a task to an existing project.

- **projectId** (string, required) — ID of the project
- **description** (string, required) — Description of the task
- **priority** (enum: `low`, `medium`, `high`, optional) — Task priority (default: `medium`)

### `list_projects`
List all projects with task counts.

### `get_project`
Get full project details including all tasks.

- **projectId** (string, required) — ID of the project

### `update_task_status`
Update a task's status.

- **projectId** (string, required) — ID of the project
- **taskId** (string, required) — ID of the task
- **status** (enum: `pending`, `in-progress`, `completed`, required) — New status

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