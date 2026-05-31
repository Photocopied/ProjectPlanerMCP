import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ProjectStore } from './store.js';
import type {
  Feature,
  Task,
  Risk,
  TagAssignment,
  ProjectExport,
} from './types.js';

// ---------------------------------------------------------------------------
// Store instance
// ---------------------------------------------------------------------------

const store = new ProjectStore();

// ---------------------------------------------------------------------------
// Type guards for tool arguments
// ---------------------------------------------------------------------------

function asRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null) throw new McpError(ErrorCode.InvalidParams, 'Arguments must be an object');
  return args as Record<string, unknown>;
}

function getString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) throw new McpError(ErrorCode.InvalidParams, `"${key}" is required and must be a non-empty string`);
  return v;
}

function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((e) => typeof e === 'string')) throw new McpError(ErrorCode.InvalidParams, `"${key}" must be an array of strings`);
  return v as string[];
}

function getOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number') throw new McpError(ErrorCode.InvalidParams, `"${key}" must be a number`);
  return v;
}

function getBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new McpError(ErrorCode.InvalidParams, `"${key}" must be a boolean`);
  return v;
}

function getOptionalEnum<T extends string>(args: Record<string, unknown>, key: string, validValues: readonly T[]): T | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (validValues.includes(v as T)) return v as T;
  throw new McpError(ErrorCode.InvalidParams, `"${key}" must be one of: ${validValues.join(', ')}`);
}

function getNumber(args: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new McpError(ErrorCode.InvalidParams, `"${key}" must be an integer between ${min} and ${max}`);
  return v;
}

function textResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function textContentResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

class ProjectPlanerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'project-planer-mcp', version: '0.7.0' },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => { await this.server.close(); process.exit(0); });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'create_project', description: 'Create a new project with its directory scaffold.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
        { name: 'list_projects', description: 'List all projects with their metadata', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_project', description: 'Get detailed information about a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'update_project', description: "Update a project's description or status", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['active', 'archived'] } }, required: ['projectName'] } },
        { name: 'delete_project', description: 'Permanently delete a project and all its files', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'archive_project', description: 'Archive a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'unarchive_project', description: 'Unarchive a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_project_tree', description: 'Get a lightweight table-of-contents view of a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'template_project', description: 'Create a new project seeded from an existing project\'s structure', inputSchema: { type: 'object', properties: { sourceProjectName: { type: 'string' }, newProjectName: { type: 'string' }, newDescription: { type: 'string' }, copyTasks: { type: 'boolean' } }, required: ['sourceProjectName', 'newProjectName'] } },

        { name: 'add_feature', description: 'Add a feature capability to a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } }, required: ['projectName', 'name', 'description'] } },
        { name: 'list_features', description: 'List all features for a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_feature', description: 'Get a single feature by name', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, featureName: { type: 'string' } }, required: ['projectName', 'featureName'] } },
        { name: 'update_feature', description: "Update a feature's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, featureName: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, status: { type: 'string', enum: ['proposed', 'approved', 'in-progress', 'completed', 'cancelled'] }, dependencies: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'featureName'] } },
        { name: 'delete_feature', description: 'Delete a feature from a project', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, featureName: { type: 'string' } }, required: ['projectName', 'featureName'] } },

        { name: 'add_techspec', description: 'Add a technical specification', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, featureId: { type: 'string' }, details: { type: 'string' } }, required: ['projectName', 'name', 'description', 'featureId', 'details'] } },
        { name: 'list_techspecs', description: 'List all technical specifications', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_techspec', description: 'Get a single technical specification', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, techSpecName: { type: 'string' } }, required: ['projectName', 'techSpecName'] } },
        { name: 'update_techspec', description: "Update a technical specification's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, techSpecName: { type: 'string' }, description: { type: 'string' }, featureId: { type: 'string' }, details: { type: 'string' } }, required: ['projectName', 'techSpecName'] } },
        { name: 'delete_techspec', description: 'Delete a technical specification', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, techSpecName: { type: 'string' } }, required: ['projectName', 'techSpecName'] } },

        { name: 'add_research', description: 'Add a research session', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, sessionName: { type: 'string' }, query: { type: 'string' }, findings: { type: 'string' }, conclusions: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'sessionName', 'query', 'findings', 'conclusions'] } },
        { name: 'list_research', description: 'List all research sessions', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_research', description: 'Get a single research session', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, sessionName: { type: 'string' } }, required: ['projectName', 'sessionName'] } },
        { name: 'update_research', description: "Update a research session's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, sessionName: { type: 'string' }, findings: { type: 'string' }, conclusions: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'sessionName'] } },
        { name: 'delete_research', description: 'Delete a research session', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, sessionName: { type: 'string' } }, required: ['projectName', 'sessionName'] } },

        { name: 'create_plan', description: 'Create an implementation plan', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, featureIds: { type: 'array', items: { type: 'string' } }, techSpecIds: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'name', 'description'] } },
        { name: 'list_plans', description: 'List all plans', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'update_plan_status', description: "Update a plan's status", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, planName: { type: 'string' }, status: { type: 'string', enum: ['draft', 'review', 'approved', 'implementing', 'complete'] }, steps: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'planName', 'status'] } },
        { name: 'delete_plan', description: 'Delete a plan', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, planName: { type: 'string' } }, required: ['projectName', 'planName'] } },

        { name: 'create_task', description: 'Create a task', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, dependencies: { type: 'array', items: { type: 'string' } }, planId: { type: 'string' } }, required: ['projectName', 'name', 'description'] } },
        { name: 'list_tasks', description: 'List all tasks', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_task', description: 'Get a single task', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, taskName: { type: 'string' } }, required: ['projectName', 'taskName'] } },
        { name: 'update_task_status', description: "Update a task's status", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, taskName: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in-progress', 'completed', 'blocked'] } }, required: ['projectName', 'taskName', 'status'] } },
        { name: 'update_task', description: "Update a task's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, taskName: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, status: { type: 'string', enum: ['pending', 'in-progress', 'completed', 'blocked'] }, assignedTo: { type: 'string' }, dependencies: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'taskName'] } },
        { name: 'assign_task', description: 'Assign a task', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, taskName: { type: 'string' }, assignee: { type: 'string' } }, required: ['projectName', 'taskName', 'assignee'] } },
        { name: 'delete_task', description: 'Delete a task', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, taskName: { type: 'string' } }, required: ['projectName', 'taskName'] } },
        { name: 'bulk_create_tasks', description: 'Create multiple tasks in a single call', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, dependencies: { type: 'array', items: { type: 'string' } }, planId: { type: 'string' } }, required: ['name', 'description'] } } }, required: ['projectName', 'tasks'] } },
        { name: 'bulk_update_tasks', description: 'Update status, assignee, or priority on multiple tasks at once', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, updates: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in-progress', 'completed', 'blocked'] }, assignedTo: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } }, required: ['name'] } } }, required: ['projectName', 'updates'] } },

        { name: 'add_decision', description: 'Add an architecture decision record (ADR)', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' }, context: { type: 'string' }, decision: { type: 'string' }, rationale: { type: 'string' }, consequences: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, relatedFeatures: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'title', 'context', 'decision', 'rationale', 'consequences'] } },
        { name: 'list_decisions', description: 'List all decision records', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_decision', description: 'Get a single decision record', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' } }, required: ['projectName', 'title'] } },
        { name: 'update_decision', description: "Update a decision record's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' }, context: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, decision: { type: 'string' }, rationale: { type: 'string' }, consequences: { type: 'string' }, status: { type: 'string', enum: ['proposed', 'accepted', 'deprecated', 'superseded'] }, supersededBy: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, relatedFeatures: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'title'] } },
        { name: 'delete_decision', description: 'Delete a decision record', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' } }, required: ['projectName', 'title'] } },

        { name: 'add_risk', description: 'Add a risk entry', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string', enum: ['technical', 'schedule', 'people', 'external', 'budget', 'other'] }, likelihood: { type: 'number' }, impact: { type: 'number' }, mitigation: { type: 'string' }, contingency: { type: 'string' }, owner: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, relatedFeatures: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'title', 'description', 'category', 'likelihood', 'impact'] } },
        { name: 'list_risks', description: 'List all risks', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_risk', description: 'Get a single risk', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' } }, required: ['projectName', 'title'] } },
        { name: 'update_risk', description: "Update a risk's fields", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string', enum: ['technical', 'schedule', 'people', 'external', 'budget', 'other'] }, likelihood: { type: 'number' }, impact: { type: 'number' }, status: { type: 'string', enum: ['identified', 'mitigating', 'materialized', 'closed'] }, mitigation: { type: 'string' }, contingency: { type: 'string' }, owner: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, relatedFeatures: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'title'] } },
        { name: 'delete_risk', description: 'Delete a risk', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, title: { type: 'string' } }, required: ['projectName', 'title'] } },

        { name: 'add_milestone', description: 'Add a milestone with a due date', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, dueDate: { type: 'string', description: 'ISO date string (e.g. 2026-06-30)' }, featureIds: { type: 'array', items: { type: 'string' } }, planIds: { type: 'array', items: { type: 'string' } }, taskIds: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'name', 'description', 'dueDate'] } },
        { name: 'list_milestones', description: 'List all milestones', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'get_milestone', description: 'Get a single milestone by name', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' } }, required: ['projectName', 'name'] } },
        { name: 'update_milestone', description: "Update a milestone's fields or status", inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, dueDate: { type: 'string' }, status: { type: 'string', enum: ['planned', 'in-progress', 'completed', 'overdue'] }, featureIds: { type: 'array', items: { type: 'string' } }, planIds: { type: 'array', items: { type: 'string' } }, taskIds: { type: 'array', items: { type: 'string' } } }, required: ['projectName', 'name'] } },
        { name: 'delete_milestone', description: 'Delete a milestone', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' } }, required: ['projectName', 'name'] } },

        { name: 'add_tag', description: 'Create a new tag', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' }, description: { type: 'string' } }, required: ['projectName', 'name'] } },
        { name: 'list_tags', description: 'List all tags with assignment counts', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'remove_tag', description: 'Delete a tag and its assignments', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, name: { type: 'string' } }, required: ['projectName', 'name'] } },
        { name: 'assign_tag', description: 'Assign a tag to an entity', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, tagName: { type: 'string' }, targetType: { type: 'string', enum: ['feature', 'techspec', 'research', 'plan', 'task', 'decision', 'risk', 'milestone'] }, targetId: { type: 'string' } }, required: ['projectName', 'tagName', 'targetType', 'targetId'] } },
        { name: 'unassign_tag', description: 'Remove a tag from an entity', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, tagName: { type: 'string' }, targetType: { type: 'string', enum: ['feature', 'techspec', 'research', 'plan', 'task', 'decision', 'risk', 'milestone'] }, targetId: { type: 'string' } }, required: ['projectName', 'tagName', 'targetType', 'targetId'] } },
        { name: 'search_by_tag', description: 'Find all entities with a given tag', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, tagName: { type: 'string' } }, required: ['projectName', 'tagName'] } },

        { name: 'project_activity', description: 'List activity log entries', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, entityType: { type: 'string', enum: ['project', 'feature', 'techspec', 'research', 'plan', 'task', 'decision', 'risk', 'tag', 'milestone'] }, action: { type: 'string', enum: ['created', 'updated', 'deleted', 'status_changed', 'reassigned', 'tagged', 'untagged'] }, entityId: { type: 'string' }, limit: { type: 'number' } }, required: ['projectName'] } },

        { name: 'export_project', description: 'Export a project as a JSON bundle', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'import_project', description: 'Import a project from a JSON bundle', inputSchema: { type: 'object', properties: { projectExport: { type: 'object' }, importAs: { type: 'string' }, overwriteExisting: { type: 'boolean' } }, required: ['projectExport'] } },

        { name: 'validate_project', description: 'Check a project for broken cross-entity references (dependencies, featureIds, planIds, etc.)', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'export_markdown', description: 'Export a project as a formatted Markdown document', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },

        { name: 'search_project', description: 'Full-text search across all entities', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, query: { type: 'string' } }, required: ['projectName', 'query'] } },
        { name: 'project_summary', description: 'Generate a comprehensive project summary', inputSchema: { type: 'object', properties: { projectName: { type: 'string' } }, required: ['projectName'] } },
        { name: 'dependency_graph', description: 'Trace dependencies for a feature or task', inputSchema: { type: 'object', properties: { projectName: { type: 'string' }, entityType: { type: 'string', enum: ['feature', 'task'] }, entityName: { type: 'string' }, maxDepth: { type: 'number' } }, required: ['projectName', 'entityType', 'entityName'] } },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const a = asRecord(args);
      try {
        switch (name) {
          case 'create_project': return await this.handleCreateProject(a);
          case 'list_projects': return await this.handleListProjects();
          case 'get_project': return await this.handleGetProject(a);
          case 'update_project': return await this.handleUpdateProject(a);
          case 'delete_project': return await this.handleDeleteProject(a);
          case 'archive_project': return await this.handleArchiveProject(a);
          case 'unarchive_project': return await this.handleUnarchiveProject(a);
          case 'get_project_tree': return await this.handleGetProjectTree(a);
          case 'template_project': return await this.handleTemplateProject(a);

          case 'add_feature': return await this.handleAddFeature(a);
          case 'list_features': return await this.handleListFeatures(a);
          case 'get_feature': return await this.handleGetFeature(a);
          case 'update_feature': return await this.handleUpdateFeature(a);
          case 'delete_feature': return await this.handleDeleteFeature(a);

          case 'add_techspec': return await this.handleAddTechSpec(a);
          case 'list_techspecs': return await this.handleListTechSpecs(a);
          case 'get_techspec': return await this.handleGetTechSpec(a);
          case 'update_techspec': return await this.handleUpdateTechSpec(a);
          case 'delete_techspec': return await this.handleDeleteTechSpec(a);

          case 'add_research': return await this.handleAddResearch(a);
          case 'list_research': return await this.handleListResearch(a);
          case 'get_research': return await this.handleGetResearch(a);
          case 'update_research': return await this.handleUpdateResearch(a);
          case 'delete_research': return await this.handleDeleteResearch(a);

          case 'create_plan': return await this.handleCreatePlan(a);
          case 'list_plans': return await this.handleListPlans(a);
          case 'update_plan_status': return await this.handleUpdatePlanStatus(a);
          case 'delete_plan': return await this.handleDeletePlan(a);

          case 'create_task': return await this.handleCreateTask(a);
          case 'list_tasks': return await this.handleListTasks(a);
          case 'get_task': return await this.handleGetTask(a);
          case 'update_task_status': return await this.handleUpdateTaskStatus(a);
          case 'update_task': return await this.handleUpdateTask(a);
          case 'assign_task': return await this.handleAssignTask(a);
          case 'delete_task': return await this.handleDeleteTask(a);
          case 'bulk_create_tasks': return await this.handleBulkCreateTasks(a);
          case 'bulk_update_tasks': return await this.handleBulkUpdateTasks(a);

          case 'add_decision': return await this.handleAddDecision(a);
          case 'list_decisions': return await this.handleListDecisions(a);
          case 'get_decision': return await this.handleGetDecision(a);
          case 'update_decision': return await this.handleUpdateDecision(a);
          case 'delete_decision': return await this.handleDeleteDecision(a);

          case 'add_risk': return await this.handleAddRisk(a);
          case 'list_risks': return await this.handleListRisks(a);
          case 'get_risk': return await this.handleGetRisk(a);
          case 'update_risk': return await this.handleUpdateRisk(a);
          case 'delete_risk': return await this.handleDeleteRisk(a);

          case 'add_milestone': return await this.handleAddMilestone(a);
          case 'list_milestones': return await this.handleListMilestones(a);
          case 'get_milestone': return await this.handleGetMilestone(a);
          case 'update_milestone': return await this.handleUpdateMilestone(a);
          case 'delete_milestone': return await this.handleDeleteMilestone(a);

          case 'add_tag': return await this.handleAddTag(a);
          case 'list_tags': return await this.handleListTags(a);
          case 'remove_tag': return await this.handleRemoveTag(a);
          case 'assign_tag': return await this.handleAssignTag(a);
          case 'unassign_tag': return await this.handleUnassignTag(a);
          case 'search_by_tag': return await this.handleSearchByTag(a);

          case 'project_activity': return await this.handleProjectActivity(a);

          case 'export_project': return await this.handleExportProject(a);
          case 'import_project': return await this.handleImportProject(a);

          case 'validate_project': return await this.handleValidateProject(a);
          case 'export_markdown': return await this.handleExportMarkdown(a);

          case 'search_project': return await this.handleSearchProject(a);
          case 'project_summary': return await this.handleProjectSummary(a);
          case 'dependency_graph': return await this.handleDependencyGraph(a);

          default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (err) {
        if (err instanceof McpError) throw err;
        throw new McpError(ErrorCode.InternalError, `Unexpected error: ${(err as Error).message}`);
      }
    });
  }

  // -- Handler methods -----------------------------------------------------

  private async handleCreateProject(args: Record<string, unknown>) { return textResponse(await store.createProject(getString(args, 'name'), getOptionalString(args, 'description') ?? '')); }
  private async handleListProjects() { return textResponse(await store.listProjects()); }
  private async handleGetProject(args: Record<string, unknown>) { return textResponse(await store.getProject(getString(args, 'projectName'))); }
  private async handleUpdateProject(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const s = getOptionalEnum(args, 'status', ['active', 'archived'] as const); if (s !== undefined) updates.status = s;
    return textResponse(await store.updateProject(getString(args, 'projectName'), updates as any));
  }
  private async handleDeleteProject(_args: Record<string, unknown>) { await store.deleteProject(getString(_args, 'projectName')); return textResponse({ deleted: true }); }
  private async handleArchiveProject(args: Record<string, unknown>) { return textResponse(await store.archiveProject(getString(args, 'projectName'))); }
  private async handleUnarchiveProject(args: Record<string, unknown>) { return textResponse(await store.unarchiveProject(getString(args, 'projectName'))); }
  private async handleGetProjectTree(args: Record<string, unknown>) { return textResponse(await store.getProjectTree(getString(args, 'projectName'))); }
  private async handleTemplateProject(args: Record<string, unknown>) { return textResponse(await store.templateProject(getString(args, 'sourceProjectName'), getString(args, 'newProjectName'), getOptionalString(args, 'newDescription'), getBoolean(args, 'copyTasks') ?? false)); }

  private async handleAddFeature(args: Record<string, unknown>) { return textResponse(await store.addFeature(getString(args, 'projectName'), getString(args, 'name'), getString(args, 'description'), (args.priority as Feature['priority']) ?? 'medium')); }
  private async handleListFeatures(args: Record<string, unknown>) { return textResponse(await store.listFeatures(getString(args, 'projectName'))); }
  private async handleGetFeature(args: Record<string, unknown>) { return textResponse(await store.getFeature(getString(args, 'projectName'), getString(args, 'featureName'))); }
  private async handleUpdateFeature(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const p = getOptionalEnum(args, 'priority', ['low', 'medium', 'high', 'critical'] as const); if (p !== undefined) updates.priority = p;
    const s = getOptionalEnum(args, 'status', ['proposed', 'approved', 'in-progress', 'completed', 'cancelled'] as const); if (s !== undefined) updates.status = s;
    const deps = getStringArray(args, 'dependencies'); if (deps.length > 0) updates.dependencies = deps;
    return textResponse(await store.updateFeature(getString(args, 'projectName'), getString(args, 'featureName'), updates as any));
  }
  private async handleDeleteFeature(args: Record<string, unknown>) { await store.deleteFeature(getString(args, 'projectName'), getString(args, 'featureName')); return textResponse({ deleted: true }); }

  private async handleAddTechSpec(args: Record<string, unknown>) { return textResponse(await store.addTechSpec(getString(args, 'projectName'), getString(args, 'name'), getString(args, 'description'), getString(args, 'featureId'), getString(args, 'details'))); }
  private async handleListTechSpecs(args: Record<string, unknown>) { return textResponse(await store.listTechSpecs(getString(args, 'projectName'))); }
  private async handleGetTechSpec(args: Record<string, unknown>) { return textResponse(await store.getTechSpec(getString(args, 'projectName'), getString(args, 'techSpecName'))); }
  private async handleUpdateTechSpec(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const f = getOptionalString(args, 'featureId'); if (f !== undefined) updates.featureId = f;
    const dt = getOptionalString(args, 'details'); if (dt !== undefined) updates.details = dt;
    return textResponse(await store.updateTechSpec(getString(args, 'projectName'), getString(args, 'techSpecName'), updates as any));
  }
  private async handleDeleteTechSpec(args: Record<string, unknown>) { await store.deleteTechSpec(getString(args, 'projectName'), getString(args, 'techSpecName')); return textResponse({ deleted: true }); }

  private async handleAddResearch(args: Record<string, unknown>) { return textResponse(await store.addResearch(getString(args, 'projectName'), getString(args, 'sessionName'), getString(args, 'query'), getString(args, 'findings'), getString(args, 'conclusions'), getStringArray(args, 'sources'))); }
  private async handleListResearch(args: Record<string, unknown>) { return textResponse(await store.listResearch(getString(args, 'projectName'))); }
  private async handleGetResearch(args: Record<string, unknown>) { return textResponse(await store.getResearch(getString(args, 'projectName'), getString(args, 'sessionName'))); }
  private async handleUpdateResearch(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const f = getOptionalString(args, 'findings'); if (f !== undefined) updates.findings = f;
    const c = getOptionalString(args, 'conclusions'); if (c !== undefined) updates.conclusions = c;
    const s = getStringArray(args, 'sources'); if (s.length > 0) updates.sources = s;
    return textResponse(await store.updateResearch(getString(args, 'projectName'), getString(args, 'sessionName'), updates as any));
  }
  private async handleDeleteResearch(args: Record<string, unknown>) { await store.deleteResearch(getString(args, 'projectName'), getString(args, 'sessionName')); return textResponse({ deleted: true }); }

  private async handleCreatePlan(args: Record<string, unknown>) { return textResponse(await store.createPlan(getString(args, 'projectName'), getString(args, 'name'), getString(args, 'description'), getStringArray(args, 'featureIds'), getStringArray(args, 'techSpecIds'), getStringArray(args, 'steps'))); }
  private async handleListPlans(args: Record<string, unknown>) { return textResponse(await store.listPlans(getString(args, 'projectName'))); }
  private async handleUpdatePlanStatus(args: Record<string, unknown>) {
    const status = getOptionalEnum(args, 'status', ['draft', 'review', 'approved', 'implementing', 'complete'] as const);
    if (!status) throw new McpError(ErrorCode.InvalidParams, '"status" is required');
    const steps = getStringArray(args, 'steps');
    return textResponse(await store.updatePlanStatus(getString(args, 'projectName'), getString(args, 'planName'), status, steps.length > 0 ? steps : undefined));
  }
  private async handleDeletePlan(args: Record<string, unknown>) { await store.deletePlan(getString(args, 'projectName'), getString(args, 'planName')); return textResponse({ deleted: true }); }

  private async handleCreateTask(args: Record<string, unknown>) { return textResponse(await store.createTask(getString(args, 'projectName'), getString(args, 'name'), getString(args, 'description'), (args.priority as Task['priority']) ?? 'medium', getStringArray(args, 'dependencies'), getOptionalString(args, 'planId') ?? '')); }
  private async handleListTasks(args: Record<string, unknown>) { return textResponse(await store.listTasks(getString(args, 'projectName'))); }
  private async handleGetTask(args: Record<string, unknown>) { const t = await store.getTask(getString(args, 'projectName'), getString(args, 'taskName')); if (!t) throw new McpError(ErrorCode.InvalidParams, `Task not found`); return textResponse(t); }
  private async handleUpdateTaskStatus(args: Record<string, unknown>) { const s = getOptionalEnum(args, 'status', ['pending', 'in-progress', 'completed', 'blocked'] as const); if (!s) throw new McpError(ErrorCode.InvalidParams, '"status" is required'); return textResponse(await store.updateTaskStatus(getString(args, 'projectName'), getString(args, 'taskName'), s)); }
  private async handleUpdateTask(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const p = getOptionalEnum(args, 'priority', ['low', 'medium', 'high', 'critical'] as const); if (p !== undefined) updates.priority = p;
    const s = getOptionalEnum(args, 'status', ['pending', 'in-progress', 'completed', 'blocked'] as const); if (s !== undefined) updates.status = s;
    const a = getOptionalString(args, 'assignedTo'); if (a !== undefined) updates.assignedTo = a;
    const deps = getStringArray(args, 'dependencies'); if (deps.length > 0) updates.dependencies = deps;
    return textResponse(await store.updateTask(getString(args, 'projectName'), getString(args, 'taskName'), updates as any));
  }
  private async handleAssignTask(args: Record<string, unknown>) { return textResponse(await store.assignTask(getString(args, 'projectName'), getString(args, 'taskName'), getString(args, 'assignee'))); }
  private async handleDeleteTask(args: Record<string, unknown>) { await store.deleteTask(getString(args, 'projectName'), getString(args, 'taskName')); return textResponse({ deleted: true }); }

  private async handleBulkCreateTasks(args: Record<string, unknown>) { return textResponse(await store.bulkCreateTasks(getString(args, 'projectName'), args.tasks as any[])); }
  private async handleBulkUpdateTasks(args: Record<string, unknown>) { return textResponse(await store.bulkUpdateTasks(getString(args, 'projectName'), args.updates as any[])); }

  private async handleAddDecision(args: Record<string, unknown>) { return textResponse(await store.addDecision(getString(args, 'projectName'), getString(args, 'title'), getString(args, 'context'), getString(args, 'decision'), getString(args, 'rationale'), getString(args, 'consequences'), getStringArray(args, 'options'), getStringArray(args, 'tags'), getStringArray(args, 'relatedFeatures'))); }
  private async handleListDecisions(args: Record<string, unknown>) { return textResponse(await store.listDecisions(getString(args, 'projectName'))); }
  private async handleGetDecision(args: Record<string, unknown>) { return textResponse(await store.getDecision(getString(args, 'projectName'), getString(args, 'title'))); }
  private async handleUpdateDecision(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const c = getOptionalString(args, 'context'); if (c !== undefined) updates.context = c;
    const o = getStringArray(args, 'options'); if (o.length > 0) updates.options = o;
    const d = getOptionalString(args, 'decision'); if (d !== undefined) updates.decision = d;
    const r = getOptionalString(args, 'rationale'); if (r !== undefined) updates.rationale = r;
    const cs = getOptionalString(args, 'consequences'); if (cs !== undefined) updates.consequences = cs;
    const s = getOptionalEnum(args, 'status', ['proposed', 'accepted', 'deprecated', 'superseded'] as const); if (s !== undefined) updates.status = s;
    const sb = getOptionalString(args, 'supersededBy'); if (sb !== undefined) updates.supersededBy = sb;
    const t = getStringArray(args, 'tags'); if (t.length > 0) updates.tags = t;
    const rf = getStringArray(args, 'relatedFeatures'); if (rf.length > 0) updates.relatedFeatures = rf;
    return textResponse(await store.updateDecision(getString(args, 'projectName'), getString(args, 'title'), updates as any));
  }
  private async handleDeleteDecision(args: Record<string, unknown>) { await store.deleteDecision(getString(args, 'projectName'), getString(args, 'title')); return textResponse({ deleted: true }); }

  private async handleAddRisk(args: Record<string, unknown>) { return textResponse(await store.addRisk(getString(args, 'projectName'), getString(args, 'title'), getString(args, 'description'), getString(args, 'category') as Risk['category'], getNumber(args, 'likelihood', 1, 5) as Risk['likelihood'], getNumber(args, 'impact', 1, 5) as Risk['impact'], getOptionalString(args, 'mitigation'), getOptionalString(args, 'contingency'), getOptionalString(args, 'owner'), getStringArray(args, 'tags'), getStringArray(args, 'relatedFeatures'))); }
  private async handleListRisks(args: Record<string, unknown>) { return textResponse(await store.listRisks(getString(args, 'projectName'))); }
  private async handleGetRisk(args: Record<string, unknown>) { return textResponse(await store.getRisk(getString(args, 'projectName'), getString(args, 'title'))); }
  private async handleUpdateRisk(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const c = getOptionalEnum(args, 'category', ['technical', 'schedule', 'people', 'external', 'budget', 'other'] as const); if (c !== undefined) updates.category = c;
    if (args.likelihood !== undefined) updates.likelihood = getNumber(args, 'likelihood', 1, 5);
    if (args.impact !== undefined) updates.impact = getNumber(args, 'impact', 1, 5);
    const s = getOptionalEnum(args, 'status', ['identified', 'mitigating', 'materialized', 'closed'] as const); if (s !== undefined) updates.status = s;
    const m = getOptionalString(args, 'mitigation'); if (m !== undefined) updates.mitigation = m;
    const ct = getOptionalString(args, 'contingency'); if (ct !== undefined) updates.contingency = ct;
    const o = getOptionalString(args, 'owner'); if (o !== undefined) updates.owner = o;
    const t = getStringArray(args, 'tags'); if (t.length > 0) updates.tags = t;
    const rf = getStringArray(args, 'relatedFeatures'); if (rf.length > 0) updates.relatedFeatures = rf;
    return textResponse(await store.updateRisk(getString(args, 'projectName'), getString(args, 'title'), updates as any));
  }
  private async handleDeleteRisk(args: Record<string, unknown>) { await store.deleteRisk(getString(args, 'projectName'), getString(args, 'title')); return textResponse({ deleted: true }); }

  private async handleAddMilestone(args: Record<string, unknown>) { return textResponse(await store.addMilestone(getString(args, 'projectName'), getString(args, 'name'), getString(args, 'description'), getString(args, 'dueDate'), getStringArray(args, 'featureIds'), getStringArray(args, 'planIds'), getStringArray(args, 'taskIds'))); }
  private async handleListMilestones(args: Record<string, unknown>) { return textResponse(await store.listMilestones(getString(args, 'projectName'))); }
  private async handleGetMilestone(args: Record<string, unknown>) { return textResponse(await store.getMilestone(getString(args, 'projectName'), getString(args, 'name'))); }
  private async handleUpdateMilestone(args: Record<string, unknown>) {
    const updates: Record<string, unknown> = {};
    const d = getOptionalString(args, 'description'); if (d !== undefined) updates.description = d;
    const dd = getOptionalString(args, 'dueDate'); if (dd !== undefined) updates.dueDate = dd;
    const s = getOptionalEnum(args, 'status', ['planned', 'in-progress', 'completed', 'overdue'] as const); if (s !== undefined) updates.status = s;
    const f = getStringArray(args, 'featureIds'); if (f.length > 0) updates.featureIds = f;
    const p = getStringArray(args, 'planIds'); if (p.length > 0) updates.planIds = p;
    const t = getStringArray(args, 'taskIds'); if (t.length > 0) updates.taskIds = t;
    return textResponse(await store.updateMilestone(getString(args, 'projectName'), getString(args, 'name'), updates as any));
  }
  private async handleDeleteMilestone(args: Record<string, unknown>) { await store.deleteMilestone(getString(args, 'projectName'), getString(args, 'name')); return textResponse({ deleted: true }); }

  private async handleAddTag(args: Record<string, unknown>) { return textResponse(await store.addTag(getString(args, 'projectName'), getString(args, 'name'), getOptionalString(args, 'color'), getOptionalString(args, 'description'))); }
  private async handleListTags(args: Record<string, unknown>) { return textResponse(await store.listTags(getString(args, 'projectName'))); }
  private async handleRemoveTag(args: Record<string, unknown>) { await store.removeTag(getString(args, 'projectName'), getString(args, 'name')); return textResponse({ deleted: true }); }
  private async handleAssignTag(args: Record<string, unknown>) { await store.assignTag(getString(args, 'projectName'), getString(args, 'tagName'), getString(args, 'targetType') as TagAssignment['targetType'], getString(args, 'targetId')); return textResponse({ assigned: true }); }
  private async handleUnassignTag(args: Record<string, unknown>) { await store.unassignTag(getString(args, 'projectName'), getString(args, 'tagName'), getString(args, 'targetType') as TagAssignment['targetType'], getString(args, 'targetId')); return textResponse({ unassigned: true }); }
  private async handleSearchByTag(args: Record<string, unknown>) { return textResponse(await store.searchByTag(getString(args, 'projectName'), getString(args, 'tagName'))); }

  private async handleProjectActivity(args: Record<string, unknown>) {
    const entityType = getOptionalEnum(args, 'entityType', ['project', 'feature', 'techspec', 'research', 'plan', 'task', 'decision', 'risk', 'tag', 'milestone'] as const);
    const action = getOptionalEnum(args, 'action', ['created', 'updated', 'deleted', 'status_changed', 'reassigned', 'tagged', 'untagged'] as const);
    const entityId = getOptionalString(args, 'entityId');
    const limit = getOptionalNumber(args, 'limit');
    return textResponse(await store.listActivity(getString(args, 'projectName'), { entityType, action, entityId, limit: limit ? Math.floor(limit) : undefined }));
  }

  private async handleExportProject(args: Record<string, unknown>) { return textResponse(await store.exportProject(getString(args, 'projectName'))); }
  private async handleImportProject(args: Record<string, unknown>) {
    const pe = args.projectExport as ProjectExport;
    if (!pe || typeof pe !== 'object') throw new McpError(ErrorCode.InvalidParams, '"projectExport" must be a valid project export object');
    return textResponse(await store.importProject(pe, getBoolean(args, 'overwriteExisting') ?? false, getOptionalString(args, 'importAs')));
  }

  private async handleValidateProject(args: Record<string, unknown>) { return textResponse(await store.validateProject(getString(args, 'projectName'))); }
  private async handleExportMarkdown(args: Record<string, unknown>) { return textContentResponse(await store.exportMarkdown(getString(args, 'projectName'))); }

  private async handleSearchProject(args: Record<string, unknown>) { return textResponse(await store.searchProject(getString(args, 'projectName'), getString(args, 'query'))); }
  private async handleProjectSummary(args: Record<string, unknown>) { return textResponse(await store.projectSummary(getString(args, 'projectName'))); }
  private async handleDependencyGraph(args: Record<string, unknown>) { return textResponse(await store.dependencyGraph(getString(args, 'projectName'), getString(args, 'entityType') as 'feature' | 'task', getString(args, 'entityName'), getOptionalNumber(args, 'maxDepth') ?? 1)); }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Project Planer MCP server v0.7.0 running on stdio');
  }
}

export { ProjectPlanerServer, asRecord, getString, getOptionalString, getStringArray, getOptionalNumber, getBoolean, getOptionalEnum, getNumber, textResponse, textContentResponse };
