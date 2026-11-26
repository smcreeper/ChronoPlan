export type TaskPriority = 'P1' | 'P2' | 'P3' | 'P4';

export type TaskStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';

export type ProjectStatus = 'active' | 'completed' | 'paused' | 'archived';

export type TimelineScale = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ThemeMode = 'light' | 'dark' | 'system';

export type DateFormatOption = 'zh' | 'iso' | 'slash';

export type TimeFormatOption = '24h' | '12h';

export type WeekStartOption = 1 | 0; // 1 = Monday, 0 = Sunday

export type NavTab = 'dashboard' | 'timeline' | 'tasks' | 'projects' | 'settings';

export type DdlUrgency =
  | 'completed'
  | 'overdue'
  | 'due_today'
  | 'due_3d'
  | 'due_7d'
  | 'upcoming'
  | 'none';

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  plannedStartDate: string | null; // YYYY-MM-DD
  plannedEndDate: string | null; // YYYY-MM-DD (DDL)
  originalStartDate: string | null; // Preserved first plannedStartDate
  originalEndDate: string | null; // Preserved first plannedEndDate (original DDL)
  priority: TaskPriority;
  status: TaskStatus;
  progress: number; // 0 - 100
  tags: string[];
  notes: string;
  createdAt: string; // ISO 8601 local/UTC instant
  updatedAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601 actual completion timestamp
  // Associated record IDs (also indexed in dedicated Dexie stores)
  progressHistoryIds?: string[];
  activityHistoryIds?: string[];
  scheduleHistoryIds?: string[];
}

export interface ProgressLog {
  id: string;
  taskId: string;
  progress: number; // 0 - 100
  note: string;
  loggedAt: string; // ISO 8601 actual log time
  createdAt: string;
  updatedAt: string;
}

export interface ActivityNode {
  id: string;
  taskId: string;
  title: string;
  description: string;
  eventAt: string; // ISO 8601 actual event occurrence time
  createdAt: string;
  updatedAt: string;
  systemType?: 'completed' | 'reopened';
}

export interface ScheduleLog {
  id: string;
  taskId: string;
  oldStartDate: string | null;
  newStartDate: string | null;
  oldEndDate: string | null;
  newEndDate: string | null;
  changedAt: string; // ISO 8601 actual modification time
  reason: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string; // Hex color from distinct project palette
  status: ProjectStatus;
  progressMode: 'auto' | 'manual';
  manualProgress: number; // 0 - 100
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: string; // 'default'
  theme: ThemeMode;
  dateFormat: DateFormatOption;
  timeFormat: TimeFormatOption;
  weekStartsOn: WeekStartOption;
  defaultTimelineScale: TimelineScale;
  updatedAt: string;
}

export interface AppMeta {
  key: string;
  value: string;
}

export interface ExportBundle {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: {
    tasks: Task[];
    projects: Project[];
    progressLogs: ProgressLog[];
    activityNodes: ActivityNode[];
    scheduleLogs: ScheduleLog[];
    settings: AppSettings | null;
  };
}

export interface TaskFilterState {
  search: string;
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  projectId: string | 'all' | 'unassigned';
  tag: string | 'all';
  overdueOnly: boolean;
  unscheduledOnly: boolean;
  completedFilter: 'all' | 'active' | 'completed';
  dateFrom: string;
  dateTo: string;
}
