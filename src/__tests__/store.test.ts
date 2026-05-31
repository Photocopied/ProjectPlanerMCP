import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../store.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a ProjectStore whose data directory is a fresh temp folder.
 * Each test gets an isolated filesystem sandbox.
 */
function createTempStore(): { store: ProjectStore; projectName: string; cleanup: () => void } {
  const dataDir = mkdtempSync(join(tmpdir(), 'pp-test-'));
  const originalEnvPaths = process.env.NODE_ENV;

  // We'll override env-paths behaviour by mocking the module at import.
  // Since we can't easily mock env-paths post-import, we directly
  // overwrite the private field via prototype manipulation (acceptable
  // in tests only). Alternatively, we can create projects in a known
  // temp dir and rely on the default paths — but that dir might not
  // be writable in CI. The safest approach: use a small helper that
  // replaces the store's internal root.
  //
  // The store is constructed once per test with a patched projectsDir.
  const store = new (class extends ProjectStore {
    constructor() {
      super();
      // Override the private projectsDir by duck-punching the constructor
      // expectation. Since projectsDir is private, we use Object.defineProperty.
      Object.defineProperty(this, 'projectsDir', { value: join(dataDir, 'projects'), writable: false });
    }
  })();

  const projectName = `test-project-${Date.now()}`;
  const cleanup = () => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ok */ } };
  return { store, projectName, cleanup };
}

async function withProject(): Promise<{ store: ProjectStore; projectName: string; cleanup: () => void }> {
  const env = createTempStore();
  await env.store.createProject(env.projectName, 'Test project description');
  return env;
}

