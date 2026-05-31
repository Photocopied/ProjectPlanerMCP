#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import envPaths from 'env-paths';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface Feature {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'proposed' | 'approved' | 'in-progress' | 'completed' | 'cancelled';
  dependencies: string[]; // feature IDs
  createdAt: string;
  updatedAt: string;
}

interface TechSpec {
  id: string;
  name: string;
  description: string;
  featureId: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

interface ResearchSession {
  id: string;
  sessionName: string;
  query: string;
  findings: string;
  conclusions: string;
  sources: string[];
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  featureIds: string[];
  techSpecIds: string[];
  status: 'draft' | 'review' | 'approved' | 'implementing' | 'complete';
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
  dependencies: string[]; // task IDs
  planId: string;
  createdAt: string;
  updatedAt: string;
}

// For dependency graph output
interface DependencyNode {
  id: string;
  name: string;
  type: 'feature' | 'task';
  status: string;
  dependsOn: string[]; // IDs of things this depends on
  dependedBy: string[]; // IDs of things that depend on this
}

// For project summary output
interface ProjectSummary {
  project: ProjectMeta;
  featureCount: number;
  featuresByStatus: Record<string, number>;
  featuresByPriority: Record<string, number>;
  techSpecCount: number;
  researchCount: number;
  planCount: number;
  plansByStatus: Record<string, number>;
  taskCount: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

// For search results
interface SearchResult {
  type: string;
  id: string;
  name: string;
  filePath: string;
  matchContext: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short unique ID. */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Return an ISO timestamp string for "right now". */
function now(): string {
  return new Date().toISOString();
}

/**
 * Sanitize a string so it can be used safely as a directory/file name.
 * Replaces anything that isn't alphanumeric, dash, or underscore.
 */
function sanitizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Build a timestamped filename in the format used for research, plans, and tasks:
 *   {prefix}-{sanitized name}-{ISO-ish suffix}.json
 */
function timestampedFilename(prefix: string, name: string): string {
  const safe = sanitizeName(name);
  const ts = now().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  return `${prefix}-${safe}-${ts}.json`;
}

// ---------------------------------------------------------------------------
// Directory-based data store
// ---------------------------------------------------------------------------

class ProjectStore {
  private projectsDir: string;

  constructor() {
    const paths = envPaths('project-planer-mcp', { suffix: '' });
    this.projectsDir = join(paths.data, 'projects');
  }

  // -- Project directory helpers -------------------------------------------

  /** Project directory, e.g. ~/.../projects/MyProject */
  private projectDir(projectName: string): string {
    return join(this.projectsDir, sanitizeName(projectName));
  }

  /** Project.json path */
  private projectMetaPath(projectName: string): string {
    return join(this.projectDir(projectName), 'Project.json');
  }

  private featuresDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Features');
  }

  private techSpecsDir(projectName: string): string {
    return join(this.projectDir(projectName), 'TechSpecs');
  }

  private researchDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Research');
  }

  private plansDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Plans');
  }

