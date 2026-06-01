import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ProjectPlanerServer } from '../server.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a linked pair of in-memory transports, connects a Client to one end
 * and a ProjectPlanerServer to the other.
 * The server's data directory is isolated by overriding HOME to a temp dir.
 */
async function createTestClient(): Promise<{
  client: Client;
  cleanup: () => void;
}> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pp-int-test-'));

  const server = new ProjectPlanerServer({ dataDir: join(dataDir, 'projects') });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'integration-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  // Connect both sides
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  const cleanup = () => {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ok */ }
  };

  return { client, cleanup };
}

/**
 * Helper: call a tool and return the parsed JSON from the first text content item.
 */
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const content: any = result.content;
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe('text');
  return JSON.parse(content[0].text);
}

/**
 * Helper: call a tool that returns text content (not JSON).
 */
async function callToolText(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content: any = result.content;
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe('text');
  return content[0].text;
}

// ---------------------------------------------------------------------------
// Integration Tests — Real MCP Protocol Over InMemoryTransport
// ---------------------------------------------------------------------------

describe('MCP Integration — Full Project Lifecycle', () => {
  let client: Client;
  let cleanupFn: () => void;

  afterEach(() => {
    cleanupFn?.();
  });

  // -----------------------------------------------------------------------
  // 1. List Tools
  // -----------------------------------------------------------------------
  it('should list all available tools with valid schemas', async () => {
    ({ client, cleanup: cleanupFn } = await createTestClient());
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;
    expect(tools.length).toBeGreaterThan(40); // We have ~40+ tools

    // Check a few known tools exist
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('create_project');
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('add_feature');
    expect(toolNames).toContain('create_task');
    expect(toolNames).toContain('add_decision');
    expect(toolNames).toContain('add_risk');
    expect(toolNames).toContain('add_tag');
    expect(toolNames).toContain('export_project');
    expect(toolNames).toContain('import_project');
    expect(toolNames).toContain('validate_project');
    expect(toolNames).toContain('export_markdown');
    expect(toolNames).toContain('search_project');
    expect(toolNames).toContain('project_summary');
    expect(toolNames).toContain('dependency_graph');
    expect(toolNames).toContain('template_project');

    // Verify each tool has a proper inputSchema with type: 'object'
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  // -----------------------------------------------------------------------
  // 2. Complete Project Lifecycle
  // -----------------------------------------------------------------------
  it('should complete a full project lifecycle: create → populate → export → validate → cleanup', async () => {
    ({ client, cleanup: cleanupFn } = await createTestClient());
    const projectName = 'IntegrationTestProject';

    // -- Create project ---------------------------------------------------
    const created = await callTool(client, 'create_project', {
      name: projectName,
      description: 'A project for integration testing',
    }) as any;
    expect(created.name).toBe(projectName);
    expect(created.status).toBe('active');
    expect(created.id).toBeTruthy();

    // -- List projects ----------------------------------------------------
    const projects = await callTool(client, 'list_projects') as any[];
    expect(projects.some((p: any) => p.name === projectName)).toBe(true);

    // -- Get project ------------------------------------------------------
    const got = await callTool(client, 'get_project', { projectName }) as any;
    expect(got.name).toBe(projectName);

    // -- Update project ---------------------------------------------------
    const updated = await callTool(client, 'update_project', {
      projectName,
      description: 'Updated description',
      status: 'active',
    }) as any;
    expect(updated.description).toBe('Updated description');

    // -- Add features -----------------------------------------------------
    const feat1 = await callTool(client, 'add_feature', {
      projectName,
      name: 'user-auth',
      description: 'User authentication system',
      priority: 'critical',
    }) as any;
    expect(feat1.name).toBe('user-auth');
    expect(feat1.priority).toBe('critical');

    const feat2 = await callTool(client, 'add_feature', {
      projectName,
      name: 'data-export',
      description: 'Export data to CSV/PDF',
      priority: 'high',
    }) as any;
    expect(feat2.name).toBe('data-export');

    // -- List features ----------------------------------------------------
    const features = await callTool(client, 'list_features', { projectName }) as any[];
    expect(features.length).toBe(2);

    // -- Get feature ------------------------------------------------------
    const gotFeat = await callTool(client, 'get_feature', { projectName, featureName: 'user-auth' }) as any;
    expect(gotFeat.name).toBe('user-auth');

    // -- Update feature ---------------------------------------------------
    const upFeat = await callTool(client, 'update_feature', {
      projectName,
      featureName: 'user-auth',
      status: 'approved',
      priority: 'critical',
    }) as any;
    expect(upFeat.status).toBe('approved');

    // -- Add techspecs ----------------------------------------------------
    const ts1 = await callTool(client, 'add_techspec', {
      projectName,
      name: 'jwt-auth-spec',
      description: 'JWT-based authentication spec',
      featureId: feat1.id,
      details: 'Use RS256 signed JWTs with refresh tokens stored in httpOnly cookies. Access tokens expire in 15 min, refresh tokens in 7 days.',
    }) as any;
    expect(ts1.name).toBe('jwt-auth-spec');
    expect(ts1.featureId).toBe(feat1.id);

    // -- List techspecs ---------------------------------------------------
    const techspecs = await callTool(client, 'list_techspecs', { projectName }) as any[];
    expect(techspecs.length).toBe(1);

    // -- Update techspec --------------------------------------------------
    const upTs = await callTool(client, 'update_techspec', {
      projectName,
      techSpecName: 'jwt-auth-spec',
      details: 'Updated: Use ES256 instead of RS256 for better performance.',
    }) as any;
    expect(upTs.details).toContain('ES256');

    // -- Add research -----------------------------------------------------
    const research = await callTool(client, 'add_research', {
      projectName,
      sessionName: 'auth-library-comparison',
      query: 'Best JWT library for Node.js in 2026',
      findings: 'jsonwebtoken has 30M weekly downloads. jose offers better ESM support.',
      conclusions: 'Use jose for new projects due to native ESM and modern API.',
      sources: ['https://npmjs.com/package/jsonwebtoken', 'https://npmjs.com/package/jose'],
    }) as any;
    expect(research.sessionName).toBe('auth-library-comparison');

    // -- List research ----------------------------------------------------
    const researchList = await callTool(client, 'list_research', { projectName }) as any[];
    expect(researchList.length).toBe(1);

    // -- Update research --------------------------------------------------
    const upResearch = await callTool(client, 'update_research', {
      projectName,
      sessionName: 'auth-library-comparison',
      findings: 'Updated findings: jose chosen for ESM support.',
    }) as any;
    expect(upResearch.findings).toContain('jose chosen');

    // -- Create plan ------------------------------------------------------
    const plan = await callTool(client, 'create_plan', {
      projectName,
      name: 'auth-implementation-plan',
      description: 'Plan for implementing user authentication',
      featureIds: [feat1.id],
      techSpecIds: [ts1.id],
      steps: ['Set up JWT utilities', 'Implement login endpoint', 'Implement middleware', 'Add refresh token rotation'],
    }) as any;
    expect(plan.name).toBe('auth-implementation-plan');
    expect(plan.steps.length).toBe(4);

    // -- List plans -------------------------------------------------------
    const plans = await callTool(client, 'list_plans', { projectName }) as any[];
    expect(plans.length).toBe(1);

    // -- Update plan status -----------------------------------------------
    const upPlan = await callTool(client, 'update_plan_status', {
      projectName,
      planName: 'auth-implementation-plan',
      status: 'approved',
    }) as any;
    expect(upPlan.status).toBe('approved');

    // -- Create tasks -----------------------------------------------------
    const task1 = await callTool(client, 'create_task', {
      projectName,
      name: 'implement-jwt-utils',
      description: 'Create JWT sign/verify utility functions',
      priority: 'critical',
      planId: plan.id,
    }) as any;
    expect(task1.name).toBe('implement-jwt-utils');
    expect(task1.status).toBe('pending');

    const task2 = await callTool(client, 'create_task', {
      projectName,
      name: 'implement-login-endpoint',
      description: 'Implement POST /auth/login endpoint',
      priority: 'high',
      dependencies: [task1.id],
      planId: plan.id,
    }) as any;

    // -- List tasks -------------------------------------------------------
    const tasks = await callTool(client, 'list_tasks', { projectName }) as any[];
    expect(tasks.length).toBe(2);

    // -- Get task ---------------------------------------------------------
    const gotTask = await callTool(client, 'get_task', { projectName, taskName: 'implement-jwt-utils' }) as any;
    expect(gotTask.name).toBe('implement-jwt-utils');

    // -- Assign task ------------------------------------------------------
    const assigned = await callTool(client, 'assign_task', {
      projectName,
      taskName: 'implement-jwt-utils',
      assignee: 'alice',
    }) as any;
    expect(assigned.assignedTo).toBe('alice');

    // -- Update task status -----------------------------------------------
    const completed = await callTool(client, 'update_task_status', {
      projectName,
      taskName: 'implement-jwt-utils',
      status: 'completed',
    }) as any;
    expect(completed.status).toBe('completed');

    // -- Update task (full) -----------------------------------------------
    const upTask = await callTool(client, 'update_task', {
      projectName,
      taskName: 'implement-login-endpoint',
      description: 'Implement POST /auth/login with validation',
      priority: 'critical',
      status: 'in-progress',
      assignedTo: 'bob',
    }) as any;
    expect(upTask.priority).toBe('critical');
    expect(upTask.status).toBe('in-progress');
    expect(upTask.assignedTo).toBe('bob');

    // -- Bulk create tasks ------------------------------------------------
    const bulkResult = await callTool(client, 'bulk_create_tasks', {
      projectName,
      tasks: [
        { name: 'task-bulk-a', description: 'Bulk task A' },
        { name: 'task-bulk-b', description: 'Bulk task B', priority: 'high' },
      ],
    }) as any;
    expect(bulkResult.succeeded.length).toBe(2);
    expect(bulkResult.errors.length).toBe(0);

    // -- Bulk update tasks ------------------------------------------------
    const bulkUpd = await callTool(client, 'bulk_update_tasks', {
      projectName,
      updates: [
        { name: 'task-bulk-a', status: 'completed' },
        { name: 'task-bulk-b', assignedTo: 'carol', priority: 'critical' },
      ],
    }) as any;
    expect(bulkUpd.succeeded.length).toBe(2);
    expect(bulkUpd.errors.length).toBe(0);

    // -- Add decision (ADR) -----------------------------------------------
    const decision = await callTool(client, 'add_decision', {
      projectName,
      title: 'Use-jose-for-JWT',
      context: 'Need to choose a JWT library for the auth system',
      decision: 'Use the jose library for all JWT operations',
      rationale: 'jose has native ESM, modern API, and better security defaults',
      consequences: 'Team needs to learn jose API. Migration from jsonwebtoken if any legacy code exists.',
      options: ['jsonwebtoken', 'jose', 'bcrypt'],
      tags: ['auth', 'security'],
      relatedFeatures: [feat1.id],
    }) as any;
    expect(decision.title).toBe('Use-jose-for-JWT');
    expect(decision.tags).toContain('auth');

    // -- List decisions ---------------------------------------------------
    const decisions = await callTool(client, 'list_decisions', { projectName }) as any[];
    expect(decisions.length).toBe(1);

    // -- Get decision -----------------------------------------------------
    const gotDecision = await callTool(client, 'get_decision', { projectName, title: 'Use-jose-for-JWT' }) as any;
    expect(gotDecision.title).toBe('Use-jose-for-JWT');

    // -- Update decision --------------------------------------------------
    const upDecision = await callTool(client, 'update_decision', {
      projectName,
      title: 'Use-jose-for-JWT',
      status: 'accepted',
    }) as any;
    expect(upDecision.status).toBe('accepted');

    // -- Add risk ---------------------------------------------------------
    const risk = await callTool(client, 'add_risk', {
      projectName,
      title: 'JWT-library-migration-delay',
      description: 'Migration from jsonwebtoken to jose may take longer than estimated',
      category: 'schedule',
      likelihood: 3,
      impact: 4,
      mitigation: 'Start migration early in the sprint',
      contingency: 'Allocate buffer of 3 extra days',
      owner: 'alice',
      tags: ['auth', 'schedule'],
      relatedFeatures: [feat1.id],
    }) as any;
    expect(risk.severity).toBe(12); // 3 * 4
    expect(risk.status).toBe('identified');

    // -- List risks -------------------------------------------------------
    const risks = await callTool(client, 'list_risks', { projectName }) as any[];
    expect(risks.length).toBe(1);

    // -- Get risk ---------------------------------------------------------
    const gotRisk = await callTool(client, 'get_risk', { projectName, title: 'JWT-library-migration-delay' }) as any;
    expect(gotRisk.title).toBe('JWT-library-migration-delay');

    // -- Update risk ------------------------------------------------------
    const upRisk = await callTool(client, 'update_risk', {
      projectName,
      title: 'JWT-library-migration-delay',
      likelihood: 2,
      impact: 4,
      status: 'mitigating',
    }) as any;
    expect(upRisk.severity).toBe(8); // 2 * 4 recalculated
    expect(upRisk.status).toBe('mitigating');

    // -- Add milestone ----------------------------------------------------
    const milestone = await callTool(client, 'add_milestone', {
      projectName,
      name: 'Auth-MVP',
      description: 'Authentication system MVP with login, logout, and password reset',
      dueDate: '2026-07-15',
      featureIds: [feat1.id],
      planIds: [plan.id],
      taskIds: [task1.id, task2.id],
    }) as any;
    expect(milestone.name).toBe('Auth-MVP');
    expect(milestone.dueDate).toBe('2026-07-15');

    // -- List milestones --------------------------------------------------
    const milestones = await callTool(client, 'list_milestones', { projectName }) as any[];
    expect(milestones.length).toBe(1);

    // -- Update milestone -------------------------------------------------
    const upMilestone = await callTool(client, 'update_milestone', {
      projectName,
      name: 'Auth-MVP',
      status: 'in-progress',
      dueDate: '2026-07-20',
    }) as any;
    expect(upMilestone.status).toBe('in-progress');
    expect(upMilestone.dueDate).toBe('2026-07-20');

    // -- Get milestone ----------------------------------------------------
    const gotMilestone = await callTool(client, 'get_milestone', { projectName, name: 'Auth-MVP' }) as any;
    expect(gotMilestone.name).toBe('Auth-MVP');

    // -----------------------------------------------------------------------
    // Tags
    // -----------------------------------------------------------------------

    // -- Add tags -----------------------------------------------------------
    const tag1 = await callTool(client, 'add_tag', {
      projectName,
      name: 'security',
      color: '#ff0000',
      description: 'Security-related entities',
    }) as any;
    expect(tag1.name).toBe('security');
    expect(tag1.color).toBe('#ff0000');

    const tag2 = await callTool(client, 'add_tag', {
      projectName,
      name: 'frontend',
    }) as any;
    expect(tag2.name).toBe('frontend');
    expect(tag2.color).toMatch(/^#[0-9a-f]{6}$/); // Auto-generated

    // -- List tags ----------------------------------------------------------
    const tags = await callTool(client, 'list_tags', { projectName }) as any[];
    expect(tags.length).toBe(2);
    expect(tags.every((t: any) => typeof t.assignmentCount === 'number')).toBe(true);

    // -- Assign tags --------------------------------------------------------
    await callTool(client, 'assign_tag', {
      projectName,
      tagName: 'security',
      targetType: 'feature',
      targetId: feat1.id,
    });
    await callTool(client, 'assign_tag', {
      projectName,
      tagName: 'security',
      targetType: 'decision',
      targetId: decision.id,
    });

    // -- Search by tag ------------------------------------------------------
    const searchResults = await callTool(client, 'search_by_tag', {
      projectName,
      tagName: 'security',
    }) as any[];
    expect(searchResults.length).toBe(2);
    expect(searchResults.some((r: any) => r.targetId === feat1.id)).toBe(true);
    expect(searchResults.some((r: any) => r.targetId === decision.id)).toBe(true);

    // -- Unassign tag -------------------------------------------------------
    await callTool(client, 'unassign_tag', {
      projectName,
      tagName: 'security',
      targetType: 'feature',
      targetId: feat1.id,
    });
    const searchAfter = await callTool(client, 'search_by_tag', {
      projectName,
      tagName: 'security',
    }) as any[];
    expect(searchAfter.length).toBe(1);

    // -- Remove tag -------------------------------------------------------
    await callTool(client, 'remove_tag', { projectName, name: 'frontend' });
    const tagsAfter = await callTool(client, 'list_tags', { projectName }) as any[];
    expect(tagsAfter.length).toBe(1);

    // -----------------------------------------------------------------------
    // Project Activity
    // -----------------------------------------------------------------------
    const activity = await callTool(client, 'project_activity', { projectName }) as any[];
    expect(activity.length).toBeGreaterThan(10); // Many operations logged

    const featureActivity = await callTool(client, 'project_activity', {
      projectName,
      entityType: 'feature',
    }) as any[];
    expect(featureActivity.every((e: any) => e.entityType === 'feature')).toBe(true);

    const createdActivity = await callTool(client, 'project_activity', {
      projectName,
      action: 'created',
      limit: 5,
    }) as any[];
    expect(createdActivity.length).toBeLessThanOrEqual(5);
    expect(createdActivity.every((e: any) => e.action === 'created')).toBe(true);

    // -----------------------------------------------------------------------
    // Project Tree
    // -----------------------------------------------------------------------
    const tree = await callTool(client, 'get_project_tree', { projectName }) as any;
    expect(tree.projectName).toBe(projectName);
    expect(tree.entityCounts.features).toBe(2);
    expect(tree.entityCounts.tags).toBe(1); // after removal
    expect(tree.structure.features.length).toBe(2);
    expect(tree.structure.tasks.length).toBeGreaterThanOrEqual(4); // 2 created + 2 bulk

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------
    const searchHits = await callTool(client, 'search_project', {
      projectName,
      query: 'jwt',
    }) as any[];
    expect(searchHits.length).toBeGreaterThan(0);
    // "jwt" appears in the techspec name "jwt-auth-spec" and its description/details
    expect(searchHits.some((r: any) => r.type === 'techspec')).toBe(true);

    const noHits = await callTool(client, 'search_project', {
      projectName,
      query: 'nonexistent-term-xyz',
    }) as any[];
    expect(noHits.length).toBe(0);

    // -----------------------------------------------------------------------
    // Project Summary
    // -----------------------------------------------------------------------
    const summary = await callTool(client, 'project_summary', { projectName }) as any;
    expect(summary.featureCount).toBe(2);
    expect(summary.taskCount).toBeGreaterThanOrEqual(4);
    expect(summary.featuresByPriority.critical).toBe(1);
    expect(summary.featuresByPriority.high).toBe(1);

    // -----------------------------------------------------------------------
    // Dependency Graph
    // -----------------------------------------------------------------------
    const depGraph = await callTool(client, 'dependency_graph', {
      projectName,
      entityType: 'feature',
      entityName: 'user-auth',
      maxDepth: 1,
    }) as any;
    expect(depGraph.root.name).toBe('user-auth');
    expect(depGraph.root.type).toBe('feature');

    // -----------------------------------------------------------------------
    // Validate
    // -----------------------------------------------------------------------
    const issues = await callTool(client, 'validate_project', { projectName }) as any[];
    expect(issues.length).toBe(0);

    // -----------------------------------------------------------------------
    // Export
    // -----------------------------------------------------------------------
    const exported = await callTool(client, 'export_project', { projectName }) as any;
    expect(exported.exportVersion).toBe('1.0');
    expect(exported.features.length).toBe(2);
    expect(exported.tasks.length).toBeGreaterThanOrEqual(4);
    expect(exported.decisions.length).toBe(1);
    expect(exported.risks.length).toBe(1);
    expect(exported.milestones.length).toBe(1);
    expect(exported.tags.length).toBe(1);
    expect(exported.activityLog.length).toBeGreaterThan(10);

    // -----------------------------------------------------------------------
    // Import
    // -----------------------------------------------------------------------
    // Delete the original project first
    await callTool(client, 'delete_project', { projectName });

    const imported = await callTool(client, 'import_project', {
      projectExport: exported,
      importAs: 'ImportedProject',
    }) as any;
    expect(imported.name).toBe('ImportedProject');

    // Verify imported data
    const importedFeatures = await callTool(client, 'list_features', { projectName: 'ImportedProject' }) as any[];
    expect(importedFeatures.length).toBe(2);
    expect(importedFeatures.some((f: any) => f.name === 'user-auth')).toBe(true);

    // -----------------------------------------------------------------------
    // Archive / Unarchive
    // -----------------------------------------------------------------------
    const archived = await callTool(client, 'archive_project', { projectName: 'ImportedProject' }) as any;
    expect(archived.status).toBe('archived');

    const unarchived = await callTool(client, 'unarchive_project', { projectName: 'ImportedProject' }) as any;
    expect(unarchived.status).toBe('active');

    // -----------------------------------------------------------------------
    // Markdown Export
    // -----------------------------------------------------------------------
    const md = await callToolText(client, 'export_markdown', { projectName: 'ImportedProject' });
    expect(md).toContain('ImportedProject');
    expect(md).toContain('## Features');
    expect(md).toContain('user-auth');
    expect(md).toContain('## Tasks');

    // -----------------------------------------------------------------------
    // Template
    // -----------------------------------------------------------------------
    const templated = await callTool(client, 'template_project', {
      sourceProjectName: 'ImportedProject',
      newProjectName: 'TemplatedProject',
      newDescription: 'Cloned from ImportedProject',
      copyTasks: true,
    }) as any;
    expect(templated.name).toBe('TemplatedProject');
    expect(templated.description).toBe('Cloned from ImportedProject');

    const templateFeatures = await callTool(client, 'list_features', { projectName: 'TemplatedProject' }) as any[];
    expect(templateFeatures.length).toBe(2);

    const templateTasks = await callTool(client, 'list_tasks', { projectName: 'TemplatedProject' }) as any[];
    expect(templateTasks.length).toBeGreaterThanOrEqual(4);

    // -----------------------------------------------------------------------
    // Delete project (cleanup)
    // -----------------------------------------------------------------------
    for (const name of ['ImportedProject', 'TemplatedProject']) {
      await callTool(client, 'delete_project', { projectName: name });
      await expect(
        callTool(client, 'get_project', { projectName: name })
      ).rejects.toThrow();
    }
  }, 60_000); // generous timeout for this long lifecycle test

  // -----------------------------------------------------------------------
  // 3. Error Handling
  // -----------------------------------------------------------------------
  it('should return proper MCP errors for invalid inputs', async () => {
    ({ client, cleanup: cleanupFn } = await createTestClient());

    // Missing required argument
    await expect(
      callTool(client, 'create_project', {})
    ).rejects.toThrow();

    // Duplicate project
    await callTool(client, 'create_project', { name: 'DuplicateTest', description: '' });
    await expect(
      callTool(client, 'create_project', { name: 'DuplicateTest', description: '' })
    ).rejects.toThrow();

    // Get nonexistent project
    await expect(
      callTool(client, 'get_project', { projectName: 'nonexistent' })
    ).rejects.toThrow();

    // Invalid enum value
    await expect(
      callTool(client, 'add_feature', {
        projectName: 'DuplicateTest',
        name: 'f1',
        description: 'test',
        priority: 'invalid_priority',
      })
    ).rejects.toThrow();

    // Feature with empty name
    await expect(
      callTool(client, 'add_feature', {
        projectName: 'DuplicateTest',
        name: '',
        description: 'test',
      })
    ).rejects.toThrow();

    // Delete nonexistent feature
    await expect(
      callTool(client, 'delete_feature', {
        projectName: 'DuplicateTest',
        featureName: 'nonexistent',
      })
    ).rejects.toThrow();

    // Risk with out-of-range likelihood
    await expect(
      callTool(client, 'add_risk', {
        projectName: 'DuplicateTest',
        title: 'bad-risk',
        description: 'test',
        category: 'technical',
        likelihood: 0,
        impact: 3,
      })
    ).rejects.toThrow();

    // Risk with out-of-range impact
    await expect(
      callTool(client, 'add_risk', {
        projectName: 'DuplicateTest',
        title: 'bad-risk-2',
        description: 'test',
        category: 'technical',
        likelihood: 3,
        impact: 6,
      })
    ).rejects.toThrow();

    // Assign tag to nonexistent entity
    await expect(
      callTool(client, 'assign_tag', {
        projectName: 'DuplicateTest',
        tagName: 'nonexistent-tag',
        targetType: 'feature',
        targetId: 'nope',
      })
    ).rejects.toThrow();

    // Unknown tool name — the server throws MethodNotFound which the
    // client receives as an error
    await expect(
      client.callTool({ name: 'this_tool_does_not_exist', arguments: {} })
    ).rejects.toThrow(/Unknown tool|not found/i);
  });

  // -----------------------------------------------------------------------
  // 4. Stress: Multiple Projects
  // -----------------------------------------------------------------------
  it('should handle multiple independent projects simultaneously', async () => {
    ({ client, cleanup: cleanupFn } = await createTestClient());

    const projectNames = ['Alpha', 'Beta', 'Gamma'];
    for (const name of projectNames) {
      await callTool(client, 'create_project', { name, description: `Project ${name}` });
    }

    // Add features to each
    for (const name of projectNames) {
      await callTool(client, 'add_feature', { projectName: name, name: `${name}-feat`, description: `Feature for ${name}` });
    }

    // Verify isolation
    for (const name of projectNames) {
      const features = await callTool(client, 'list_features', { projectName: name }) as any[];
      expect(features.length).toBe(1);
      expect(features[0].name).toBe(`${name}-feat`);
    }

    // Cleanup
    for (const name of projectNames) {
      await callTool(client, 'delete_project', { projectName: name });
      await expect(
        callTool(client, 'get_project', { projectName: name })
      ).rejects.toThrow();
    }
  });
});