async function withFeature(): Promise<{ store: ProjectStore; projectName: string; featureName: string; cleanup: () => void }> {
  const env = await withProject();
  const f = await env.store.addFeature(env.projectName, 'test-feature', 'A test feature');
  return { ...env, featureName: f.name };
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Project CRUD', () => {
  it('creates a project and returns metadata', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      const p = await store.createProject(projectName, 'desc');
      expect(p.name).toBe(projectName);
      expect(p.description).toBe('desc');
      expect(p.status).toBe('active');
      expect(p.id).toBeTruthy();
      expect(p.createdAt).toBeTruthy();
      expect(p.updatedAt).toBeTruthy();
    } finally { cleanup(); }
  });

  it('lists projects', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      const list = await store.listProjects();
      expect(list.some((p) => p.name === projectName)).toBe(true);
    } finally { cleanup(); }
  });

  it('gets a project by name', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      const p = await store.getProject(projectName);
      expect(p.name).toBe(projectName);
    } finally { cleanup(); }
  });

  it('throws on duplicate project creation', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      await expect(store.createProject(projectName, 'd')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });

  it('throws on get of nonexistent project', async () => {
    const { store, cleanup } = createTempStore();
    try {
      await expect(store.getProject('nope')).rejects.toThrow();
    } finally { cleanup(); }
  });

  it('updates project description and status', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      const u = await store.updateProject(projectName, { description: 'new desc', status: 'archived' });
      expect(u.description).toBe('new desc');
      expect(u.status).toBe('archived');
    } finally { cleanup(); }
  });

  it('archives and unarchives a project', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      expect((await store.archiveProject(projectName)).status).toBe('archived');
      expect((await store.unarchiveProject(projectName)).status).toBe('active');
    } finally { cleanup(); }
  });

  it('deletes a project', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      await store.deleteProject(projectName);
      await expect(store.getProject(projectName)).rejects.toThrow();
    } finally { cleanup(); }
  });

  it('returns a project tree with counts', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'd');
      const tree = await store.getProjectTree(projectName);
      expect(tree.projectName).toBe(projectName);
      expect(tree.entityCounts.features).toBe(0);
      expect(tree.entityCounts.tags).toBe(0);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Feature CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Feature CRUD', () => {
  it('adds and lists features', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'feat1', 'desc', 'high');
      const list = await store.listFeatures(projectName);
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('feat1');
      expect(list[0].priority).toBe('high');
    } finally { cleanup(); }
  });

  it('gets a feature by name', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'x', 'd');
      const f = await store.getFeature(projectName, 'x');
      expect(f.name).toBe('x');
    } finally { cleanup(); }
  });

  it('throws on duplicate feature', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'dup', 'd');
      await expect(store.addFeature(projectName, 'dup', 'd')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });

  it('updates feature fields', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f', 'd');
      const u = await store.updateFeature(projectName, 'f', { status: 'completed', priority: 'critical' });
      expect(u.status).toBe('completed');
      expect(u.priority).toBe('critical');
    } finally { cleanup(); }
  });

  it('deletes a feature', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f', 'd');
      await store.deleteFeature(projectName, 'f');
      await expect(store.getFeature(projectName, 'f')).rejects.toThrow();
    } finally { cleanup(); }
  });

  it('throws on deletion of nonexistent feature', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await expect(store.deleteFeature(projectName, 'nope')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// TechSpec CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — TechSpec CRUD', () => {
  it('adds a techspec with a featureId', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f', 'd');
      const ts = await store.addTechSpec(projectName, 'ts1', 'desc', f.id, 'details here');
      expect(ts.name).toBe('ts1');
      expect(ts.featureId).toBe(f.id);
    } finally { cleanup(); }
  });

  it('lists techspecs', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTechSpec(projectName, 'ts1', 'd', '', '');
      const list = await store.listTechSpecs(projectName);
      expect(list.length).toBe(1);
    } finally { cleanup(); }
  });

  it('updates a techspec', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTechSpec(projectName, 'ts1', 'd', '', '');
      const u = await store.updateTechSpec(projectName, 'ts1', { details: 'new details' });
      expect(u.details).toBe('new details');
    } finally { cleanup(); }
  });

  it('deletes a techspec', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTechSpec(projectName, 'ts1', 'd', '', '');
      await store.deleteTechSpec(projectName, 'ts1');
      await expect(store.getTechSpec(projectName, 'ts1')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Research CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Research CRUD', () => {
  it('adds and lists research sessions', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addResearch(projectName, 'session1', 'query', 'findings', 'conclusions', ['src1']);
      const list = await store.listResearch(projectName);
      expect(list.length).toBe(1);
      expect(list[0].sessionName).toBe('session1');
      expect(list[0].sources).toEqual(['src1']);
    } finally { cleanup(); }
  });

  it('updates research findings', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addResearch(projectName, 's1', 'q', 'old', 'c', []);
      const u = await store.updateResearch(projectName, 's1', { findings: 'new' });
      expect(u.findings).toBe('new');
    } finally { cleanup(); }
  });

  it('deletes a research session', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addResearch(projectName, 's1', 'q', 'f', 'c', []);
      await store.deleteResearch(projectName, 's1');
      await expect(store.getResearch(projectName, 's1')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Plan CRUD', () => {
  it('creates and lists plans', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createPlan(projectName, 'plan1', 'desc', [], [], ['step1']);
      const list = await store.listPlans(projectName);
      expect(list.length).toBe(1);
      expect(list[0].steps).toEqual(['step1']);
    } finally { cleanup(); }
  });

  it('updates plan status and steps', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createPlan(projectName, 'p1', 'd', [], [], []);
      const u = await store.updatePlanStatus(projectName, 'p1', 'approved', ['new step']);
      expect(u.status).toBe('approved');
      expect(u.steps).toEqual(['new step']);
    } finally { cleanup(); }
  });

  it('deletes a plan', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createPlan(projectName, 'p1', 'd', [], [], []);
      await store.deletePlan(projectName, 'p1');
      expect(await store.getPlan(projectName, 'p1')).toBeNull();
    } finally { cleanup(); }
  });

  it('throws on deletion of nonexistent plan', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await expect(store.deletePlan(projectName, 'nope')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Task CRUD + Bulk Operations
// ---------------------------------------------------------------------------

describe('ProjectStore — Task CRUD', () => {
  it('creates and lists tasks', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 'task1', 'desc', 'high', [], '');
      const list = await store.listTasks(projectName);
      expect(list.length).toBe(1);
      expect(list[0].priority).toBe('high');
    } finally { cleanup(); }
  });

  it('gets a task by name', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 't1', 'd');
      const t = await store.getTask(projectName, 't1');
      expect(t).not.toBeNull();
      expect(t!.name).toBe('t1');
    } finally { cleanup(); }
  });

  it('updates a task', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 't1', 'd');
      const u = await store.updateTask(projectName, 't1', { status: 'in-progress', assignedTo: 'bob' });
      expect(u.status).toBe('in-progress');
      expect(u.assignedTo).toBe('bob');
    } finally { cleanup(); }
  });

  it('uses shortcut assign and status methods', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 't1', 'd');
      await store.assignTask(projectName, 't1', 'alice');
      await store.updateTaskStatus(projectName, 't1', 'completed');
      const t = await store.getTask(projectName, 't1');
      expect(t!.assignedTo).toBe('alice');
      expect(t!.status).toBe('completed');
    } finally { cleanup(); }
  });

  it('deletes a task', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 't1', 'd');
      await store.deleteTask(projectName, 't1');
      expect(await store.getTask(projectName, 't1')).toBeNull();
    } finally { cleanup(); }
  });

  it('throws on update of nonexistent task', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await expect(store.updateTask(projectName, 'nope', { status: 'completed' })).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });

  it('bulk creates tasks', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const tasks = await store.bulkCreateTasks(projectName, [
        { name: 'a', description: 'd1' },
        { name: 'b', description: 'd2', priority: 'high' },
      ]);
      expect(tasks.length).toBe(2);
      const list = await store.listTasks(projectName);
      expect(list.length).toBe(2);
    } finally { cleanup(); }
  });

  it('bulk updates tasks', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.createTask(projectName, 'a', 'd');
      await store.createTask(projectName, 'b', 'd');
      const results = await store.bulkUpdateTasks(projectName, [
        { name: 'a', status: 'completed' },
        { name: 'b', assignedTo: 'bob', priority: 'critical' },
      ]);
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].assignedTo).toBe('bob');
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Decision CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Decision CRUD', () => {
  it('adds and lists decisions', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addDecision(projectName, 'title1', 'ctx', 'dec', 'why', 'cons', ['opt1'], ['tag1'], []);
      const list = await store.listDecisions(projectName);
      expect(list.length).toBe(1);
      expect(list[0].options).toEqual(['opt1']);
    } finally { cleanup(); }
  });

  it('updates decision status', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addDecision(projectName, 't1', 'c', 'd', 'r', 'c');
      const u = await store.updateDecision(projectName, 't1', { status: 'accepted' });
      expect(u.status).toBe('accepted');
    } finally { cleanup(); }
  });

  it('deletes a decision', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addDecision(projectName, 't1', 'c', 'd', 'r', 'c');
      await store.deleteDecision(projectName, 't1');
      await expect(store.getDecision(projectName, 't1')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Risk CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Risk CRUD', () => {
  it('adds a risk with auto-calculated severity', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const r = await store.addRisk(projectName, 'risk1', 'desc', 'technical', 3, 4);
      expect(r.severity).toBe(12); // likelihood * impact
      expect(r.status).toBe('identified');
    } finally { cleanup(); }
  });

  it('updates risk recalculates severity', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addRisk(projectName, 'r1', 'd', 'technical', 2, 3);
      const u = await store.updateRisk(projectName, 'r1', { likelihood: 5, impact: 5 });
      expect(u.severity).toBe(25); // 5 * 5
    } finally { cleanup(); }
  });

  it('lists and deletes risks', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addRisk(projectName, 'r1', 'd', 'budget', 1, 1);
      expect((await store.listRisks(projectName)).length).toBe(1);
      await store.deleteRisk(projectName, 'r1');
      expect((await store.listRisks(projectName)).length).toBe(0);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Milestone CRUD
// ---------------------------------------------------------------------------

describe('ProjectStore — Milestone CRUD', () => {
  it('adds and lists milestones', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addMilestone(projectName, 'm1', 'desc', '2026-06-30', [], [], []);
      const list = await store.listMilestones(projectName);
      expect(list.length).toBe(1);
      expect(list[0].dueDate).toBe('2026-06-30');
    } finally { cleanup(); }
  });

  it('updates milestone status', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addMilestone(projectName, 'm1', 'd', '2026-06-30');
      const u = await store.updateMilestone(projectName, 'm1', { status: 'completed' });
      expect(u.status).toBe('completed');
    } finally { cleanup(); }
  });

  it('deletes a milestone', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addMilestone(projectName, 'm1', 'd', '2026-06-30');
      await store.deleteMilestone(projectName, 'm1');
      await expect(store.getMilestone(projectName, 'm1')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('ProjectStore — Tags', () => {
  it('adds a tag', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const t = await store.addTag(projectName, 'urgent');
      expect(t.name).toBe('urgent');
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
    } finally { cleanup(); }
  });

  it('lists tags with assignment counts', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTag(projectName, 'urgent');
      const tags = await store.listTags(projectName);
      expect(tags.length).toBe(1);
      expect(tags[0].assignmentCount).toBe(0);
    } finally { cleanup(); }
  });

  it('throws on duplicate tag name', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTag(projectName, 'urgent');
      await expect(store.addTag(projectName, 'Urgent')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });

  it('assigns and unassigns tags', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f1', 'd');
      const tag = await store.addTag(projectName, 'urgent');
      await store.assignTag(projectName, 'urgent', 'feature', f.id);
      const tags = await store.listTags(projectName);
      expect(tags.find((t) => t.name === 'urgent')!.assignmentCount).toBe(1);
      await store.unassignTag(projectName, 'urgent', 'feature', f.id);
      const tags2 = await store.listTags(projectName);
      expect(tags2.find((t) => t.name === 'urgent')!.assignmentCount).toBe(0);
    } finally { cleanup(); }
  });

  it('throws on duplicate tag assignment', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f1', 'd');
      await store.addTag(projectName, 'urgent');
      await store.assignTag(projectName, 'urgent', 'feature', f.id);
      await expect(store.assignTag(projectName, 'urgent', 'feature', f.id)).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });

  it('removes a tag and cleans assignments', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f1', 'd');
      await store.addTag(projectName, 'urgent');
      await store.assignTag(projectName, 'urgent', 'feature', f.id);
      await store.removeTag(projectName, 'urgent');
      const tags = await store.listTags(projectName);
      expect(tags.length).toBe(0);
    } finally { cleanup(); }
  });

  it('searches by tag', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f1', 'd');
      await store.addTag(projectName, 'urgent');
      await store.assignTag(projectName, 'urgent', 'feature', f.id);
      const results = await store.searchByTag(projectName, 'urgent');
      expect(results.length).toBe(1);
      expect(results[0].targetId).toBe(f.id);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

describe('ProjectStore — Activity Log', () => {
  it('records activity and returns it sorted by timestamp desc', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const entries = await store.listActivity(projectName);
      expect(entries.length).toBeGreaterThanOrEqual(1); // create_project logged
    } finally { cleanup(); }
  });

  it('filters by entityType', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'd');
      const entries = await store.listActivity(projectName, { entityType: 'feature' });
      expect(entries.every((e) => e.entityType === 'feature')).toBe(true);
    } finally { cleanup(); }
  });

  it('filters by action', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const entries = await store.listActivity(projectName, { action: 'created' });
      expect(entries.every((e) => e.action === 'created')).toBe(true);
    } finally { cleanup(); }
  });

  it('respects limit', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'd');
      await store.addFeature(projectName, 'f2', 'd');
      const entries = await store.listActivity(projectName, { limit: 2 });
      expect(entries.length).toBeLessThanOrEqual(2);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('ProjectStore — Validation', () => {
  it('returns no issues for a clean project', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const issues = await store.validateProject(projectName);
      expect(issues.length).toBe(0);
    } finally { cleanup(); }
  });

  it('detects broken feature dependencies', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'd');
      await store.updateFeature(projectName, 'f1', { dependencies: ['nonexistent-id'] });
      const issues = await store.validateProject(projectName);
      expect(issues.some((i) => i.severity === 'error' && i.field === 'dependencies')).toBe(true);
    } finally { cleanup(); }
  });

  it('detects orphaned techspecs', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addTechSpec(projectName, 'ts1', 'd', 'nonexistent-feature-id', '');
      const issues = await store.validateProject(projectName);
      expect(issues.some((i) => i.entityType === 'techspec')).toBe(true);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

describe('ProjectStore — Export / Import', () => {
  it('exports a project with all entities', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'd');
      const exported = await store.exportProject(projectName);
      expect(exported.exportVersion).toBe('1.0');
      expect(exported.features.length).toBe(1);
    } finally { cleanup(); }
  });

  it('imports an exported project', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'original');
      await store.addFeature(projectName, 'f1', 'd');
      await store.addTag(projectName, 't1');
      const exported = await store.exportProject(projectName);

      const imported = await store.importProject(exported, false, 'imported-project');
      expect(imported.name).toBe('imported-project');
      const features = await store.listFeatures('imported-project');
      expect(features.length).toBe(1);
    } finally { cleanup(); }
  });

  it('import overwrites when overwriteExisting is true', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'original');
      const exported = await store.exportProject(projectName);
      const imported = await store.importProject(exported, true, projectName);
      expect(imported.name).toBe(projectName);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Markdown Export
