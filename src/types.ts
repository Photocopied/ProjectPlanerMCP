// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'proposed' | 'approved' | 'in-progress' | 'completed' | 'cancelled';
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TechSpec {
  id: string;
  name: string;
  description: string;
  featureId: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSession {
  id: string;
  sessionName: string;
  query: string;
  findings: string;
  conclusions: string;
  sources: string[];
  createdAt: string;
}

export interface Plan {
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

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
  dependencies: string[];
  planId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  options: string[];
  decision: string;
  rationale: string;
  consequences: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  supersededBy: string;
  tags: string[];
  relatedFeatures: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  title: string;
  description: string;
  category: 'technical' | 'schedule' | 'people' | 'external' | 'budget' | 'other';
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  severity: number;
  status: 'identified' | 'mitigating' | 'materialized' | 'closed';
  mitigation: string;
  contingency: string;
  owner: string;
  tags: string[];
  relatedFeatures: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string;
  createdAt: string;
}

export interface TagAssignment {
  tagId: string;
  targetType: 'feature' | 'techspec' | 'research' | 'plan' | 'task' | 'decision' | 'risk' | 'milestone';
  targetId: string;
}

export interface ActivityLogEntry {
  id: string;
  entityType: 'project' | 'feature' | 'techspec' | 'research' | 'plan' | 'task' | 'decision' | 'risk' | 'tag' | 'milestone';
  entityId: string;
  entityName: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'reassigned' | 'tagged' | 'untagged';
  details: string;
  timestamp: string;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  dueDate: string;
  status: 'planned' | 'in-progress' | 'completed' | 'overdue';
  featureIds: string[];
  planIds: string[];
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExport {
  exportVersion: string;
  exportedAt: string;
  sourceHost: string;
  project: ProjectMeta;
  features: Feature[];
  techSpecs: TechSpec[];
  research: ResearchSession[];
  plans: Plan[];
  tasks: Task[];
  decisions: Decision[];
  risks: Risk[];
  milestones: Milestone[];
  tags: Tag[];
  tagAssignments: TagAssignment[];
  activityLog: ActivityLogEntry[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'feature' | 'task';
  status: string;
  dependsOn: string[];
  dependedBy: string[];
}

export interface ProjectSummary {
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
  decisionCount: number;
  decisionsByStatus: Record<string, number>;
  riskCount: number;
  risksBySeverity: Record<string, number>;
  risksByCategory: Record<string, number>;
  milestoneCount: number;
  milestonesByStatus: Record<string, number>;
  tagCount: number;
}

export interface ProjectTreeEntry {
  name: string;
  id: string;
  status?: string;
  title?: string;
}

export interface ProjectTree {
  projectName: string;
  structure: {
    features: ProjectTreeEntry[];
    techSpecs: ProjectTreeEntry[];
    research: ProjectTreeEntry[];
    plans: ProjectTreeEntry[];
    tasks: ProjectTreeEntry[];
    decisions: ProjectTreeEntry[];
    risks: ProjectTreeEntry[];
    milestones: ProjectTreeEntry[];
    tags: { count: number };
    activity: { count: number };
  };
  entityCounts: Record<string, number>;
}

export interface SearchResult {
  type: string;
  id: string;
  name: string;
  filePath: string;
  matchContext: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  entityType: string;
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}