  private tasksDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Tasks');
  }

  // -- Low-level file helpers ----------------------------------------------

  private async readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** List .json files in a directory, sorted by name. */
  private async listJsonFiles(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.json'))
        .map((e) => join(dir, e.name))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Find files matching a predicate by scanning all JSON in a directory
   * and returning the first match together with its file path.
   */
  private async findJsonFile<T>(
    dir: string,
    predicate: (item: T) => boolean
  ): Promise<{ data: T; filePath: string } | null> {
    const files = await this.listJsonFiles(dir);
    for (const f of files) {
      try {
        const data = await this.readJson<T>(f);
        if (predicate(data)) {
          return { data, filePath: f };
        }
      } catch {
        // skip corrupt files
      }
    }
    return null;
  }

  // -- Project -------------------------------------------------------------

  async createProject(
    name: string,
    description: string
  ): Promise<ProjectMeta> {
    const projDir = this.projectDir(name);
    const metaPath = this.projectMetaPath(name);

    if (existsSync(metaPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project "${name}" already exists`
      );
    }

    const project: ProjectMeta = {
      id: generateId(),
      name,
      description,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    };

    // Create the scaffold directories
    await mkdir(join(projDir, 'Features'), { recursive: true });
    await mkdir(join(projDir, 'TechSpecs'), { recursive: true });
    await mkdir(join(projDir, 'Research'), { recursive: true });
    await mkdir(join(projDir, 'Plans'), { recursive: true });
    await mkdir(join(projDir, 'Tasks'), { recursive: true });

    await this.writeJson(metaPath, project);
    return project;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    try {
      const projectDirs = await readdir(this.projectsDir, {
        withFileTypes: true,
      });
      const results: ProjectMeta[] = [];

      for (const d of projectDirs) {
        if (!d.isDirectory()) continue;
        const metaPath = join(this.projectsDir, d.name, 'Project.json');
        try {
          const meta = await this.readJson<ProjectMeta>(metaPath);
          results.push(meta);
        } catch {
          // skip directories without a valid Project.json
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  async getProject(name: string): Promise<ProjectMeta> {
    const meta = await this.readJson<ProjectMeta>(this.projectMetaPath(name));
    if (!meta) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project "${name}" not found`
      );
    }
    return meta;
  }

  async updateProject(
    name: string,
    updates: Partial<Pick<ProjectMeta, 'description' | 'status'>>
  ): Promise<ProjectMeta> {
    const meta = await this.getProject(name);
    if (updates.description !== undefined) meta.description = updates.description;
    if (updates.status !== undefined) meta.status = updates.status;
    meta.updatedAt = now();
    await this.writeJson(this.projectMetaPath(name), meta);
    return meta;
  }

  async deleteProject(name: string): Promise<void> {
    const projDir = this.projectDir(name);
    if (!existsSync(projDir)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Project "${name}" not found`
      );
    }
    await rm(projDir, { recursive: true, force: true });
  }

  // -- Features ------------------------------------------------------------

  /** The file path for a feature inside a project. Features use {name}.json. */
  private featurePath(projectName: string, featureName: string): string {
    return join(this.featuresDir(projectName), `${sanitizeName(featureName)}.json`);
  }

  async addFeature(
    projectName: string,
    name: string,
    description: string,
    priority: Feature['priority'] = 'medium'
  ): Promise<Feature> {
    await this.getProject(projectName); // ensure project exists
    const fPath = this.featurePath(projectName, name);
    if (existsSync(fPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Feature "${name}" already exists in project "${projectName}"`
      );
    }
    const feature: Feature = {
      id: generateId(),
      name,
      description,
      priority,
      status: 'proposed',
      dependencies: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await this.writeJson(fPath, feature);
    return feature;
  }

  async listFeatures(projectName: string): Promise<Feature[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.featuresDir(projectName));
    const features: Feature[] = [];
    for (const f of files) {
      try {
        features.push(await this.readJson<Feature>(f));
      } catch {
        // skip corrupt files
      }
    }
    return features;
  }

  async getFeature(projectName: string, featureName: string): Promise<Feature> {
    const f = await this.readJson<Feature>(
      this.featurePath(projectName, featureName)
    );
    if (!f) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Feature "${featureName}" not found in project "${projectName}"`
      );
    }
    return f;
  }

  async updateFeature(
    projectName: string,
    featureName: string,
    updates: Partial<Pick<Feature, 'description' | 'priority' | 'status' | 'dependencies'>>
  ): Promise<Feature> {
    const feature = await this.getFeature(projectName, featureName);
    if (updates.description !== undefined) feature.description = updates.description;
    if (updates.priority !== undefined) feature.priority = updates.priority;
    if (updates.status !== undefined) feature.status = updates.status;
    if (updates.dependencies !== undefined) feature.dependencies = updates.dependencies;
    feature.updatedAt = now();
    await this.writeJson(this.featurePath(projectName, featureName), feature);
    return feature;
  }

  async deleteFeature(projectName: string, featureName: string): Promise<void> {
    const fPath = this.featurePath(projectName, featureName);
    if (!existsSync(fPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Feature "${featureName}" not found in project "${projectName}"`
      );
    }
    await rm(fPath, { force: true });
  }

  // -- TechSpecs -----------------------------------------------------------

  private techSpecPath(projectName: string, techSpecName: string): string {
    return join(this.techSpecsDir(projectName), `${sanitizeName(techSpecName)}.json`);
  }

  async addTechSpec(
    projectName: string,
    name: string,
    description: string,
    featureId: string,
    details: string
  ): Promise<TechSpec> {
    await this.getProject(projectName);
    const tsPath = this.techSpecPath(projectName, name);
    if (existsSync(tsPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `TechSpec "${name}" already exists in project "${projectName}"`
      );
    }
    const spec: TechSpec = {
      id: generateId(),
      name,
      description,
      featureId,
      details,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.writeJson(tsPath, spec);
    return spec;
  }

  async listTechSpecs(projectName: string): Promise<TechSpec[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.techSpecsDir(projectName));
    const specs: TechSpec[] = [];
    for (const f of files) {
      try {
        specs.push(await this.readJson<TechSpec>(f));
      } catch {
        // skip
      }
    }
    return specs;
  }

  async getTechSpec(projectName: string, techSpecName: string): Promise<TechSpec> {
    const tsPath = this.techSpecPath(projectName, techSpecName);
    if (!existsSync(tsPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `TechSpec "${techSpecName}" not found in project "${projectName}"`
      );
    }
    return this.readJson<TechSpec>(tsPath);
  }

  async updateTechSpec(
    projectName: string,
    techSpecName: string,
    updates: Partial<Pick<TechSpec, 'description' | 'featureId' | 'details'>>
  ): Promise<TechSpec> {
    const spec = await this.getTechSpec(projectName, techSpecName);
    if (updates.description !== undefined) spec.description = updates.description;
    if (updates.featureId !== undefined) spec.featureId = updates.featureId;
    if (updates.details !== undefined) spec.details = updates.details;
    spec.updatedAt = now();
    await this.writeJson(this.techSpecPath(projectName, techSpecName), spec);
    return spec;
  }

  async deleteTechSpec(projectName: string, techSpecName: string): Promise<void> {
    const tsPath = this.techSpecPath(projectName, techSpecName);
    if (!existsSync(tsPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `TechSpec "${techSpecName}" not found in project "${projectName}"`
      );
    }
    await rm(tsPath, { force: true });
  }

  // -- Research ------------------------------------------------------------

  async addResearch(
    projectName: string,
    sessionName: string,
    query: string,
    findings: string,
    conclusions: string,
    sources: string[]
  ): Promise<ResearchSession> {
    await this.getProject(projectName);
    const filename = timestampedFilename('research', sessionName);
    const rPath = join(this.researchDir(projectName), filename);
    const session: ResearchSession = {
      id: generateId(),
      sessionName,
      query,
      findings,
      conclusions,
      sources,
      createdAt: now(),
    };
    await this.writeJson(rPath, session);
    return session;
  }

  async listResearch(projectName: string): Promise<ResearchSession[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.researchDir(projectName));
    const sessions: ResearchSession[] = [];
    for (const f of files) {
      try {
        sessions.push(await this.readJson<ResearchSession>(f));
      } catch {
        // skip
      }
    }
    return sessions;
  }

  async getResearch(projectName: string, sessionName: string): Promise<ResearchSession> {
    const result = await this.findJsonFile<ResearchSession>(
      this.researchDir(projectName),
      (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName)
    );
    if (!result) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Research session "${sessionName}" not found in project "${projectName}"`
      );
    }
    return result.data;
  }

  async updateResearch(
    projectName: string,
    sessionName: string,
    updates: Partial<Pick<ResearchSession, 'findings' | 'conclusions' | 'sources'>>
  ): Promise<ResearchSession> {
    const result = await this.findJsonFile<ResearchSession>(
      this.researchDir(projectName),
      (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName)
    );
    if (!result) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Research session "${sessionName}" not found in project "${projectName}"`
      );
    }
    const session = result.data;
    if (updates.findings !== undefined) session.findings = updates.findings;
    if (updates.conclusions !== undefined) session.conclusions = updates.conclusions;
    if (updates.sources !== undefined) session.sources = updates.sources;
    await this.writeJson(result.filePath, session);
    return session;
  }

  async deleteResearch(projectName: string, sessionName: string): Promise<void> {
    const result = await this.findJsonFile<ResearchSession>(
      this.researchDir(projectName),
      (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName)
    );
    if (!result) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Research session "${sessionName}" not found in project "${projectName}"`
      );
    }
    await rm(result.filePath, { force: true });
  }

  // -- Plans ---------------------------------------------------------------

  async createPlan(
    projectName: string,
    name: string,
    description: string,
    featureIds: string[],
    techSpecIds: string[],
    steps: string[]
  ): Promise<Plan> {
    await this.getProject(projectName);
    const filename = timestampedFilename('plan', name);
    const pPath = join(this.plansDir(projectName), filename);
    const plan: Plan = {
      id: generateId(),
      name,
      description,
      featureIds,
      techSpecIds,
      status: 'draft',
      steps,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.writeJson(pPath, plan);
    return plan;
  }

  async listPlans(projectName: string): Promise<Plan[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.plansDir(projectName));
    const plans: Plan[] = [];
    for (const f of files) {
      try {
        plans.push(await this.readJson<Plan>(f));
      } catch {
        // skip
      }
    }
    return plans;
  }

  async getPlan(projectName: string, planName: string): Promise<Plan | null> {
    const plans = await this.listPlans(projectName);
    return plans.find((p) => sanitizeName(p.name) === sanitizeName(planName)) ?? null;
  }

  async updatePlanStatus(
    projectName: string,
    planName: string,
    status: Plan['status'],
    steps?: string[]
  ): Promise<Plan> {
    const plan = await this.getPlan(projectName, planName);
    if (!plan) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Plan "${planName}" not found in project "${projectName}"`
      );
    }
    plan.status = status;
    if (steps !== undefined) plan.steps = steps;
    plan.updatedAt = now();

    // Find the actual file path and rewrite
    const plansDir = this.plansDir(projectName);
    const files = await this.listJsonFiles(plansDir);
    for (const f of files) {
      try {
        const p = await this.readJson<Plan>(f);
        if (p.id === plan.id) {
          await this.writeJson(f, plan);
          break;
        }
      } catch {
        // skip
      }
    }
    return plan;
  }

  async deletePlan(projectName: string, planName: string): Promise<void> {
    const plansDir = this.plansDir(projectName);
    const files = await this.listJsonFiles(plansDir);
    for (const f of files) {
      try {
        const p = await this.readJson<Plan>(f);
        if (sanitizeName(p.name) === sanitizeName(planName)) {
          await rm(f, { force: true });
          return;
        }
      } catch {
        // skip
      }
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Plan "${planName}" not found in project "${projectName}"`
    );
  }

  // -- Tasks ---------------------------------------------------------------

  async createTask(
    projectName: string,
    name: string,
    description: string,
    priority: Task['priority'] = 'medium',
    dependencies: string[] = [],
    planId: string = ''
  ): Promise<Task> {
    await this.getProject(projectName);
    const filename = timestampedFilename('task', name);
    const tPath = join(this.tasksDir(projectName), filename);
    const task: Task = {
      id: generateId(),
      name,
      description,
      status: 'pending',
      priority,
      assignedTo: '',
      dependencies,
      planId,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.writeJson(tPath, task);
    return task;
  }

  async listTasks(projectName: string): Promise<Task[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.tasksDir(projectName));
    const tasks: Task[] = [];
    for (const f of files) {
      try {
        tasks.push(await this.readJson<Task>(f));
      } catch {
        // skip
      }
    }
    return tasks;
  }

  async getTask(projectName: string, taskName: string): Promise<Task | null> {
    const tasks = await this.listTasks(projectName);
    return tasks.find((t) => sanitizeName(t.name) === sanitizeName(taskName)) ?? null;
  }

  async updateTask(
    projectName: string,
    taskName: string,
    updates: Partial<Pick<Task, 'description' | 'status' | 'priority' | 'assignedTo' | 'dependencies'>>
  ): Promise<Task> {
    const tasksDir = this.tasksDir(projectName);
    const files = await this.listJsonFiles(tasksDir);
    for (const f of files) {
      try {
        const t = await this.readJson<Task>(f);
        if (sanitizeName(t.name) === sanitizeName(taskName)) {
          const task: Task = { ...t };
          if (updates.description !== undefined) task.description = updates.description;
          if (updates.status !== undefined) task.status = updates.status;
          if (updates.priority !== undefined) task.priority = updates.priority;
          if (updates.assignedTo !== undefined) task.assignedTo = updates.assignedTo;
          if (updates.dependencies !== undefined) task.dependencies = updates.dependencies;
          task.updatedAt = now();
          await this.writeJson(f, task);
          return task;
        }
      } catch {
        // skip
      }
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Task "${taskName}" not found in project "${projectName}"`
    );
  }

  async assignTask(projectName: string, taskName: string, assignee: string): Promise<Task> {
    return this.updateTask(projectName, taskName, { assignedTo: assignee });
  }

  async updateTaskStatus(
    projectName: string,
    taskName: string,
    status: Task['status']
  ): Promise<Task> {
    return this.updateTask(projectName, taskName, { status });
  }

  async deleteTask(projectName: string, taskName: string): Promise<void> {
    const tasksDir = this.tasksDir(projectName);
    const files = await this.listJsonFiles(tasksDir);
    for (const f of files) {
      try {
        const t = await this.readJson<Task>(f);
        if (sanitizeName(t.name) === sanitizeName(taskName)) {
          await rm(f, { force: true });
          return;
        }
      } catch {
        // skip
      }
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Task "${taskName}" not found in project "${projectName}"`
    );
  }

  // -- Advanced: Search, Summary, Dependency Graph -------------------------

  /**
   * Full-text search across all entities in a project.
   * Searches in: feature names/descriptions, tech spec names/details,
   * research queries/findings/conclusions, plan names/descriptions/steps,
   * task names/descriptions.
   */
  async searchProject(projectName: string, query: string): Promise<SearchResult[]> {
    await this.getProject(projectName);
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Helper: search a directory of JSON files
    const searchDir = async (dir: string, type: string, nameKey: string, searchFields: string[]) => {
      const files = await this.listJsonFiles(dir);
      for (const f of files) {
        try {
          const raw = await readFile(f, 'utf-8');
          const data = JSON.parse(raw);
          const name = data[nameKey] ?? 'unknown';
          // Check if any of the search fields contain the query
          const matchField = searchFields.find((field) => {
            const val = data[field];
            return typeof val === 'string' && val.toLowerCase().includes(lowerQuery);
          });
          if (matchField) {
            // Find the exact match context
            const val = data[matchField] as string;
            const idx = val.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, idx - 60);
            const end = Math.min(val.length, idx + lowerQuery.length + 60);
            const context = (start > 0 ? '...' : '') +
              val.slice(start, end) +
              (end < val.length ? '...' : '');
            results.push({
              type,
              id: data.id ?? '',
              name: String(name),
              filePath: relative(this.projectDir(projectName), f),
              matchContext: `[${matchField}] ${context}`,
            });
          }
        } catch {
          // skip corrupt files
        }
      }
    };

    await Promise.all([
      searchDir(this.featuresDir(projectName), 'feature', 'name', ['name', 'description']),
      searchDir(this.techSpecsDir(projectName), 'techspec', 'name', ['name', 'description', 'details']),
      searchDir(this.researchDir(projectName), 'research', 'sessionName', ['sessionName', 'query', 'findings', 'conclusions']),
      searchDir(this.plansDir(projectName), 'plan', 'name', ['name', 'description', ...['steps'].flatMap((_) => [])]), // steps is an array, need special handling
      searchDir(this.tasksDir(projectName), 'task', 'name', ['name', 'description']),
    ]);

    // Special handling for plan steps (array of strings)
    {
      const files = await this.listJsonFiles(this.plansDir(projectName));
      for (const f of files) {
        try {
          const raw = await readFile(f, 'utf-8');
          const data = JSON.parse(raw);
          const steps = data.steps as string[] | undefined;
          if (steps && Array.isArray(steps)) {
            const matchingStep = steps.find((s: string) =>
              typeof s === 'string' && s.toLowerCase().includes(lowerQuery)
            );
            if (matchingStep) {
              const idx = matchingStep.toLowerCase().indexOf(lowerQuery);
              const start = Math.max(0, idx - 60);
              const end = Math.min(matchingStep.length, idx + lowerQuery.length + 60);
              const context = (start > 0 ? '...' : '') +
                matchingStep.slice(start, end) +
                (end < matchingStep.length ? '...' : '');
              results.push({
                type: 'plan',
                id: data.id ?? '',
                name: data.name ?? 'unknown',
                filePath: relative(this.projectDir(projectName), f),
                matchContext: `[steps] ${context}`,
              });
            }
          }
        } catch {
          // skip
        }
      }
    }

    return results;
  }

  /**
   * Generate a summary of a project with counts and breakdowns.
   */
  async projectSummary(projectName: string): Promise<ProjectSummary> {
    const project = await this.getProject(projectName);
    const features = await this.listFeatures(projectName);
    const techSpecs = await this.listTechSpecs(projectName);
    const research = await this.listResearch(projectName);
    const plans = await this.listPlans(projectName);
    const tasks = await this.listTasks(projectName);

    // Feature breakdowns
    const featuresByStatus: Record<string, number> = {};
    const featuresByPriority: Record<string, number> = {};
    for (const f of features) {
      featuresByStatus[f.status] = (featuresByStatus[f.status] ?? 0) + 1;
      featuresByPriority[f.priority] = (featuresByPriority[f.priority] ?? 0) + 1;
    }

    // Plan breakdowns
    const plansByStatus: Record<string, number> = {};
    for (const p of plans) {
      plansByStatus[p.status] = (plansByStatus[p.status] ?? 0) + 1;
    }

    // Task breakdowns
    const tasksByStatus: Record<string, number> = {};
    const tasksByPriority: Record<string, number> = {};
    for (const t of tasks) {
      tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
      tasksByPriority[t.priority] = (tasksByPriority[t.priority] ?? 0) + 1;
    }

    return {
      project,
      featureCount: features.length,
      featuresByStatus,
      featuresByPriority,
      techSpecCount: techSpecs.length,
      researchCount: research.length,
      planCount: plans.length,
      plansByStatus,
      taskCount: tasks.length,
      tasksByStatus,
      tasksByPriority,
    };
  }

  /**
   * Build a dependency graph for a feature or task.
   * Shows what it depends on and what depends on it, recursively (default depth 1, max 3).
   */
  async dependencyGraph(
    projectName: string,
    entityType: 'feature' | 'task',
    entityName: string,
    maxDepth: number = 1
  ): Promise<{ root: DependencyNode; nodes: DependencyNode[] }> {
    const clampedDepth = Math.min(Math.max(1, maxDepth), 3);

    // Load all features and tasks
    const allFeatures = await this.listFeatures(projectName);
    const allTasks = await this.listTasks(projectName);

    // Build lookup maps
    const featureMap = new Map(allFeatures.map((f) => [f.id, f]));
    const featureByNameMap = new Map(allFeatures.map((f) => [sanitizeName(f.name), f]));
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const taskByNameMap = new Map(allTasks.map((t) => [sanitizeName(t.name), t]));

    // Find the root entity
    let rootEntity: { id: string; name: string; type: 'feature' | 'task'; status: string; dependencies: string[] };
    if (entityType === 'feature') {
      const feat = featureByNameMap.get(sanitizeName(entityName));
      if (!feat) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Feature "${entityName}" not found in project "${projectName}"`
        );
      }
      rootEntity = { id: feat.id, name: feat.name, type: 'feature', status: feat.status, dependencies: feat.dependencies };
    } else {
      const task = taskByNameMap.get(sanitizeName(entityName));
      if (!task) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Task "${entityName}" not found in project "${projectName}"`
        );
      }
      rootEntity = { id: task.id, name: task.name, type: 'task', status: task.status, dependencies: task.dependencies };
    }

    // Build reverse dependency map (who depends on whom)
    const reverseDepMap = new Map<string, string[]>();
    const addReverseDep = (dependsOn: string, dependent: string) => {
      const existing = reverseDepMap.get(dependsOn) ?? [];
      existing.push(dependent);
      reverseDepMap.set(dependsOn, existing);
    };
    for (const f of allFeatures) {
      for (const depId of f.dependencies) addReverseDep(depId, f.id);
    }
    for (const t of allTasks) {
      for (const depId of t.dependencies) addReverseDep(depId, t.id);
    }

    // BFS to collect all nodes up to clampedDepth
    const visited = new Set<string>();
    const nodes: DependencyNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: rootEntity.id, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      // Determine type
      const isFeature = featureMap.has(current.id);
      const entity = isFeature ? featureMap.get(current.id) : taskMap.get(current.id);
      if (!entity) continue;

      const dependsOn = entity.dependencies;
      const dependedBy = reverseDepMap.get(current.id) ?? [];

      nodes.push({
        id: entity.id,
        name: entity.name,
        type: isFeature ? 'feature' : 'task',
        status: entity.status,
        dependsOn,
        dependedBy,
      });

      if (current.depth < clampedDepth) {
        for (const depId of dependsOn) {
          if (!visited.has(depId)) {
            queue.push({ id: depId, depth: current.depth + 1 });
          }
        }
        for (const depId of dependedBy) {
          if (!visited.has(depId)) {
            queue.push({ id: depId, depth: current.depth + 1 });
          }
        }
      }
    }

    const root = nodes.find((n) => n.id === rootEntity.id)!;
    return { root, nodes };
  }
}

// ---------------------------------------------------------------------------
// Store instance
// ---------------------------------------------------------------------------

const store = new ProjectStore();

// ---------------------------------------------------------------------------
// Type guards for tool arguments
// ---------------------------------------------------------------------------

function asRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null) {
    throw new McpError(ErrorCode.InvalidParams, 'Arguments must be an object');
  }
  return args as Record<string, unknown>;
}

function getString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `"${key}" is required and must be a non-empty string`
    );
  }
  return v;
}

function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

function getStringArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((e) => typeof e === 'string')) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `"${key}" must be an array of strings`
    );
  }
  return v as string[];
}

function getOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `"${key}" must be a number`
    );
  }
  return v;
}

function textResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

class ProjectPlanerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'project-planer-mcp',
        version: '0.3.0',
      },
      {
        capabilities: { tools: {} },
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
        // ---- Project tools ----
        {
          name: 'create_project',
          description:
            'Create a new project with its directory scaffold (Features, TechSpecs, Research, Plans, Tasks). The project name becomes the directory name.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the project (used as directory name)',
              },
              description: {
                type: 'string',
                description: 'What the project aims to solve or add',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'list_projects',
          description: 'List all projects with their metadata',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_project',
          description: 'Get detailed information about a project including its metadata',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'update_project',
          description: 'Update a project\'s description or status',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              description: {
                type: 'string',
                description: 'New description',
              },
              status: {
                type: 'string',
                enum: ['active', 'archived'],
                description: 'New project status',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'delete_project',
          description: 'Permanently delete a project and all its files',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project to delete',
              },
            },
            required: ['projectName'],
          },
        },

        // ---- Feature tools ----
        {
          name: 'add_feature',
          description: 'Add a feature capability to a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              name: {
                type: 'string',
                description: 'Name of the feature (e.g. "project-wide-search")',
              },
              description: {
                type: 'string',
                description: 'Description of the feature capability',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Priority (default: medium)',
              },
            },
            required: ['projectName', 'name', 'description'],
          },
        },
        {
          name: 'list_features',
          description: 'List all features for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'get_feature',
          description: 'Get a single feature by name',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              featureName: {
                type: 'string',
                description: 'Name of the feature',
              },
            },
            required: ['projectName', 'featureName'],
          },
        },
        {
          name: 'update_feature',
          description: 'Update a feature\'s description, priority, status or dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              featureName: {
                type: 'string',
                description: 'Name of the feature',
              },
              description: {
                type: 'string',
                description: 'New description',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
              },
              status: {
                type: 'string',
                enum: ['proposed', 'approved', 'in-progress', 'completed', 'cancelled'],
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of feature IDs this depends on',
              },
            },
            required: ['projectName', 'featureName'],
          },
        },
        {
          name: 'delete_feature',
          description: 'Delete a feature from a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              featureName: {
                type: 'string',
                description: 'Name of the feature to delete',
              },
            },
            required: ['projectName', 'featureName'],
          },
        },

        // ---- TechSpec tools ----
        {
          name: 'add_techspec',
          description: 'Add a technical specification tied to a feature',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              name: {
                type: 'string',
                description: 'Name of the technical spec',
              },
              description: {
                type: 'string',
                description: 'Brief description',
              },
              featureId: {
                type: 'string',
                description: 'ID of the feature this spec belongs to',
              },
              details: {
                type: 'string',
                description: 'Full technical specification details',
              },
            },
            required: ['projectName', 'name', 'description', 'featureId', 'details'],
          },
        },
        {
          name: 'list_techspecs',
          description: 'List all technical specifications for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'get_techspec',
          description: 'Get a single technical specification by name',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              techSpecName: {
                type: 'string',
                description: 'Name of the technical specification',
              },
            },
            required: ['projectName', 'techSpecName'],
          },
        },
        {
          name: 'update_techspec',
          description: 'Update a technical specification\'s description, featureId, or details',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              techSpecName: {
                type: 'string',
                description: 'Name of the technical specification',
              },
              description: {
                type: 'string',
                description: 'New description',
              },
              featureId: {
                type: 'string',
                description: 'ID of the feature this spec belongs to',
              },
              details: {
                type: 'string',
                description: 'Full technical specification details',
              },
            },
            required: ['projectName', 'techSpecName'],
          },
        },
        {
          name: 'delete_techspec',
          description: 'Delete a technical specification from a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              techSpecName: {
                type: 'string',
                description: 'Name of the technical specification to delete',
              },
            },
            required: ['projectName', 'techSpecName'],
          },
        },

        // ---- Research tools ----
        {
          name: 'add_research',
          description: 'Add a research session with findings to a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              sessionName: {
                type: 'string',
                description: 'Name for this research session (e.g. "search-libraries-comparison")',
              },
              query: {
                type: 'string',
                description: 'The research question or query',
              },
              findings: {
                type: 'string',
                description: 'What was found during research',
              },
              conclusions: {
                type: 'string',
                description: 'Conclusions drawn from the research',
              },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'URLs or references to sources',
              },
            },
            required: ['projectName', 'sessionName', 'query', 'findings', 'conclusions'],
          },
        },
        {
          name: 'list_research',
          description: 'List all research sessions for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'get_research',
          description: 'Get a single research session by name',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              sessionName: {
                type: 'string',
                description: 'Name of the research session',
              },
            },
            required: ['projectName', 'sessionName'],
          },
        },
        {
          name: 'update_research',
          description: 'Update a research session\'s findings, conclusions, or sources',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              sessionName: {
                type: 'string',
                description: 'Name of the research session',
              },
              findings: {
                type: 'string',
                description: 'Updated findings',
              },
              conclusions: {
                type: 'string',
                description: 'Updated conclusions',
              },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Updated list of sources',
              },
            },
            required: ['projectName', 'sessionName'],
          },
        },
        {
          name: 'delete_research',
          description: 'Delete a research session from a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              sessionName: {
                type: 'string',
                description: 'Name of the research session to delete',
              },
            },
            required: ['projectName', 'sessionName'],
          },
        },

        // ---- Plan tools ----
        {
          name: 'create_plan',
          description: 'Create an implementation plan for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              name: {
                type: 'string',
                description: 'Name of the plan',
              },
              description: {
                type: 'string',
                description: 'Description of the plan',
              },
              featureIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of features this plan covers',
              },
              techSpecIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'IDs of tech specs this plan references',
              },
              steps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Step-by-step implementation steps',
              },
            },
            required: ['projectName', 'name', 'description'],
          },
        },
        {
          name: 'list_plans',
          description: 'List all plans for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'update_plan_status',
          description: 'Update a plan\'s status and optional steps',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              planName: {
                type: 'string',
                description: 'Name of the plan',
              },
              status: {
                type: 'string',
                enum: ['draft', 'review', 'approved', 'implementing', 'complete'],
                description: 'New status',
              },
              steps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Updated implementation steps (optional)',
              },
            },
            required: ['projectName', 'planName', 'status'],
          },
        },
        {
          name: 'delete_plan',
          description: 'Delete a plan from a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              planName: {
                type: 'string',
                description: 'Name of the plan to delete',
              },
            },
            required: ['projectName', 'planName'],
          },
        },

        // ---- Task tools ----
        {
          name: 'create_task',
          description: 'Create a task (job-board style) for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              name: {
                type: 'string',
                description: 'Name of the task',
              },
              description: {
                type: 'string',
                description: 'Description of the task',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Priority (default: medium)',
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task IDs this task depends on',
              },
              planId: {
                type: 'string',
                description: 'ID of the plan this task belongs to',
              },
            },
            required: ['projectName', 'name', 'description'],
          },
        },
        {
          name: 'list_tasks',
          description: 'List all tasks for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'get_task',
          description: 'Get a single task by name',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              taskName: {
                type: 'string',
                description: 'Name of the task',
              },
            },
            required: ['projectName', 'taskName'],
          },
        },
        {
          name: 'update_task_status',
          description: 'Update a task\'s status',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              taskName: {
                type: 'string',
                description: 'Name of the task',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in-progress', 'completed', 'blocked'],
                description: 'New status',
              },
            },
            required: ['projectName', 'taskName', 'status'],
          },
        },
        {
          name: 'update_task',
          description: 'Update a task\'s description, priority, status, assignee, or dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              taskName: {
                type: 'string',
                description: 'Name of the task',
              },
              description: {
                type: 'string',
                description: 'New description',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'New priority',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in-progress', 'completed', 'blocked'],
                description: 'New status',
              },
              assignedTo: {
                type: 'string',
                description: 'Who to assign the task to',
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task IDs this task depends on',
              },
            },
            required: ['projectName', 'taskName'],
          },
        },
        {
          name: 'assign_task',
          description: 'Assign a task to someone',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              taskName: {
                type: 'string',
                description: 'Name of the task',
              },
              assignee: {
                type: 'string',
                description: 'Who to assign the task to',
              },
            },
            required: ['projectName', 'taskName', 'assignee'],
          },
        },
        {
          name: 'delete_task',
          description: 'Delete a task from a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              taskName: {
                type: 'string',
                description: 'Name of the task to delete',
              },
            },
            required: ['projectName', 'taskName'],
          },
        },

        // ---- Advanced tools ----
        {
          name: 'search_project',
          description:
            'Full-text search across all entities (features, techspecs, research, plans, tasks) in a project. Searches names, descriptions, details, steps, findings, and more.',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              query: {
                type: 'string',
                description: 'Search query string (case-insensitive)',
              },
            },
            required: ['projectName', 'query'],
          },
        },
        {
          name: 'project_summary',
          description:
            'Generate a comprehensive summary of a project including counts and breakdowns by status and priority for features, plans, and tasks.',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
            },
            required: ['projectName'],
          },
        },
        {
          name: 'dependency_graph',
          description:
            'Trace dependencies for a feature or task. Shows what it depends on and what depends on it, up to a configurable depth (default 1, max 3).',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project',
              },
              entityType: {
                type: 'string',
                enum: ['feature', 'task'],
                description: 'Type of entity (feature or task)',
              },
              entityName: {
                type: 'string',
                description: 'Name of the feature or task',
              },
              maxDepth: {
                type: 'number',
                description: 'Maximum traversal depth (default: 1, max: 3)',
              },
            },
            required: ['projectName', 'entityType', 'entityName'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const a = asRecord(args);

      try {
        switch (name) {
          // ---- Projects ----
          case 'create_project':
            return await this.handleCreateProject(a);
          case 'list_projects':
            return await this.handleListProjects();
          case 'get_project':
            return await this.handleGetProject(a);
          case 'update_project':
            return await this.handleUpdateProject(a);
          case 'delete_project':
            return await this.handleDeleteProject(a);

          // ---- Features ----
          case 'add_feature':
            return await this.handleAddFeature(a);
          case 'list_features':
            return await this.handleListFeatures(a);
          case 'get_feature':
            return await this.handleGetFeature(a);
          case 'update_feature':
            return await this.handleUpdateFeature(a);
          case 'delete_feature':
            return await this.handleDeleteFeature(a);

          // ---- TechSpecs ----
          case 'add_techspec':
            return await this.handleAddTechSpec(a);
          case 'list_techspecs':
            return await this.handleListTechSpecs(a);
          case 'get_techspec':
            return await this.handleGetTechSpec(a);
          case 'update_techspec':
            return await this.handleUpdateTechSpec(a);
          case 'delete_techspec':
            return await this.handleDeleteTechSpec(a);

          // ---- Research ----
          case 'add_research':
            return await this.handleAddResearch(a);
          case 'list_research':
            return await this.handleListResearch(a);
          case 'get_research':
            return await this.handleGetResearch(a);
          case 'update_research':
            return await this.handleUpdateResearch(a);
          case 'delete_research':
            return await this.handleDeleteResearch(a);

          // ---- Plans ----
          case 'create_plan':
            return await this.handleCreatePlan(a);
          case 'list_plans':
            return await this.handleListPlans(a);
          case 'update_plan_status':
            return await this.handleUpdatePlanStatus(a);
          case 'delete_plan':
            return await this.handleDeletePlan(a);

          // ---- Tasks ----
          case 'create_task':
            return await this.handleCreateTask(a);
          case 'list_tasks':
            return await this.handleListTasks(a);
          case 'get_task':
            return await this.handleGetTask(a);
          case 'update_task_status':
            return await this.handleUpdateTaskStatus(a);
          case 'update_task':
            return await this.handleUpdateTask(a);
          case 'assign_task':
            return await this.handleAssignTask(a);
          case 'delete_task':
            return await this.handleDeleteTask(a);

          // ---- Advanced ----
          case 'search_project':
            return await this.handleSearchProject(a);
          case 'project_summary':
            return await this.handleProjectSummary(a);
          case 'dependency_graph':
            return await this.handleDependencyGraph(a);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (err) {
        if (err instanceof McpError) throw err;
        throw new McpError(
          ErrorCode.InternalError,
          `Unexpected error: ${(err as Error).message}`
        );
      }
    });
  }

  // -- Project handlers ----------------------------------------------------

  private async handleCreateProject(args: Record<string, unknown>) {
    const name = getString(args, 'name');
    const description = getOptionalString(args, 'description') ?? '';
    const project = await store.createProject(name, description);
    return textResponse(project);
  }

  private async handleListProjects() {
    const projects = await store.listProjects();
    return textResponse(projects);
  }

  private async handleGetProject(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const project = await store.getProject(projectName);
    return textResponse(project);
  }

  private async handleUpdateProject(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const description = getOptionalString(args, 'description');
    const status = args.status as 'active' | 'archived' | undefined;
    const updates: Record<string, unknown> = {};
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    const project = await store.updateProject(projectName, updates as any);
    return textResponse(project);
  }

  private async handleDeleteProject(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    await store.deleteProject(projectName);
    return textResponse({ deleted: projectName });
  }

  // -- Feature handlers ----------------------------------------------------

  private async handleAddFeature(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const name = getString(args, 'name');
    const description = getString(args, 'description');
    const priority = (args.priority as Feature['priority']) ?? 'medium';
    const feature = await store.addFeature(projectName, name, description, priority);
    return textResponse(feature);
  }

  private async handleListFeatures(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const features = await store.listFeatures(projectName);
    return textResponse(features);
  }

  private async handleGetFeature(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const featureName = getString(args, 'featureName');
    const feature = await store.getFeature(projectName, featureName);
    return textResponse(feature);
  }

  private async handleUpdateFeature(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const featureName = getString(args, 'featureName');
    const updates: Record<string, unknown> = {};
    const description = getOptionalString(args, 'description');
    const priority = args.priority as Feature['priority'] | undefined;
    const status = args.status as Feature['status'] | undefined;
    const dependencies = getStringArray(args, 'dependencies');
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (dependencies.length > 0) updates.dependencies = dependencies;
    const feature = await store.updateFeature(projectName, featureName, updates as any);
    return textResponse(feature);
  }

  private async handleDeleteFeature(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const featureName = getString(args, 'featureName');
    await store.deleteFeature(projectName, featureName);
    return textResponse({ deleted: featureName });
  }

  // -- TechSpec handlers ---------------------------------------------------

  private async handleAddTechSpec(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const name = getString(args, 'name');
    const description = getString(args, 'description');
    const featureId = getString(args, 'featureId');
    const details = getString(args, 'details');
    const spec = await store.addTechSpec(projectName, name, description, featureId, details);
    return textResponse(spec);
  }

  private async handleListTechSpecs(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const specs = await store.listTechSpecs(projectName);
    return textResponse(specs);
  }

  private async handleGetTechSpec(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const techSpecName = getString(args, 'techSpecName');
    const spec = await store.getTechSpec(projectName, techSpecName);
    return textResponse(spec);
  }

  private async handleUpdateTechSpec(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const techSpecName = getString(args, 'techSpecName');
    const updates: Record<string, unknown> = {};
    const description = getOptionalString(args, 'description');
    const featureId = getOptionalString(args, 'featureId');
    const details = getOptionalString(args, 'details');
    if (description !== undefined) updates.description = description;
    if (featureId !== undefined) updates.featureId = featureId;
    if (details !== undefined) updates.details = details;
    const spec = await store.updateTechSpec(projectName, techSpecName, updates as any);
    return textResponse(spec);
  }

  private async handleDeleteTechSpec(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const techSpecName = getString(args, 'techSpecName');
    await store.deleteTechSpec(projectName, techSpecName);
    return textResponse({ deleted: techSpecName });
  }

  // -- Research handlers ---------------------------------------------------

  private async handleAddResearch(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const sessionName = getString(args, 'sessionName');
    const query = getString(args, 'query');
    const findings = getString(args, 'findings');
    const conclusions = getString(args, 'conclusions');
    const sources = getStringArray(args, 'sources');
    const session = await store.addResearch(
      projectName,
      sessionName,
      query,
      findings,
      conclusions,
      sources
    );
    return textResponse(session);
  }

  private async handleListResearch(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const sessions = await store.listResearch(projectName);
    return textResponse(sessions);
  }

  private async handleGetResearch(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const sessionName = getString(args, 'sessionName');
    const session = await store.getResearch(projectName, sessionName);
    return textResponse(session);
  }

  private async handleUpdateResearch(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const sessionName = getString(args, 'sessionName');
    const updates: Record<string, unknown> = {};
    const findings = getOptionalString(args, 'findings');
    const conclusions = getOptionalString(args, 'conclusions');
    const sources = getStringArray(args, 'sources');
    if (findings !== undefined) updates.findings = findings;
    if (conclusions !== undefined) updates.conclusions = conclusions;
    if (sources.length > 0) updates.sources = sources;
    const session = await store.updateResearch(projectName, sessionName, updates as any);
    return textResponse(session);
  }

  private async handleDeleteResearch(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const sessionName = getString(args, 'sessionName');
    await store.deleteResearch(projectName, sessionName);
    return textResponse({ deleted: sessionName });
  }

  // -- Plan handlers -------------------------------------------------------

  private async handleCreatePlan(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const name = getString(args, 'name');
    const description = getString(args, 'description');
    const featureIds = getStringArray(args, 'featureIds');
    const techSpecIds = getStringArray(args, 'techSpecIds');
    const steps = getStringArray(args, 'steps');
    const plan = await store.createPlan(projectName, name, description, featureIds, techSpecIds, steps);
    return textResponse(plan);
  }

  private async handleListPlans(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const plans = await store.listPlans(projectName);
    return textResponse(plans);
  }

  private async handleUpdatePlanStatus(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const planName = getString(args, 'planName');
    const status = args.status as Plan['status'];
    if (!status) {
      throw new McpError(ErrorCode.InvalidParams, '"status" is required');
    }
    const steps = getStringArray(args, 'steps');
    const plan = await store.updatePlanStatus(projectName, planName, status, steps.length > 0 ? steps : undefined);
    return textResponse(plan);
  }

  private async handleDeletePlan(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const planName = getString(args, 'planName');
    await store.deletePlan(projectName, planName);
    return textResponse({ deleted: planName });
  }

  // -- Task handlers -------------------------------------------------------

  private async handleCreateTask(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const name = getString(args, 'name');
    const description = getString(args, 'description');
    const priority = (args.priority as Task['priority']) ?? 'medium';
    const dependencies = getStringArray(args, 'dependencies');
    const planId = getOptionalString(args, 'planId') ?? '';
    const task = await store.createTask(projectName, name, description, priority, dependencies, planId);
    return textResponse(task);
  }

  private async handleListTasks(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const tasks = await store.listTasks(projectName);
    return textResponse(tasks);
  }

  private async handleGetTask(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const taskName = getString(args, 'taskName');
    const task = await store.getTask(projectName, taskName);
    if (!task) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Task "${taskName}" not found in project "${projectName}"`
      );
    }
    return textResponse(task);
  }

  private async handleUpdateTaskStatus(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const taskName = getString(args, 'taskName');
    const status = args.status as Task['status'];
    if (!status) {
      throw new McpError(ErrorCode.InvalidParams, '"status" is required');
    }
    const task = await store.updateTaskStatus(projectName, taskName, status);
    return textResponse(task);
  }

  private async handleUpdateTask(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const taskName = getString(args, 'taskName');
    const updates: Record<string, unknown> = {};
    const description = getOptionalString(args, 'description');
    const priority = args.priority as Task['priority'] | undefined;
    const status = args.status as Task['status'] | undefined;
    const assignedTo = getOptionalString(args, 'assignedTo');
    const dependencies = getStringArray(args, 'dependencies');
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (dependencies.length > 0) updates.dependencies = dependencies;
    const task = await store.updateTask(projectName, taskName, updates as any);
    return textResponse(task);
  }

  private async handleAssignTask(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const taskName = getString(args, 'taskName');
    const assignee = getString(args, 'assignee');
    const task = await store.assignTask(projectName, taskName, assignee);
    return textResponse(task);
  }

  private async handleDeleteTask(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const taskName = getString(args, 'taskName');
    await store.deleteTask(projectName, taskName);
    return textResponse({ deleted: taskName });
  }

  // -- Advanced handlers ---------------------------------------------------

  private async handleSearchProject(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const query = getString(args, 'query');
    const results = await store.searchProject(projectName, query);
    return textResponse(results);
  }

  private async handleProjectSummary(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const summary = await store.projectSummary(projectName);
    return textResponse(summary);
  }

  private async handleDependencyGraph(args: Record<string, unknown>) {
    const projectName = getString(args, 'projectName');
    const entityType = getString(args, 'entityType') as 'feature' | 'task';
    const entityName = getString(args, 'entityName');
    const maxDepth = getOptionalNumber(args, 'maxDepth') ?? 1;
    const graph = await store.dependencyGraph(projectName, entityType, entityName, maxDepth);
    return textResponse(graph);
  }

  // -- Run ---------------------------------------------------------------

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Project Planer MCP server v0.3.0 running on stdio');
  }
}

const server = new ProjectPlanerServer();
server.run().catch(console.error);