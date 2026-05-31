import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import envPaths from 'env-paths';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { generateId, now, sanitizeName, timestampedFilename, tagColorFromName } from './helpers.js';
import type {
  ProjectMeta,
  Feature,
  TechSpec,
  ResearchSession,
  Plan,
  Task,
  Decision,
  Risk,
  Tag,
  TagAssignment,
  ActivityLogEntry,
  Milestone,
  ProjectExport,
  DependencyNode,
  ProjectSummary,
  ProjectTree,
  ProjectTreeEntry,
  SearchResult,
  ValidationIssue,
} from './types.js';

// ---------------------------------------------------------------------------
// Directory-based data store
// ---------------------------------------------------------------------------

export class ProjectStore {
  private projectsDir: string;

  constructor() {
    const paths = envPaths('project-planer-mcp', { suffix: '' });
    this.projectsDir = join(paths.data, 'projects');
  }

  private projectDir(projectName: string): string {
    return join(this.projectsDir, sanitizeName(projectName));
  }

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

  private decisionsDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Decisions');
  }

  private risksDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Risks');
  }

  private milestonesDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Milestones');
  }

  private tagsDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Tags');
  }

  private tagsIndexPath(projectName: string): string {
    return join(this.tagsDir(projectName), 'index.json');
  }

  private tagAssignmentsPath(projectName: string): string {
    return join(this.tagsDir(projectName), 'assignments.json');
  }

  private activityDir(projectName: string): string {
    return join(this.projectDir(projectName), 'Activity');
  }

  private async readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

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

  // -- Activity Log --------------------------------------------------------

  async logActivity(
    projectName: string,
    entityType: ActivityLogEntry['entityType'],
    entityId: string,
    entityName: string,
    action: ActivityLogEntry['action'],
    details: string
  ): Promise<void> {
    const entry: ActivityLogEntry = {
      id: generateId(),
      entityType,
      entityId,
      entityName,
      action,
      details,
      timestamp: now(),
    };
    const filename = timestampedFilename('activity', entityName);
    const aPath = join(this.activityDir(projectName), filename);
    await this.writeJson(aPath, entry);
  }

  async listActivity(
    projectName: string,
    filters?: {
      entityType?: ActivityLogEntry['entityType'];
      action?: ActivityLogEntry['action'];
      entityId?: string;
      limit?: number;
    }
  ): Promise<ActivityLogEntry[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.activityDir(projectName));
    const entries: ActivityLogEntry[] = [];
    for (const f of files) {
      try {
        const e = await this.readJson<ActivityLogEntry>(f);
        if (filters?.entityType && e.entityType !== filters.entityType) continue;
        if (filters?.action && e.action !== filters.action) continue;
        if (filters?.entityId && e.entityId !== filters.entityId) continue;
        entries.push(e);
      } catch { /* skip */ }
    }
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (filters?.limit && filters.limit > 0) return entries.slice(0, filters.limit);
    return entries;
  }

  // -- Tags ----------------------------------------------------------------

  private async ensureTagsIndex(projectName: string): Promise<void> {
    const idxPath = this.tagsIndexPath(projectName);
    if (!existsSync(idxPath)) await this.writeJson(idxPath, []);
  }

  private async ensureTagAssignments(projectName: string): Promise<void> {
    const aPath = this.tagAssignmentsPath(projectName);
    if (!existsSync(aPath)) await this.writeJson(aPath, []);
  }

  private async readTags(projectName: string): Promise<Tag[]> {
    await this.ensureTagsIndex(projectName);
    return this.readJson<Tag[]>(this.tagsIndexPath(projectName));
  }

  private async writeTags(projectName: string, tags: Tag[]): Promise<void> {
    await this.writeJson(this.tagsIndexPath(projectName), tags);
  }

  private async readTagAssignments(projectName: string): Promise<TagAssignment[]> {
    await this.ensureTagAssignments(projectName);
    return this.readJson<TagAssignment[]>(this.tagAssignmentsPath(projectName));
  }

  private async writeTagAssignments(projectName: string, assignments: TagAssignment[]): Promise<void> {
    await this.writeJson(this.tagAssignmentsPath(projectName), assignments);
  }

  async addTag(projectName: string, name: string, color?: string, description?: string): Promise<Tag> {
    await this.getProject(projectName);
    const tags = await this.readTags(projectName);
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new McpError(ErrorCode.InvalidParams, `Tag "${name}" already exists in project "${projectName}"`);
    }
    const tag: Tag = { id: generateId(), name, color: color ?? tagColorFromName(name), description: description ?? '', createdAt: now() };
    tags.push(tag);
    await this.writeTags(projectName, tags);
    await this.logActivity(projectName, 'tag', tag.id, tag.name, 'created', `Created tag "${tag.name}" with color ${tag.color}`);
    return tag;
  }

  async listTags(projectName: string): Promise<(Tag & { assignmentCount: number })[]> {
    await this.getProject(projectName);
    const tags = await this.readTags(projectName);
    const assignments = await this.readTagAssignments(projectName);
    return tags.map((t) => ({ ...t, assignmentCount: assignments.filter((a) => a.tagId === t.id).length }));
  }

  async removeTag(projectName: string, tagName: string): Promise<void> {
    const tags = await this.readTags(projectName);
    const idx = tags.findIndex((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (idx === -1) throw new McpError(ErrorCode.InvalidParams, `Tag "${tagName}" not found in project "${projectName}"`);
    const [removed] = tags.splice(idx, 1);
    const assignments = await this.readTagAssignments(projectName);
    await this.writeTagAssignments(projectName, assignments.filter((a) => a.tagId !== removed.id));
    await this.writeTags(projectName, tags);
    await this.logActivity(projectName, 'tag', removed.id, removed.name, 'deleted', `Deleted tag "${removed.name}" and removed its assignments`);
  }

  async assignTag(projectName: string, tagName: string, targetType: TagAssignment['targetType'], targetId: string): Promise<void> {
    const tags = await this.readTags(projectName);
    const tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) throw new McpError(ErrorCode.InvalidParams, `Tag "${tagName}" not found in project "${projectName}"`);
    const assignments = await this.readTagAssignments(projectName);
    if (assignments.some((a) => a.tagId === tag.id && a.targetId === targetId && a.targetType === targetType)) {
      throw new McpError(ErrorCode.InvalidParams, `Entity is already tagged with "${tagName}"`);
    }
    assignments.push({ tagId: tag.id, targetType, targetId });
    await this.writeTagAssignments(projectName, assignments);
    await this.logActivity(projectName, 'tag', tag.id, tag.name, 'tagged', `Tagged ${targetType} "${targetId}" with "${tag.name}"`);
  }

  async unassignTag(projectName: string, tagName: string, targetType: TagAssignment['targetType'], targetId: string): Promise<void> {
    const tags = await this.readTags(projectName);
    const tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) throw new McpError(ErrorCode.InvalidParams, `Tag "${tagName}" not found in project "${projectName}"`);
    const assignments = await this.readTagAssignments(projectName);
    const idx = assignments.findIndex((a) => a.tagId === tag.id && a.targetId === targetId && a.targetType === targetType);
    if (idx === -1) throw new McpError(ErrorCode.InvalidParams, `Entity is not tagged with "${tagName}"`);
    assignments.splice(idx, 1);
    await this.writeTagAssignments(projectName, assignments);
    await this.logActivity(projectName, 'tag', tag.id, tag.name, 'untagged', `Removed tag "${tag.name}" from ${targetType} "${targetId}"`);
  }

  async searchByTag(projectName: string, tagName: string): Promise<TagAssignment[]> {
    const tags = await this.readTags(projectName);
    const tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) throw new McpError(ErrorCode.InvalidParams, `Tag "${tagName}" not found in project "${projectName}"`);
    const assignments = await this.readTagAssignments(projectName);
    return assignments.filter((a) => a.tagId === tag.id);
  }

  async cleanTagAssignments(projectName: string, targetType: TagAssignment['targetType'], targetId: string): Promise<void> {
    const assignments = await this.readTagAssignments(projectName);
    const filtered = assignments.filter((a) => !(a.targetType === targetType && a.targetId === targetId));
    if (filtered.length !== assignments.length) await this.writeTagAssignments(projectName, filtered);
  }

  // -- Project -------------------------------------------------------------

  async createProject(name: string, description: string): Promise<ProjectMeta> {
    const projDir = this.projectDir(name);
    const metaPath = this.projectMetaPath(name);
    if (existsSync(metaPath)) throw new McpError(ErrorCode.InvalidParams, `Project "${name}" already exists`);
    const project: ProjectMeta = { id: generateId(), name, description, status: 'active', createdAt: now(), updatedAt: now() };
    await mkdir(join(projDir, 'Features'), { recursive: true });
    await mkdir(join(projDir, 'TechSpecs'), { recursive: true });
    await mkdir(join(projDir, 'Research'), { recursive: true });
    await mkdir(join(projDir, 'Plans'), { recursive: true });
    await mkdir(join(projDir, 'Tasks'), { recursive: true });
    await mkdir(join(projDir, 'Decisions'), { recursive: true });
    await mkdir(join(projDir, 'Risks'), { recursive: true });
    await mkdir(join(projDir, 'Milestones'), { recursive: true });
    await mkdir(join(projDir, 'Tags'), { recursive: true });
    await mkdir(join(projDir, 'Activity'), { recursive: true });
    await this.writeJson(metaPath, project);
    await this.logActivity(name, 'project', project.id, project.name, 'created', `Created project "${name}"`);
    return project;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    try {
      const projectDirs = await readdir(this.projectsDir, { withFileTypes: true });
      const results: ProjectMeta[] = [];
      for (const d of projectDirs) {
        if (!d.isDirectory()) continue;
        try { results.push(await this.readJson<ProjectMeta>(join(this.projectsDir, d.name, 'Project.json'))); } catch { /* skip */ }
      }
      return results;
    } catch { return []; }
  }

  async getProject(name: string): Promise<ProjectMeta> {
    const meta = await this.readJson<ProjectMeta>(this.projectMetaPath(name));
    if (!meta) throw new McpError(ErrorCode.InvalidParams, `Project "${name}" not found`);
    return meta;
  }

  async updateProject(name: string, updates: Partial<Pick<ProjectMeta, 'description' | 'status'>>): Promise<ProjectMeta> {
    const meta = await this.getProject(name);
    if (updates.description !== undefined) meta.description = updates.description;
    if (updates.status !== undefined) meta.status = updates.status;
    meta.updatedAt = now();
    await this.writeJson(this.projectMetaPath(name), meta);
    await this.logActivity(name, 'project', meta.id, meta.name, 'updated', `Updated project metadata`);
    return meta;
  }

  async deleteProject(name: string): Promise<void> {
    const projDir = this.projectDir(name);
    if (!existsSync(projDir)) throw new McpError(ErrorCode.InvalidParams, `Project "${name}" not found`);
    await rm(projDir, { recursive: true, force: true });
  }

  async archiveProject(name: string): Promise<ProjectMeta> { return this.updateProject(name, { status: 'archived' }); }
  async unarchiveProject(name: string): Promise<ProjectMeta> { return this.updateProject(name, { status: 'active' }); }

  async getProjectTree(projectName: string): Promise<ProjectTree> {
    await this.getProject(projectName);
    const readEntries = async <T extends { id: string }>(dir: string, nameKey: string, statusKey?: string, titleKey?: string): Promise<ProjectTreeEntry[]> => {
      const files = await this.listJsonFiles(dir);
      const entries: ProjectTreeEntry[] = [];
      for (const f of files) {
        try {
          const data = await this.readJson<T>(f);
          const entry: ProjectTreeEntry = { name: String((data as any)[nameKey] ?? 'unknown'), id: data.id };
          if (statusKey) entry.status = String((data as any)[statusKey] ?? '');
          if (titleKey) entry.title = String((data as any)[titleKey] ?? '');
          entries.push(entry);
        } catch { /* skip */ }
      }
      return entries;
    };
    const [features, techSpecs, research, plans, tasks, decisions, risks, milestones] = await Promise.all([
      readEntries<Feature>(this.featuresDir(projectName), 'name', 'status'),
      readEntries<TechSpec>(this.techSpecsDir(projectName), 'name'),
      readEntries<ResearchSession>(this.researchDir(projectName), 'sessionName'),
      readEntries<Plan>(this.plansDir(projectName), 'name', 'status'),
      readEntries<Task>(this.tasksDir(projectName), 'name', 'status'),
      readEntries<Decision>(this.decisionsDir(projectName), 'title', 'status', 'title'),
      readEntries<Risk>(this.risksDir(projectName), 'title', 'status', 'title'),
      readEntries<Milestone>(this.milestonesDir(projectName), 'name', 'status'),
    ]);
    const tags = await this.readTags(projectName).catch(() => [] as Tag[]);
    const activityFiles = await this.listJsonFiles(this.activityDir(projectName));
    const structure: ProjectTree['structure'] = { features, techSpecs, research, plans, tasks, decisions, risks, milestones, tags: { count: tags.length }, activity: { count: activityFiles.length } };
    const entityCounts: Record<string, number> = { features: features.length, techSpecs: techSpecs.length, research: research.length, plans: plans.length, tasks: tasks.length, decisions: decisions.length, risks: risks.length, milestones: milestones.length, tags: tags.length, activity: activityFiles.length };
    return { projectName, structure, entityCounts };
  }

  async templateProject(sourceProjectName: string, newProjectName: string, newDescription?: string, copyTasks?: boolean): Promise<ProjectMeta> {
    const project = await this.createProject(newProjectName, newDescription ?? '');
    const [features, techSpecs, plans, decisions, sourceTags, sourceAssignments] = await Promise.all([
      this.listFeatures(sourceProjectName), this.listTechSpecs(sourceProjectName),
      this.listPlans(sourceProjectName), this.listDecisions(sourceProjectName),
      this.readTags(sourceProjectName).catch(() => [] as Tag[]),
      this.readTagAssignments(sourceProjectName).catch(() => [] as TagAssignment[]),
    ]);
    const featureIdMap = new Map<string, string>();
    for (const f of features) { const nf = await this.addFeature(newProjectName, f.name, f.description, f.priority); featureIdMap.set(f.id, nf.id); }
    for (const ts of techSpecs) { await this.addTechSpec(newProjectName, ts.name, ts.description, featureIdMap.get(ts.featureId) ?? '', ts.details); }
    for (const p of plans) { await this.createPlan(newProjectName, p.name, p.description, p.featureIds.map((id) => featureIdMap.get(id) ?? id), p.techSpecIds, p.steps); }
    for (const d of decisions) { await this.addDecision(newProjectName, d.title, d.context, d.decision, d.rationale, d.consequences, d.options, d.tags, d.relatedFeatures.map((id) => featureIdMap.get(id) ?? id)); }
    if (copyTasks) { const sourceTasks = await this.listTasks(sourceProjectName); for (const t of sourceTasks) { await this.createTask(newProjectName, t.name, t.description, t.priority, t.dependencies, t.planId); } }
    const tagIdMap = new Map<string, string>();
    for (const st of sourceTags) { const nt = await this.addTag(newProjectName, st.name, st.color, st.description); tagIdMap.set(st.id, nt.id); }
    const newDecisions = await this.listDecisions(newProjectName);
    const decisionTitleMap = new Map(decisions.map((d, i) => [d.title, newDecisions[i]?.id ?? '']));
    for (const sa of sourceAssignments) {
      const newTagId = tagIdMap.get(sa.tagId);
      if (!newTagId) continue;
      let newTargetId = '';
      if (sa.targetType === 'feature') newTargetId = featureIdMap.get(sa.targetId) ?? '';
      else if (sa.targetType === 'decision') { const od = decisions.find((d) => d.id === sa.targetId); if (od) newTargetId = decisionTitleMap.get(od.title) ?? ''; }
      if (newTargetId) {
        try { await this.assignTag(newProjectName, sa.tagId, sa.targetType, newTargetId); } catch {
          const nt = await this.readTags(newProjectName).then((tags) => tags.find((t) => t.id === newTagId));
          if (nt) { try { await this.assignTag(newProjectName, nt.name, sa.targetType, newTargetId); } catch { /* skip */ } }
        }
      }
    }
    return project;
  }

  // -- Features ------------------------------------------------------------

  private featurePath(projectName: string, featureName: string): string {
    return join(this.featuresDir(projectName), `${sanitizeName(featureName)}.json`);
  }

  async addFeature(projectName: string, name: string, description: string, priority: Feature['priority'] = 'medium'): Promise<Feature> {
    await this.getProject(projectName);
    const fPath = this.featurePath(projectName, name);
    if (existsSync(fPath)) throw new McpError(ErrorCode.InvalidParams, `Feature "${name}" already exists in project "${projectName}"`);
    const feature: Feature = { id: generateId(), name, description, priority, status: 'proposed', dependencies: [], createdAt: now(), updatedAt: now() };
    await this.writeJson(fPath, feature);
    await this.logActivity(projectName, 'feature', feature.id, feature.name, 'created', `Created feature "${name}"`);
    return feature;
  }

  async listFeatures(projectName: string): Promise<Feature[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.featuresDir(projectName));
    const features: Feature[] = [];
    for (const f of files) { try { features.push(await this.readJson<Feature>(f)); } catch { /* skip */ } }
    return features;
  }

  async getFeature(projectName: string, featureName: string): Promise<Feature> {
    const f = await this.readJson<Feature>(this.featurePath(projectName, featureName));
    if (!f) throw new McpError(ErrorCode.InvalidParams, `Feature "${featureName}" not found in project "${projectName}"`);
    return f;
  }

  async updateFeature(projectName: string, featureName: string, updates: Partial<Pick<Feature, 'description' | 'priority' | 'status' | 'dependencies'>>): Promise<Feature> {
    const feature = await this.getFeature(projectName, featureName);
    if (updates.description !== undefined) feature.description = updates.description;
    if (updates.priority !== undefined) feature.priority = updates.priority;
    if (updates.status !== undefined) { const old = feature.status; feature.status = updates.status; await this.logActivity(projectName, 'feature', feature.id, feature.name, 'status_changed', `Status changed from "${old}" to "${updates.status}"`); }
    if (updates.dependencies !== undefined) feature.dependencies = updates.dependencies;
    feature.updatedAt = now();
    await this.writeJson(this.featurePath(projectName, featureName), feature);
    return feature;
  }

  async deleteFeature(projectName: string, featureName: string): Promise<void> {
    const fPath = this.featurePath(projectName, featureName);
    if (!existsSync(fPath)) throw new McpError(ErrorCode.InvalidParams, `Feature "${featureName}" not found in project "${projectName}"`);
    const feature = await this.readJson<Feature>(fPath);
    await rm(fPath, { force: true });
    await this.cleanTagAssignments(projectName, 'feature', feature.id);
    await this.logActivity(projectName, 'feature', feature.id, feature.name, 'deleted', `Deleted feature "${featureName}"`);
  }

  // -- TechSpecs -----------------------------------------------------------

  private techSpecPath(projectName: string, techSpecName: string): string {
    return join(this.techSpecsDir(projectName), `${sanitizeName(techSpecName)}.json`);
  }

  async addTechSpec(projectName: string, name: string, description: string, featureId: string, details: string): Promise<TechSpec> {
    await this.getProject(projectName);
    const tsPath = this.techSpecPath(projectName, name);
    if (existsSync(tsPath)) throw new McpError(ErrorCode.InvalidParams, `TechSpec "${name}" already exists in project "${projectName}"`);
    const spec: TechSpec = { id: generateId(), name, description, featureId, details, createdAt: now(), updatedAt: now() };
    await this.writeJson(tsPath, spec);
    await this.logActivity(projectName, 'techspec', spec.id, spec.name, 'created', `Created techspec "${name}"`);
    return spec;
  }

  async listTechSpecs(projectName: string): Promise<TechSpec[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.techSpecsDir(projectName));
    const specs: TechSpec[] = [];
    for (const f of files) { try { specs.push(await this.readJson<TechSpec>(f)); } catch { /* skip */ } }
    return specs;
  }

  async getTechSpec(projectName: string, techSpecName: string): Promise<TechSpec> {
    const tsPath = this.techSpecPath(projectName, techSpecName);
    if (!existsSync(tsPath)) throw new McpError(ErrorCode.InvalidParams, `TechSpec "${techSpecName}" not found in project "${projectName}"`);
    return this.readJson<TechSpec>(tsPath);
  }

  async updateTechSpec(projectName: string, techSpecName: string, updates: Partial<Pick<TechSpec, 'description' | 'featureId' | 'details'>>): Promise<TechSpec> {
    const spec = await this.getTechSpec(projectName, techSpecName);
    if (updates.description !== undefined) spec.description = updates.description;
    if (updates.featureId !== undefined) spec.featureId = updates.featureId;
    if (updates.details !== undefined) spec.details = updates.details;
    spec.updatedAt = now();
    await this.writeJson(this.techSpecPath(projectName, techSpecName), spec);
    await this.logActivity(projectName, 'techspec', spec.id, spec.name, 'updated', `Updated techspec "${techSpecName}"`);
    return spec;
  }

  async deleteTechSpec(projectName: string, techSpecName: string): Promise<void> {
    const tsPath = this.techSpecPath(projectName, techSpecName);
    if (!existsSync(tsPath)) throw new McpError(ErrorCode.InvalidParams, `TechSpec "${techSpecName}" not found in project "${projectName}"`);
    const spec = await this.readJson<TechSpec>(tsPath);
    await rm(tsPath, { force: true });
    await this.cleanTagAssignments(projectName, 'techspec', spec.id);
    await this.logActivity(projectName, 'techspec', spec.id, spec.name, 'deleted', `Deleted techspec "${techSpecName}"`);
  }

  // -- Research ------------------------------------------------------------

  async addResearch(projectName: string, sessionName: string, query: string, findings: string, conclusions: string, sources: string[]): Promise<ResearchSession> {
    await this.getProject(projectName);
    const filename = timestampedFilename('research', sessionName);
    const rPath = join(this.researchDir(projectName), filename);
    const session: ResearchSession = { id: generateId(), sessionName, query, findings, conclusions, sources, createdAt: now() };
    await this.writeJson(rPath, session);
    await this.logActivity(projectName, 'research', session.id, session.sessionName, 'created', `Created research session "${sessionName}"`);
    return session;
  }

  async listResearch(projectName: string): Promise<ResearchSession[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.researchDir(projectName));
    const sessions: ResearchSession[] = [];
    for (const f of files) { try { sessions.push(await this.readJson<ResearchSession>(f)); } catch { /* skip */ } }
    return sessions;
  }

  async getResearch(projectName: string, sessionName: string): Promise<ResearchSession> {
    const result = await this.findJsonFile<ResearchSession>(this.researchDir(projectName), (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName));
    if (!result) throw new McpError(ErrorCode.InvalidParams, `Research session "${sessionName}" not found in project "${projectName}"`);
    return result.data;
  }

  async updateResearch(projectName: string, sessionName: string, updates: Partial<Pick<ResearchSession, 'findings' | 'conclusions' | 'sources'>>): Promise<ResearchSession> {
    const result = await this.findJsonFile<ResearchSession>(this.researchDir(projectName), (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName));
    if (!result) throw new McpError(ErrorCode.InvalidParams, `Research session "${sessionName}" not found in project "${projectName}"`);
    const session = result.data;
    if (updates.findings !== undefined) session.findings = updates.findings;
    if (updates.conclusions !== undefined) session.conclusions = updates.conclusions;
    if (updates.sources !== undefined) session.sources = updates.sources;
    await this.writeJson(result.filePath, session);
    await this.logActivity(projectName, 'research', session.id, session.sessionName, 'updated', `Updated research session "${sessionName}"`);
    return session;
  }

  async deleteResearch(projectName: string, sessionName: string): Promise<void> {
    const result = await this.findJsonFile<ResearchSession>(this.researchDir(projectName), (s) => sanitizeName(s.sessionName) === sanitizeName(sessionName));
    if (!result) throw new McpError(ErrorCode.InvalidParams, `Research session "${sessionName}" not found in project "${projectName}"`);
    await rm(result.filePath, { force: true });
    await this.cleanTagAssignments(projectName, 'research', result.data.id);
    await this.logActivity(projectName, 'research', result.data.id, result.data.sessionName, 'deleted', `Deleted research session "${sessionName}"`);
  }

  // -- Plans ---------------------------------------------------------------

  async createPlan(projectName: string, name: string, description: string, featureIds: string[], techSpecIds: string[], steps: string[]): Promise<Plan> {
    await this.getProject(projectName);
    const filename = timestampedFilename('plan', name);
    const pPath = join(this.plansDir(projectName), filename);
    const plan: Plan = { id: generateId(), name, description, featureIds, techSpecIds, status: 'draft', steps, createdAt: now(), updatedAt: now() };
    await this.writeJson(pPath, plan);
    await this.logActivity(projectName, 'plan', plan.id, plan.name, 'created', `Created plan "${name}"`);
    return plan;
  }

  async listPlans(projectName: string): Promise<Plan[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.plansDir(projectName));
    const plans: Plan[] = [];
    for (const f of files) { try { plans.push(await this.readJson<Plan>(f)); } catch { /* skip */ } }
    return plans;
  }

  async getPlan(projectName: string, planName: string): Promise<Plan | null> {
    const plans = await this.listPlans(projectName);
    return plans.find((p) => sanitizeName(p.name) === sanitizeName(planName)) ?? null;
  }

  async updatePlanStatus(projectName: string, planName: string, status: Plan['status'], steps?: string[]): Promise<Plan> {
    const plan = await this.getPlan(projectName, planName);
    if (!plan) throw new McpError(ErrorCode.InvalidParams, `Plan "${planName}" not found in project "${projectName}"`);
    const oldStatus = plan.status;
    plan.status = status;
    if (steps !== undefined) plan.steps = steps;
    plan.updatedAt = now();
    const files = await this.listJsonFiles(this.plansDir(projectName));
    for (const f of files) { try { const p = await this.readJson<Plan>(f); if (p.id === plan.id) { await this.writeJson(f, plan); break; } } catch { /* skip */ } }
    await this.logActivity(projectName, 'plan', plan.id, plan.name, 'status_changed', `Status changed from "${oldStatus}" to "${status}"`);
    return plan;
  }

  async deletePlan(projectName: string, planName: string): Promise<void> {
    const files = await this.listJsonFiles(this.plansDir(projectName));
    for (const f of files) {
      try {
        const p = await this.readJson<Plan>(f);
        if (sanitizeName(p.name) === sanitizeName(planName)) {
          await rm(f, { force: true });
          await this.cleanTagAssignments(projectName, 'plan', p.id);
          await this.logActivity(projectName, 'plan', p.id, p.name, 'deleted', `Deleted plan "${planName}"`);
          return;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Plan "${planName}" not found in project "${projectName}"`);
  }

  // -- Tasks ---------------------------------------------------------------

  async createTask(projectName: string, name: string, description: string, priority: Task['priority'] = 'medium', dependencies: string[] = [], planId: string = ''): Promise<Task> {
    await this.getProject(projectName);
    const filename = timestampedFilename('task', name);
    const tPath = join(this.tasksDir(projectName), filename);
    const task: Task = { id: generateId(), name, description, status: 'pending', priority, assignedTo: '', dependencies, planId, createdAt: now(), updatedAt: now() };
    await this.writeJson(tPath, task);
    await this.logActivity(projectName, 'task', task.id, task.name, 'created', `Created task "${name}"`);
    return task;
  }

  async listTasks(projectName: string): Promise<Task[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.tasksDir(projectName));
    const tasks: Task[] = [];
    for (const f of files) { try { tasks.push(await this.readJson<Task>(f)); } catch { /* skip */ } }
    return tasks;
  }

  async getTask(projectName: string, taskName: string): Promise<Task | null> {
    const tasks = await this.listTasks(projectName);
    return tasks.find((t) => sanitizeName(t.name) === sanitizeName(taskName)) ?? null;
  }

  async updateTask(projectName: string, taskName: string, updates: Partial<Pick<Task, 'description' | 'status' | 'priority' | 'assignedTo' | 'dependencies'>>): Promise<Task> {
    const files = await this.listJsonFiles(this.tasksDir(projectName));
    for (const f of files) {
      try {
        const t = await this.readJson<Task>(f);
        if (sanitizeName(t.name) === sanitizeName(taskName)) {
          const task: Task = { ...t };
          if (updates.description !== undefined) task.description = updates.description;
          if (updates.priority !== undefined) task.priority = updates.priority;
          if (updates.assignedTo !== undefined) { const old = task.assignedTo; task.assignedTo = updates.assignedTo; await this.logActivity(projectName, 'task', task.id, task.name, 'reassigned', `Assigned from "${old}" to "${updates.assignedTo}"`); }
          if (updates.status !== undefined) { const old = task.status; task.status = updates.status; await this.logActivity(projectName, 'task', task.id, task.name, 'status_changed', `Status changed from "${old}" to "${updates.status}"`); }
          if (updates.dependencies !== undefined) task.dependencies = updates.dependencies;
          task.updatedAt = now();
          await this.writeJson(f, task);
          return task;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Task "${taskName}" not found in project "${projectName}"`);
  }

  async assignTask(projectName: string, taskName: string, assignee: string): Promise<Task> { return this.updateTask(projectName, taskName, { assignedTo: assignee }); }
  async updateTaskStatus(projectName: string, taskName: string, status: Task['status']): Promise<Task> { return this.updateTask(projectName, taskName, { status }); }

  async deleteTask(projectName: string, taskName: string): Promise<void> {
    const files = await this.listJsonFiles(this.tasksDir(projectName));
    for (const f of files) {
      try {
        const t = await this.readJson<Task>(f);
        if (sanitizeName(t.name) === sanitizeName(taskName)) {
          await rm(f, { force: true });
          await this.cleanTagAssignments(projectName, 'task', t.id);
          await this.logActivity(projectName, 'task', t.id, t.name, 'deleted', `Deleted task "${taskName}"`);
          return;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Task "${taskName}" not found in project "${projectName}"`);
  }

  // -- Bulk Operations -----------------------------------------------------

  async bulkCreateTasks(projectName: string, tasks: Array<{ name: string; description: string; priority?: Task['priority']; dependencies?: string[]; planId?: string }>): Promise<Task[]> {
    const created: Task[] = [];
    for (const t of tasks) {
      created.push(await this.createTask(projectName, t.name, t.description, t.priority, t.dependencies ?? [], t.planId ?? ''));
    }
    return created;
  }

  async bulkUpdateTasks(projectName: string, updates: Array<{ name: string; status?: Task['status']; assignedTo?: string; priority?: Task['priority'] }>): Promise<Task[]> {
    const results: Task[] = [];
    for (const u of updates) {
      const taskUpdates: Partial<Pick<Task, 'status' | 'assignedTo' | 'priority'>> = {};
      if (u.status !== undefined) taskUpdates.status = u.status;
      if (u.assignedTo !== undefined) taskUpdates.assignedTo = u.assignedTo;
      if (u.priority !== undefined) taskUpdates.priority = u.priority;
      results.push(await this.updateTask(projectName, u.name, taskUpdates));
    }
    return results;
  }

  // -- Decisions -----------------------------------------------------------

  async addDecision(projectName: string, title: string, context: string, decision: string, rationale: string, consequences: string, options?: string[], tags?: string[], relatedFeatures?: string[]): Promise<Decision> {
    await this.getProject(projectName);
    const filename = timestampedFilename('decision', title);
    const dPath = join(this.decisionsDir(projectName), filename);
    const rec: Decision = { id: generateId(), title, context, options: options ?? [], decision, rationale, consequences, status: 'proposed', supersededBy: '', tags: tags ?? [], relatedFeatures: relatedFeatures ?? [], createdAt: now(), updatedAt: now() };
    await this.writeJson(dPath, rec);
    await this.logActivity(projectName, 'decision', rec.id, rec.title, 'created', `Created decision record "${title}"`);
    return rec;
  }

  async listDecisions(projectName: string): Promise<Decision[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.decisionsDir(projectName));
    const decisions: Decision[] = [];
    for (const f of files) { try { decisions.push(await this.readJson<Decision>(f)); } catch { /* skip */ } }
    return decisions;
  }

  async getDecision(projectName: string, title: string): Promise<Decision> {
    const decisions = await this.listDecisions(projectName);
    const d = decisions.find((d) => sanitizeName(d.title) === sanitizeName(title));
    if (!d) throw new McpError(ErrorCode.InvalidParams, `Decision "${title}" not found in project "${projectName}"`);
    return d;
  }

  async updateDecision(projectName: string, title: string, updates: Partial<Pick<Decision, 'context' | 'options' | 'decision' | 'rationale' | 'consequences' | 'status' | 'supersededBy' | 'tags' | 'relatedFeatures'>>): Promise<Decision> {
    const files = await this.listJsonFiles(this.decisionsDir(projectName));
    for (const f of files) {
      try {
        const d = await this.readJson<Decision>(f);
        if (sanitizeName(d.title) === sanitizeName(title)) {
          if (updates.context !== undefined) d.context = updates.context;
          if (updates.options !== undefined) d.options = updates.options;
          if (updates.decision !== undefined) d.decision = updates.decision;
          if (updates.rationale !== undefined) d.rationale = updates.rationale;
          if (updates.consequences !== undefined) d.consequences = updates.consequences;
          if (updates.tags !== undefined) d.tags = updates.tags;
          if (updates.relatedFeatures !== undefined) d.relatedFeatures = updates.relatedFeatures;
          if (updates.status !== undefined) { const old = d.status; d.status = updates.status; await this.logActivity(projectName, 'decision', d.id, d.title, 'status_changed', `Status changed from "${old}" to "${updates.status}"`); }
          if (updates.supersededBy !== undefined) d.supersededBy = updates.supersededBy;
          d.updatedAt = now();
          await this.writeJson(f, d);
          return d;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Decision "${title}" not found in project "${projectName}"`);
  }

  async deleteDecision(projectName: string, title: string): Promise<void> {
    const files = await this.listJsonFiles(this.decisionsDir(projectName));
    for (const f of files) {
      try {
        const d = await this.readJson<Decision>(f);
        if (sanitizeName(d.title) === sanitizeName(title)) {
          await rm(f, { force: true });
          await this.cleanTagAssignments(projectName, 'decision', d.id);
          await this.logActivity(projectName, 'decision', d.id, d.title, 'deleted', `Deleted decision "${title}"`);
          return;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Decision "${title}" not found in project "${projectName}"`);
  }

  // -- Risks ---------------------------------------------------------------

  async addRisk(projectName: string, title: string, description: string, category: Risk['category'], likelihood: Risk['likelihood'], impact: Risk['impact'], mitigation?: string, contingency?: string, owner?: string, tags?: string[], relatedFeatures?: string[]): Promise<Risk> {
    await this.getProject(projectName);
    const severity = likelihood * impact;
    const filename = timestampedFilename('risk', title);
    const rPath = join(this.risksDir(projectName), filename);
    const risk: Risk = { id: generateId(), title, description, category, likelihood, impact, severity, status: 'identified', mitigation: mitigation ?? '', contingency: contingency ?? '', owner: owner ?? '', tags: tags ?? [], relatedFeatures: relatedFeatures ?? [], createdAt: now(), updatedAt: now() };
    await this.writeJson(rPath, risk);
    await this.logActivity(projectName, 'risk', risk.id, risk.title, 'created', `Created risk "${title}" (severity: ${severity})`);
    return risk;
  }

  async listRisks(projectName: string): Promise<Risk[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.risksDir(projectName));
    const risks: Risk[] = [];
    for (const f of files) { try { risks.push(await this.readJson<Risk>(f)); } catch { /* skip */ } }
    return risks;
  }

  async getRisk(projectName: string, title: string): Promise<Risk> {
    const risks = await this.listRisks(projectName);
    const r = risks.find((r) => sanitizeName(r.title) === sanitizeName(title));
    if (!r) throw new McpError(ErrorCode.InvalidParams, `Risk "${title}" not found in project "${projectName}"`);
    return r;
  }

  async updateRisk(projectName: string, title: string, updates: Partial<Pick<Risk, 'description' | 'category' | 'likelihood' | 'impact' | 'status' | 'mitigation' | 'contingency' | 'owner' | 'tags' | 'relatedFeatures'>>): Promise<Risk> {
    const files = await this.listJsonFiles(this.risksDir(projectName));
    for (const f of files) {
      try {
        const r = await this.readJson<Risk>(f);
        if (sanitizeName(r.title) === sanitizeName(title)) {
          if (updates.description !== undefined) r.description = updates.description;
          if (updates.category !== undefined) r.category = updates.category;
          if (updates.likelihood !== undefined) r.likelihood = updates.likelihood;
          if (updates.impact !== undefined) r.impact = updates.impact;
          if (updates.mitigation !== undefined) r.mitigation = updates.mitigation;
          if (updates.contingency !== undefined) r.contingency = updates.contingency;
          if (updates.owner !== undefined) r.owner = updates.owner;
          if (updates.tags !== undefined) r.tags = updates.tags;
          if (updates.relatedFeatures !== undefined) r.relatedFeatures = updates.relatedFeatures;
          if (updates.likelihood !== undefined || updates.impact !== undefined) r.severity = r.likelihood * r.impact;
          if (updates.status !== undefined) { const old = r.status; r.status = updates.status; await this.logActivity(projectName, 'risk', r.id, r.title, 'status_changed', `Status changed from "${old}" to "${updates.status}"`); }
          r.updatedAt = now();
          await this.writeJson(f, r);
          return r;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Risk "${title}" not found in project "${projectName}"`);
  }

  async deleteRisk(projectName: string, title: string): Promise<void> {
    const files = await this.listJsonFiles(this.risksDir(projectName));
    for (const f of files) {
      try {
        const r = await this.readJson<Risk>(f);
        if (sanitizeName(r.title) === sanitizeName(title)) {
          await rm(f, { force: true });
          await this.cleanTagAssignments(projectName, 'risk', r.id);
          await this.logActivity(projectName, 'risk', r.id, r.title, 'deleted', `Deleted risk "${title}"`);
          return;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Risk "${title}" not found in project "${projectName}"`);
  }

  // -- Milestones ----------------------------------------------------------

  async addMilestone(projectName: string, name: string, description: string, dueDate: string, featureIds?: string[], planIds?: string[], taskIds?: string[]): Promise<Milestone> {
    await this.getProject(projectName);
    const filename = timestampedFilename('milestone', name);
    const mPath = join(this.milestonesDir(projectName), filename);
    const milestone: Milestone = { id: generateId(), name, description, dueDate, status: 'planned', featureIds: featureIds ?? [], planIds: planIds ?? [], taskIds: taskIds ?? [], createdAt: now(), updatedAt: now() };
    await this.writeJson(mPath, milestone);
    await this.logActivity(projectName, 'milestone', milestone.id, milestone.name, 'created', `Created milestone "${name}" due ${dueDate}`);
    return milestone;
  }

  async listMilestones(projectName: string): Promise<Milestone[]> {
    await this.getProject(projectName);
    const files = await this.listJsonFiles(this.milestonesDir(projectName));
    const milestones: Milestone[] = [];
    for (const f of files) { try { milestones.push(await this.readJson<Milestone>(f)); } catch { /* skip */ } }
    return milestones;
  }

  async getMilestone(projectName: string, name: string): Promise<Milestone> {
    const milestones = await this.listMilestones(projectName);
    const m = milestones.find((m) => sanitizeName(m.name) === sanitizeName(name));
    if (!m) throw new McpError(ErrorCode.InvalidParams, `Milestone "${name}" not found in project "${projectName}"`);
    return m;
  }

  async updateMilestone(projectName: string, name: string, updates: Partial<Pick<Milestone, 'description' | 'dueDate' | 'status' | 'featureIds' | 'planIds' | 'taskIds'>>): Promise<Milestone> {
    const files = await this.listJsonFiles(this.milestonesDir(projectName));
    for (const f of files) {
      try {
        const m = await this.readJson<Milestone>(f);
        if (sanitizeName(m.name) === sanitizeName(name)) {
          if (updates.description !== undefined) m.description = updates.description;
          if (updates.dueDate !== undefined) m.dueDate = updates.dueDate;
          if (updates.featureIds !== undefined) m.featureIds = updates.featureIds;
          if (updates.planIds !== undefined) m.planIds = updates.planIds;
          if (updates.taskIds !== undefined) m.taskIds = updates.taskIds;
          if (updates.status !== undefined) { const old = m.status; m.status = updates.status; await this.logActivity(projectName, 'milestone', m.id, m.name, 'status_changed', `Status changed from "${old}" to "${updates.status}"`); }
          m.updatedAt = now();
          await this.writeJson(f, m);
          return m;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Milestone "${name}" not found in project "${projectName}"`);
  }

  async deleteMilestone(projectName: string, name: string): Promise<void> {
    const files = await this.listJsonFiles(this.milestonesDir(projectName));
    for (const f of files) {
      try {
        const m = await this.readJson<Milestone>(f);
        if (sanitizeName(m.name) === sanitizeName(name)) {
          await rm(f, { force: true });
          await this.cleanTagAssignments(projectName, 'milestone', m.id);
          await this.logActivity(projectName, 'milestone', m.id, m.name, 'deleted', `Deleted milestone "${name}"`);
          return;
        }
      } catch { /* skip */ }
    }
    throw new McpError(ErrorCode.InvalidParams, `Milestone "${name}" not found in project "${projectName}"`);
  }

  // -- Export / Import -----------------------------------------------------

  async exportProject(projectName: string): Promise<ProjectExport> {
    const project = await this.getProject(projectName);
    const [features, techSpecs, research, plans, tasks, decisions, risks, milestones, tags, tagAssignments, activityLog] = await Promise.all([
      this.listFeatures(projectName), this.listTechSpecs(projectName), this.listResearch(projectName),
      this.listPlans(projectName), this.listTasks(projectName), this.listDecisions(projectName),
      this.listRisks(projectName), this.listMilestones(projectName),
      this.readTags(projectName).catch(() => [] as Tag[]),
      this.readTagAssignments(projectName).catch(() => [] as TagAssignment[]),
      this.listActivity(projectName),
    ]);
    return { exportVersion: '1.0', exportedAt: now(), sourceHost: 'project-planer-mcp', project, features, techSpecs, research, plans, tasks, decisions, risks, milestones, tags, tagAssignments, activityLog };
  }

  async importProject(data: ProjectExport, overwriteExisting: boolean = false, importAs?: string): Promise<ProjectMeta> {
    const projectName = importAs ?? data.project.name;
    const projDir = this.projectDir(projectName);
    const metaPath = this.projectMetaPath(projectName);
    if (existsSync(metaPath) && !overwriteExisting) throw new McpError(ErrorCode.InvalidParams, `Project "${projectName}" already exists. Use overwriteExisting=true to replace.`);
    if (existsSync(projDir)) await rm(projDir, { recursive: true, force: true });
    await mkdir(join(projDir, 'Features'), { recursive: true });
    await mkdir(join(projDir, 'TechSpecs'), { recursive: true });
    await mkdir(join(projDir, 'Research'), { recursive: true });
    await mkdir(join(projDir, 'Plans'), { recursive: true });
    await mkdir(join(projDir, 'Tasks'), { recursive: true });
    await mkdir(join(projDir, 'Decisions'), { recursive: true });
    await mkdir(join(projDir, 'Risks'), { recursive: true });
    await mkdir(join(projDir, 'Milestones'), { recursive: true });
    await mkdir(join(projDir, 'Tags'), { recursive: true });
    await mkdir(join(projDir, 'Activity'), { recursive: true });
    const idMap = new Map<string, string>();
    const newProjectId = generateId();
    idMap.set(data.project.id, newProjectId);
    const project: ProjectMeta = { ...data.project, id: newProjectId, name: projectName, createdAt: now(), updatedAt: now() };
    await this.writeJson(metaPath, project);
    const writeEntities = async <T extends { id: string }>(dir: string, items: T[], nameKey: string, prefix: string) => {
      for (const item of items) {
        const newId = generateId();
        idMap.set(item.id, newId);
        const entity = { ...item, id: newId };
        const safeName = sanitizeName(String((entity as any)[nameKey] ?? 'unnamed'));
        await this.writeJson(join(dir, prefix === 'feature' ? `${safeName}.json` : timestampedFilename(prefix, safeName)), entity);
      }
    };
    await writeEntities(this.featuresDir(projectName), data.features, 'name', 'feature');
    await writeEntities(this.techSpecsDir(projectName), data.techSpecs, 'name', 'techspec');
    await writeEntities(this.researchDir(projectName), data.research, 'sessionName', 'research');
    await writeEntities(this.plansDir(projectName), data.plans, 'name', 'plan');
    await writeEntities(this.tasksDir(projectName), data.tasks, 'name', 'task');
    await writeEntities(this.decisionsDir(projectName), data.decisions, 'title', 'decision');
    await writeEntities(this.risksDir(projectName), data.risks, 'title', 'risk');
    await writeEntities(this.milestonesDir(projectName), data.milestones, 'name', 'milestone');
    const importedTags = data.tags.map((t) => ({ ...t, id: generateId() }));
    const tagIdMap = new Map<string, string>();
    for (let i = 0; i < data.tags.length; i++) tagIdMap.set(data.tags[i].id, importedTags[i].id);
    await this.writeJson(this.tagsIndexPath(projectName), importedTags);
    const remappedAssignments = data.tagAssignments.filter((a) => tagIdMap.has(a.tagId)).map((a) => ({ ...a, tagId: tagIdMap.get(a.tagId)! }));
    await this.writeJson(this.tagAssignmentsPath(projectName), remappedAssignments);
    for (const entry of data.activityLog) {
      const newEntityId = idMap.get(entry.entityId) ?? entry.entityId;
      await this.writeJson(join(this.activityDir(projectName), timestampedFilename('activity', entry.entityName)), { ...entry, id: generateId(), entityId: newEntityId, timestamp: entry.timestamp });
    }
    await this.logActivity(projectName, 'project', project.id, project.name, 'created', `Imported project "${projectName}" from export`);
    return project;
  }

  // -- Validation ----------------------------------------------------------

  async validateProject(projectName: string): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const [features, techSpecs, plans, tasks, decisions, risks, milestones] = await Promise.all([
      this.listFeatures(projectName), this.listTechSpecs(projectName), this.listPlans(projectName),
      this.listTasks(projectName), this.listDecisions(projectName), this.listRisks(projectName),
      this.listMilestones(projectName),
    ]);

    const featureIds = new Set(features.map((f) => f.id));
    const taskIds = new Set(tasks.map((t) => t.id));
    const planIds = new Set(plans.map((p) => p.id));
    const decisionIds = new Set(decisions.map((d) => d.id));

    // Feature dependency checks
    for (const f of features) {
      for (const depId of f.dependencies) {
        if (!featureIds.has(depId)) {
          issues.push({ severity: 'error', entityType: 'feature', entityId: f.id, entityName: f.name, field: 'dependencies', message: `Depends on non-existent feature "${depId}"` });
        }
      }
    }

    // TechSpec featureId checks
    for (const ts of techSpecs) {
      if (ts.featureId && !featureIds.has(ts.featureId)) {
        issues.push({ severity: 'warning', entityType: 'techspec', entityId: ts.id, entityName: ts.name, field: 'featureId', message: `References non-existent feature "${ts.featureId}"` });
      }
    }

    // Plan feature/techspec reference checks
    for (const p of plans) {
      for (const fid of p.featureIds) {
        if (!featureIds.has(fid)) {
          issues.push({ severity: 'warning', entityType: 'plan', entityId: p.id, entityName: p.name, field: 'featureIds', message: `References non-existent feature "${fid}"` });
        }
      }
    }

    // Task dependency and planId checks
    for (const t of tasks) {
      for (const depId of t.dependencies) {
        if (!taskIds.has(depId)) {
          issues.push({ severity: 'error', entityType: 'task', entityId: t.id, entityName: t.name, field: 'dependencies', message: `Depends on non-existent task "${depId}"` });
        }
      }
      if (t.planId && !planIds.has(t.planId)) {
        issues.push({ severity: 'warning', entityType: 'task', entityId: t.id, entityName: t.name, field: 'planId', message: `References non-existent plan "${t.planId}"` });
      }
    }

    // Decision relatedFeatures checks
    for (const d of decisions) {
      for (const fid of d.relatedFeatures) {
        if (!featureIds.has(fid)) {
          issues.push({ severity: 'warning', entityType: 'decision', entityId: d.id, entityName: d.title, field: 'relatedFeatures', message: `References non-existent feature "${fid}"` });
        }
      }
      if (d.supersededBy && !decisionIds.has(d.supersededBy)) {
        issues.push({ severity: 'warning', entityType: 'decision', entityId: d.id, entityName: d.title, field: 'supersededBy', message: `Supersedes non-existent decision "${d.supersededBy}"` });
      }
    }

    // Risk relatedFeatures checks
    for (const r of risks) {
      for (const fid of r.relatedFeatures) {
        if (!featureIds.has(fid)) {
          issues.push({ severity: 'warning', entityType: 'risk', entityId: r.id, entityName: r.title, field: 'relatedFeatures', message: `References non-existent feature "${fid}"` });
        }
      }
    }

    // Milestone reference checks
    for (const m of milestones) {
      for (const fid of m.featureIds) {
        if (!featureIds.has(fid)) {
          issues.push({ severity: 'warning', entityType: 'milestone', entityId: m.id, entityName: m.name, field: 'featureIds', message: `References non-existent feature "${fid}"` });
        }
      }
      for (const pid of m.planIds) {
        if (!planIds.has(pid)) {
          issues.push({ severity: 'warning', entityType: 'milestone', entityId: m.id, entityName: m.name, field: 'planIds', message: `References non-existent plan "${pid}"` });
        }
      }
      for (const tid of m.taskIds) {
        if (!taskIds.has(tid)) {
          issues.push({ severity: 'warning', entityType: 'milestone', entityId: m.id, entityName: m.name, field: 'taskIds', message: `References non-existent task "${tid}"` });
        }
      }
    }

    return issues;
  }

  // -- Markdown Export -----------------------------------------------------

  async exportMarkdown(projectName: string): Promise<string> {
    const project = await this.getProject(projectName);
    const [features, techSpecs, research, plans, tasks, decisions, risks, milestones, tags] = await Promise.all([
      this.listFeatures(projectName), this.listTechSpecs(projectName), this.listResearch(projectName),
      this.listPlans(projectName), this.listTasks(projectName), this.listDecisions(projectName),
      this.listRisks(projectName), this.listMilestones(projectName),
      this.readTags(projectName).catch(() => [] as Tag[]),
    ]);

    const lines: string[] = [];
    lines.push(`# ${project.name}`, '', project.description, '', `**Status:** ${project.status}  `);
    lines.push(`**Created:** ${project.createdAt}  `);
    lines.push(`**Updated:** ${project.updatedAt}  `);
    lines.push('', '---', '');

    // Summary
    lines.push('## Summary', '');
    lines.push(`| Entity | Count |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Features | ${features.length} |`);
    lines.push(`| TechSpecs | ${techSpecs.length} |`);
    lines.push(`| Research Sessions | ${research.length} |`);
    lines.push(`| Plans | ${plans.length} |`);
    lines.push(`| Tasks | ${tasks.length} |`);
    lines.push(`| Decisions | ${decisions.length} |`);
    lines.push(`| Risks | ${risks.length} |`);
    lines.push(`| Milestones | ${milestones.length} |`);
    lines.push(`| Tags | ${tags.length} |`);
    lines.push('', '---', '');

    // Features
    if (features.length > 0) {
      lines.push('## Features', '');
      lines.push(`| Name | Priority | Status |`);
      lines.push(`|------|----------|--------|`);
      for (const f of features) {
        lines.push(`| ${f.name} | ${f.priority} | ${f.status} |`);
      }
      lines.push('');
    }

    // TechSpecs
    if (techSpecs.length > 0) {
      lines.push('## Technical Specifications', '');
      for (const ts of techSpecs) {
        lines.push(`### ${ts.name}`, '', ts.description, '', `**Feature ID:** ${ts.featureId}`, '', '```', ts.details, '```', '');
      }
    }

    // Decisions (ADR format)
    if (decisions.length > 0) {
      lines.push('## Architecture Decision Records', '');
      for (const d of decisions) {
        lines.push(`### ADR: ${d.title}`, '', `**Status:** ${d.status}  `);
        if (d.supersededBy) lines.push(`**Superseded By:** ${d.supersededBy}  `);
        lines.push('', '**Context**', '', d.context, '', '**Decision**', '', d.decision, '', '**Rationale**', '', d.rationale, '', '**Consequences**', '', d.consequences, '');
        if (d.options.length > 0) {
          lines.push('**Alternatives Considered**', '');
          for (const opt of d.options) lines.push(`- ${opt}`);
          lines.push('');
        }
      }
    }

    // Risks
    if (risks.length > 0) {
      lines.push('## Risk Register', '');
      lines.push(`| Title | Category | Likelihood | Impact | Severity | Status | Owner |`);
      lines.push(`|-------|----------|-----------:|------:|---------:|-------|-------|`);
      for (const r of risks) {
        lines.push(`| ${r.title} | ${r.category} | ${r.likelihood} | ${r.impact} | ${r.severity} | ${r.status} | ${r.owner || '-'} |`);
      }
      lines.push('');
    }

    // Milestones
    if (milestones.length > 0) {
      lines.push('## Milestones', '');
      lines.push(`| Name | Due Date | Status |`);
      lines.push(`|------|----------|--------|`);
      for (const m of milestones) {
        lines.push(`| ${m.name} | ${m.dueDate} | ${m.status} |`);
      }
      lines.push('');
    }

    // Tasks (grouped by status)
    if (tasks.length > 0) {
      lines.push('## Tasks', '');
      const statusGroups: Record<string, Task[]> = {};
      for (const t of tasks) {
        (statusGroups[t.status] ??= []).push(t);
      }
      for (const [status, group] of Object.entries(statusGroups)) {
        lines.push(`### ${status.charAt(0).toUpperCase() + status.slice(1)}`, '');
        lines.push(`| Name | Priority | Assignee |`);
        lines.push(`|------|----------|----------|`);
        for (const t of group) {
          lines.push(`| ${t.name} | ${t.priority} | ${t.assignedTo || '-'} |`);
        }
        lines.push('');
      }
    }

    // Plans
    if (plans.length > 0) {
      lines.push('## Plans', '');
      for (const p of plans) {
        lines.push(`### ${p.name}`, '', p.description, '', `**Status:** ${p.status}  `, '');
        if (p.steps.length > 0) {
          lines.push('**Steps**', '');
          for (let i = 0; i < p.steps.length; i++) lines.push(`${i + 1}. ${p.steps[i]}`);
          lines.push('');
        }
      }
    }

    // Research
    if (research.length > 0) {
      lines.push('## Research Sessions', '');
      for (const r of research) {
        lines.push(`### ${r.sessionName}`, '', `**Query:** ${r.query}`, '', r.findings, '', `**Conclusions:** ${r.conclusions}`, '');
        if (r.sources.length > 0) {
          lines.push('**Sources**', '');
          for (const s of r.sources) lines.push(`- ${s}`);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  // -- Advanced: Search, Summary, Dependency Graph -------------------------

  async searchProject(projectName: string, query: string): Promise<SearchResult[]> {
    await this.getProject(projectName);
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    const searchDir = async (dir: string, type: string, nameKey: string, searchFields: string[]) => {
      const files = await this.listJsonFiles(dir);
      for (const f of files) {
        try {
          const raw = await readFile(f, 'utf-8');
          const data = JSON.parse(raw);
          const name = data[nameKey] ?? 'unknown';
          const matchField = searchFields.find((field) => {
            const val = data[field];
            return typeof val === 'string' && val.toLowerCase().includes(lowerQuery);
          });
          if (matchField) {
            const val = data[matchField] as string;
            const idx = val.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, idx - 60);
            const end = Math.min(val.length, idx + lowerQuery.length + 60);
            const context = (start > 0 ? '...' : '') + val.slice(start, end) + (end < val.length ? '...' : '');
            results.push({ type, id: data.id ?? '', name: String(name), filePath: relative(this.projectDir(projectName), f), matchContext: `[${matchField}] ${context}` });
          }
        } catch { /* skip */ }
      }
    };

    await Promise.all([
      searchDir(this.featuresDir(projectName), 'feature', 'name', ['name', 'description']),
      searchDir(this.techSpecsDir(projectName), 'techspec', 'name', ['name', 'description', 'details']),
      searchDir(this.researchDir(projectName), 'research', 'sessionName', ['sessionName', 'query', 'findings', 'conclusions']),
      searchDir(this.plansDir(projectName), 'plan', 'name', ['name', 'description']),
      searchDir(this.tasksDir(projectName), 'task', 'name', ['name', 'description']),
      searchDir(this.decisionsDir(projectName), 'decision', 'title', ['title', 'context', 'decision', 'rationale', 'consequences']),
      searchDir(this.risksDir(projectName), 'risk', 'title', ['title', 'description', 'mitigation', 'contingency']),
      searchDir(this.milestonesDir(projectName), 'milestone', 'name', ['name', 'description']),
    ]);

    // Special: search plan steps (array of strings)
    {
      const files = await this.listJsonFiles(this.plansDir(projectName));
      for (const f of files) {
        try {
          const raw = await readFile(f, 'utf-8');
          const data = JSON.parse(raw);
          const steps = data.steps as string[] | undefined;
          if (steps && Array.isArray(steps)) {
            const matchingStep = steps.find((s: string) => typeof s === 'string' && s.toLowerCase().includes(lowerQuery));
            if (matchingStep) {
              const idx = matchingStep.toLowerCase().indexOf(lowerQuery);
              const start = Math.max(0, idx - 60);
              const end = Math.min(matchingStep.length, idx + lowerQuery.length + 60);
              const context = (start > 0 ? '...' : '') + matchingStep.slice(start, end) + (end < matchingStep.length ? '...' : '');
              results.push({ type: 'plan', id: data.id ?? '', name: data.name ?? 'unknown', filePath: relative(this.projectDir(projectName), f), matchContext: `[steps] ${context}` });
            }
          }
        } catch { /* skip */ }
      }
    }

    return results;
  }

  async projectSummary(projectName: string): Promise<ProjectSummary> {
    const project = await this.getProject(projectName);
    const features = await this.listFeatures(projectName);
    const techSpecs = await this.listTechSpecs(projectName);
    const research = await this.listResearch(projectName);
    const plans = await this.listPlans(projectName);
    const tasks = await this.listTasks(projectName);
    const decisions = await this.listDecisions(projectName);
    const risks = await this.listRisks(projectName);
    const milestones = await this.listMilestones(projectName);
    const tags = await this.readTags(projectName).catch(() => [] as Tag[]);

    const featuresByStatus: Record<string, number> = {};
    const featuresByPriority: Record<string, number> = {};
    for (const f of features) { featuresByStatus[f.status] = (featuresByStatus[f.status] ?? 0) + 1; featuresByPriority[f.priority] = (featuresByPriority[f.priority] ?? 0) + 1; }

    const plansByStatus: Record<string, number> = {};
    for (const p of plans) plansByStatus[p.status] = (plansByStatus[p.status] ?? 0) + 1;

    const tasksByStatus: Record<string, number> = {};
    const tasksByPriority: Record<string, number> = {};
    for (const t of tasks) { tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1; tasksByPriority[t.priority] = (tasksByPriority[t.priority] ?? 0) + 1; }

    const decisionsByStatus: Record<string, number> = {};
    for (const d of decisions) decisionsByStatus[d.status] = (decisionsByStatus[d.status] ?? 0) + 1;

    const risksBySeverity: Record<string, number> = {};
    const risksByCategory: Record<string, number> = {};
    for (const r of risks) {
      const sevKey = r.severity <= 4 ? 'low (1-4)' : r.severity <= 9 ? 'medium (5-9)' : r.severity <= 15 ? 'high (10-15)' : 'critical (16-25)';
      risksBySeverity[sevKey] = (risksBySeverity[sevKey] ?? 0) + 1;
      risksByCategory[r.category] = (risksByCategory[r.category] ?? 0) + 1;
    }

    const milestonesByStatus: Record<string, number> = {};
    for (const m of milestones) milestonesByStatus[m.status] = (milestonesByStatus[m.status] ?? 0) + 1;

    return {
      project, featureCount: features.length, featuresByStatus, featuresByPriority,
      techSpecCount: techSpecs.length, researchCount: research.length,
      planCount: plans.length, plansByStatus,
      taskCount: tasks.length, tasksByStatus, tasksByPriority,
      decisionCount: decisions.length, decisionsByStatus,
      riskCount: risks.length, risksBySeverity, risksByCategory,
      milestoneCount: milestones.length, milestonesByStatus,
      tagCount: tags.length,
    };
  }

  async dependencyGraph(projectName: string, entityType: 'feature' | 'task', entityName: string, maxDepth: number = 1): Promise<{ root: DependencyNode; nodes: DependencyNode[] }> {
    const clampedDepth = Math.min(Math.max(1, maxDepth), 3);
    const allFeatures = await this.listFeatures(projectName);
    const allTasks = await this.listTasks(projectName);
    const featureMap = new Map(allFeatures.map((f) => [f.id, f]));
    const featureByNameMap = new Map(allFeatures.map((f) => [sanitizeName(f.name), f]));
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const taskByNameMap = new Map(allTasks.map((t) => [sanitizeName(t.name), t]));
    let rootEntity: { id: string; name: string; type: 'feature' | 'task'; status: string; dependencies: string[] };
    if (entityType === 'feature') {
      const feat = featureByNameMap.get(sanitizeName(entityName));
      if (!feat) throw new McpError(ErrorCode.InvalidParams, `Feature "${entityName}" not found in project "${projectName}"`);
      rootEntity = { id: feat.id, name: feat.name, type: 'feature', status: feat.status, dependencies: feat.dependencies };
    } else {
      const task = taskByNameMap.get(sanitizeName(entityName));
      if (!task) throw new McpError(ErrorCode.InvalidParams, `Task "${entityName}" not found in project "${projectName}"`);
      rootEntity = { id: task.id, name: task.name, type: 'task', status: task.status, dependencies: task.dependencies };
    }
    const reverseDepMap = new Map<string, string[]>();
    const addReverseDep = (dependsOn: string, dependent: string) => { const existing = reverseDepMap.get(dependsOn) ?? []; existing.push(dependent); reverseDepMap.set(dependsOn, existing); };
    for (const f of allFeatures) { for (const depId of f.dependencies) addReverseDep(depId, f.id); }
    for (const t of allTasks) { for (const depId of t.dependencies) addReverseDep(depId, t.id); }
    const visited = new Set<string>();
    const nodes: DependencyNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: rootEntity.id, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const isFeature = featureMap.has(current.id);
      const entity = isFeature ? featureMap.get(current.id) : taskMap.get(current.id);
      if (!entity) continue;
      nodes.push({ id: entity.id, name: entity.name, type: isFeature ? 'feature' : 'task', status: entity.status, dependsOn: entity.dependencies, dependedBy: reverseDepMap.get(current.id) ?? [] });
      if (current.depth < clampedDepth) {
        for (const depId of entity.dependencies) { if (!visited.has(depId)) queue.push({ id: depId, depth: current.depth + 1 }); }
        for (const depId of (reverseDepMap.get(current.id) ?? [])) { if (!visited.has(depId)) queue.push({ id: depId, depth: current.depth + 1 }); }
      }
    }
    const root = nodes.find((n) => n.id === rootEntity.id)!;
    return { root, nodes };
  }

  private async findJsonFile<T>(dir: string, predicate: (item: T) => boolean): Promise<{ data: T; filePath: string } | null> {
    const files = await this.listJsonFiles(dir);
    for (const f of files) { try { const data = await this.readJson<T>(f); if (predicate(data)) return { data, filePath: f }; } catch { /* skip */ } }
    return null;
  }
}