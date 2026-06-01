# Project Planer MCP

[![License](https://img.shields.io/github/license/Photocopied/ProjectPlanerMCP)](LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for creating and managing rich project plans with features, technical specifications, research sessions, implementation plans, architecture decisions, risks, milestones, and tasks. Designed to work with AI assistants like Cline.

## Installation

```bash
# Clone the repository
git clone https://github.com/Photocopied/ProjectPlanerMCP.git
cd ProjectPlanerMCP

# Install dependencies
npm install

# Build
npm run build

# Run
node build/index.js
```

Or run directly with npx:

```bash
npx project-planer-mcp
```

## MCP Settings Configuration

Add to your `cline_mcp_settings.json`:

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

## Quick Start

```markdown
1. Create a project: `create_project(name: "my-app")`
2. Add features: `add_feature(projectName: "my-app", name: "auth", description: "User auth")`
3. Create tasks: `create_task(projectName: "my-app", name: "setup-auth", description: "Implement OAuth")`
```

## Documentation

- **[Architecture](docs/architecture.md)** — Directory structure, data flow, persistence
- **[Tools Reference](docs/tools.md)** — Complete reference for all 60+ MCP tools
## Development

```bash
npm run build     # Compile TypeScript
npm test          # Run tests
```

## License

[MIT](LICENSE)