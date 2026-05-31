#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * In-memory storage for projects and their tasks.
 * In a real implementation this could be backed by a database or file system.
 */
interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

const projects: Map<string, Project> = new Map();

/**
 * Helper: generate a simple unique ID.
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Type guards for tool arguments.
 */

interface CreateProjectArgs {
  name: string;
  description?: string;
}

function isValidCreateProjectArgs(args: unknown): args is CreateProjectArgs {
  if (typeof args !== 'object' || args === null) return false;
  const a = args as Record<string, unknown>;
  return typeof a.name === 'string' && a.name.length > 0;
}

interface AddTaskArgs {
  projectId: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
}

function isValidAddTaskArgs(args: unknown): args is AddTaskArgs {
  if (typeof args !== 'object' || args === null) return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a.projectId === 'string' &&
    typeof a.description === 'string' &&
    a.description.length > 0 &&
    (a.priority === undefined ||
      ['low', 'medium', 'high'].includes(a.priority as string))
  );
}

interface ListProjectsArgs {
  /* no args needed */
}

interface GetProjectArgs {
  projectId: string;
}

function isValidGetProjectArgs(args: unknown): args is GetProjectArgs {
  if (typeof args !== 'object' || args === null) return false;
  const a = args as Record<string, unknown>;
  return typeof a.projectId === 'string' && a.projectId.length > 0;
}

interface UpdateTaskStatusArgs {
  projectId: string;
  taskId: string;
  status: 'pending' | 'in-progress' | 'completed';
}

function isValidUpdateTaskStatusArgs(args: unknown): args is UpdateTaskStatusArgs {
  if (typeof args !== 'object' || args === null) return false;
  const a = args as Record<string, unknown>;
  return (
    typeof a.projectId === 'string' &&
    typeof a.taskId === 'string' &&
    typeof a.status === 'string' &&
    ['pending', 'in-progress', 'completed'].includes(a.status as string)
  );
}

class ProjectPlanerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'project-planer-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_project',
          description: 'Create a new project plan with an optional description',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the project',
              },
              description: {
                type: 'string',
                description: 'Optional description of the project',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'add_task',
          description: 'Add a task to an existing project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'ID of the project to add the task to',
              },
              description: {
                type: 'string',
                description: 'Description of the task',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Priority of the task (default: medium)',
              },
            },
            required: ['projectId', 'description'],
          },
        },
        {
          name: 'list_projects',
          description: 'List all projects with their basic info and task counts',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_project',
          description: 'Get detailed information about a specific project including all tasks',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'ID of the project to retrieve',
              },
            },
            required: ['projectId'],
          },
        },
        {
          name: 'update_task_status',
          description: 'Update the status of a task in a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'ID of the project containing the task',
              },
              taskId: {
                type: 'string',
                description: 'ID of the task to update',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in-progress', 'completed'],
                description: 'New status for the task',
              },
            },
            required: ['projectId', 'taskId', 'status'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_project':
          return this.handleCreateProject(request.params.arguments);
        case 'add_task':
          return this.handleAddTask(request.params.arguments);
        case 'list_projects':
          return this.handleListProjects();
        case 'get_project':
          return this.handleGetProject(request.params.arguments);
        case 'update_task_status':
          return this.handleUpdateTaskStatus(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private handleCreateProject(args: unknown) {
    if (!isValidCreateProjectArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments: name (string) is required'
      );
    }

    const id = generateId();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name: args.name,
      description: args.description ?? '',
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };

    projects.set(id, project);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(project, null, 2),
        },
      ],
    };
  }

  private handleAddTask(args: unknown) {
    if (!isValidAddTaskArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments: projectId (string) and description (string) are required'
      );
    }

    const project = projects.get(args.projectId);
    if (!project) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project not found: ${args.projectId}`
      );
    }

    const task: Task = {
      id: generateId(),
      description: args.description,
      status: 'pending',
      priority: args.priority ?? 'medium',
      createdAt: new Date().toISOString(),
    };

    project.tasks.push(task);
    project.updatedAt = new Date().toISOString();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  }

  private handleListProjects() {
    const projectList = Array.from(projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      taskCount: p.tasks.length,
      completedTasks: p.tasks.filter((t) => t.status === 'completed').length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(projectList, null, 2),
        },
      ],
    };
  }

  private handleGetProject(args: unknown) {
    if (!isValidGetProjectArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments: projectId (string) is required'
      );
    }

    const project = projects.get(args.projectId);
    if (!project) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project not found: ${args.projectId}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(project, null, 2),
        },
      ],
    };
  }

  private handleUpdateTaskStatus(args: unknown) {
    if (!isValidUpdateTaskStatusArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid arguments: projectId (string), taskId (string), and status (pending|in-progress|completed) are required'
      );
    }

    const project = projects.get(args.projectId);
    if (!project) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project not found: ${args.projectId}`
      );
    }

    const task = project.tasks.find((t) => t.id === args.taskId);
    if (!task) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Task not found: ${args.taskId}`
      );
    }

    task.status = args.status;
    project.updatedAt = new Date().toISOString();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Project Planer MCP server running on stdio');
  }
}

const server = new ProjectPlanerServer();
server.run().catch(console.error);