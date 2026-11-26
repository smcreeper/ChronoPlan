import { DdlUrgency, ProjectStatus, TaskPriority, TaskStatus } from '../types/models';

export const APP_VERSION = '1.0.0';
export const EXPORT_SCHEMA_VERSION = 1;

export interface PriorityMeta {
  value: TaskPriority;
  label: string;
  shortLabel: string;
  rank: number;
  textClass: string;
  bgClass: string;
  borderClass: string;
  barClass: string;
  dotColor: string;
}

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  P1: {
    value: 'P1',
    label: '高优先级',
    shortLabel: '高',
    rank: 1,
    textClass: 'text-rose-700 dark:text-rose-300',
    bgClass: 'bg-rose-50/90 dark:bg-rose-950/45',
    borderClass: 'border-rose-200/90 dark:border-rose-900/70',
    barClass: 'bg-rose-500/20 border-rose-400/70 text-rose-950 dark:bg-rose-500/25 dark:border-rose-500/60 dark:text-rose-100',
    dotColor: '#E11D48',
  },
  P2: {
    value: 'P2',
    label: '中优先级',
    shortLabel: '中',
    rank: 2,
    textClass: 'text-amber-700 dark:text-amber-300',
    bgClass: 'bg-amber-50/90 dark:bg-amber-950/40',
    borderClass: 'border-amber-200/90 dark:border-amber-900/70',
    barClass: 'bg-amber-500/20 border-amber-400/70 text-amber-950 dark:bg-amber-500/25 dark:border-amber-500/60 dark:text-amber-100',
    dotColor: '#D97706',
  },
  P3: {
    value: 'P3',
    label: '低优先级',
    shortLabel: '低',
    rank: 3,
    textClass: 'text-sky-700 dark:text-sky-300',
    bgClass: 'bg-sky-50/90 dark:bg-sky-950/40',
    borderClass: 'border-sky-200/90 dark:border-sky-900/70',
    barClass: 'bg-sky-500/20 border-sky-400/70 text-sky-950 dark:bg-sky-500/25 dark:border-sky-500/60 dark:text-sky-100',
    dotColor: '#0284C7',
  },
  P4: {
    value: 'P4',
    label: '无优先级',
    shortLabel: '无',
    rank: 4,
    textClass: 'text-slate-600 dark:text-slate-400',
    bgClass: 'bg-slate-100/90 dark:bg-slate-800/70',
    borderClass: 'border-slate-200 dark:border-slate-700',
    barClass: 'bg-slate-500/15 border-slate-300 dark:bg-slate-700/50 dark:border-slate-600 text-slate-900 dark:text-slate-100',
    dotColor: '#64748B',
  },
};

export const PRIORITY_OPTIONS: TaskPriority[] = ['P1', 'P2', 'P3', 'P4'];

export interface StatusMeta {
  value: TaskStatus;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  accentHex: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  not_started: {
    value: 'not_started',
    label: '未开始',
    textClass: 'text-slate-600 dark:text-slate-400',
    bgClass: 'bg-slate-100/80 dark:bg-slate-800/70',
    borderClass: 'border-slate-200 dark:border-slate-700',
    accentHex: '#64748B',
  },
  in_progress: {
    value: 'in_progress',
    label: '进行中',
    textClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-50/90 dark:bg-blue-950/45',
    borderClass: 'border-blue-200/90 dark:border-blue-900/70',
    accentHex: '#2563EB',
  },
  paused: {
    value: 'paused',
    label: '暂停',
    textClass: 'text-yellow-700 dark:text-yellow-300',
    bgClass: 'bg-yellow-50/90 dark:bg-yellow-950/40',
    borderClass: 'border-yellow-200/90 dark:border-yellow-900/70',
    accentHex: '#CA8A04',
  },
  completed: {
    value: 'completed',
    label: '已完成',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-50/90 dark:bg-emerald-950/40',
    borderClass: 'border-emerald-200/90 dark:border-emerald-900/70',
    accentHex: '#16A34A',
  },
};

export const STATUS_OPTIONS: TaskStatus[] = ['not_started', 'in_progress', 'paused', 'completed'];

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; textClass: string }> = {
  active: { label: '进行中', textClass: 'text-blue-700 dark:text-blue-300' },
  completed: { label: '已完成', textClass: 'text-emerald-700 dark:text-emerald-300' },
  paused: { label: '暂停', textClass: 'text-yellow-700 dark:text-yellow-300' },
  archived: { label: '归档', textClass: 'text-slate-500 dark:text-slate-400' },
};

// Distinct muted palette for projects (strictly separated from P1 red, P2 amber, P3 sky, P4 slate)
export const PROJECT_COLORS = [
  { name: '靛青', hex: '#4F46E5' },
  { name: '松石绿', hex: '#0D9488' },
  { name: '梅紫', hex: '#9333EA' },
  { name: '森林绿', hex: '#059669' },
  { name: '湖蓝', hex: '#0891B2' },
  { name: '暮紫', hex: '#7C3AED' },
  { name: '黛青', hex: '#334155' },
  { name: '绛紫', hex: '#BE185D' },
];

export const DDL_URGENCY_META: Record<
  DdlUrgency,
  { label: string; textClass: string; showBadge: boolean }
> = {
  overdue: {
    label: '已逾期',
    textClass: 'text-rose-700 dark:text-rose-400',
    showBadge: true,
  },
  due_today: {
    label: '今天截止',
    textClass: 'text-amber-700 dark:text-amber-400',
    showBadge: true,
  },
  due_3d: {
    label: '3天内截止',
    textClass: 'text-yellow-700 dark:text-yellow-400',
    showBadge: true,
  },
  due_7d: {
    label: '7天内截止',
    textClass: 'text-sky-700 dark:text-sky-400',
    showBadge: true,
  },
  upcoming: {
    label: '未到期',
    textClass: 'text-slate-500 dark:text-slate-400',
    showBadge: false,
  },
  completed: {
    label: '已完成',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    showBadge: false,
  },
  none: {
    label: '无DDL',
    textClass: 'text-slate-400 dark:text-slate-500',
    showBadge: false,
  },
};