// ---------------------------------------------------------------------------

describe('ProjectStore — Markdown Export', () => {
  it('produces a markdown string with project name and summary', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const md = await store.exportMarkdown(projectName);
      expect(md).toContain(projectName);
      expect(md).toContain('| Entity | Count |');
      expect(md).toContain('| Features | 0 |');
    } finally { cleanup(); }
  });

  it('includes feature data in markdown', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'my-feature', 'desc');
      const md = await store.exportMarkdown(projectName);
      expect(md).toContain('my-feature');
      expect(md).toContain('## Features');
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('ProjectStore — Search', () => {
  it('finds features by name case-insensitively', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'MyFeature', 'desc');
      const results = await store.searchProject(projectName, 'myfeature');
      expect(results.some((r) => r.type === 'feature')).toBe(true);
    } finally { cleanup(); }
  });

  it('returns empty for non-matching queries', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'desc');
      const results = await store.searchProject(projectName, 'zzzzz');
      expect(results.length).toBe(0);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Project Summary
// ---------------------------------------------------------------------------

describe('ProjectStore — Project Summary', () => {
  it('returns counts and breakdowns', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await store.addFeature(projectName, 'f1', 'd', 'high');
      const s = await store.projectSummary(projectName);
      expect(s.featureCount).toBe(1);
      expect(s.featuresByPriority.high).toBe(1);
      expect(s.featuresByStatus.proposed).toBe(1);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

describe('ProjectStore — Dependency Graph', () => {
  it('resolves dependencies for a feature', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      const f = await store.addFeature(projectName, 'f1', 'd');
      const graph = await store.dependencyGraph(projectName, 'feature', 'f1');
      expect(graph.root.name).toBe('f1');
      expect(graph.root.type).toBe('feature');
    } finally { cleanup(); }
  });

  it('throws on nonexistent entity', async () => {
    const { store, projectName, cleanup } = await withProject();
    try {
      await expect(store.dependencyGraph(projectName, 'feature', 'nope')).rejects.toThrow(McpError);
    } finally { cleanup(); }
  });
});

// ---------------------------------------------------------------------------
// Template Project
// ---------------------------------------------------------------------------

describe('ProjectStore — Template Project', () => {
  it('creates a new project from a template', async () => {
    const { store, projectName, cleanup } = createTempStore();
    try {
      await store.createProject(projectName, 'source');
      await store.addFeature(projectName, 'f1', 'd', 'critical');
      const templated = await store.templateProject(projectName, 'cloned', 'cloned desc', false);
      expect(templated.name).toBe('cloned');
      expect(templated.description).toBe('cloned desc');
      const features = await store.listFeatures('cloned');
      expect(features.length).toBe(1);
      expect(features[0].priority).toBe('critical');
    } finally { cleanup(); }
  });
});