import { Project, Task, TaskFilterState } from '../types/models';
import { PRIORITY_META, STATUS_OPTIONS } from './constants';
import { isTaskOverdue, isTaskUnscheduled, toLocalDateString } from './dateUtils';

export const DEFAULT_FILTERS: TaskFilterState = {
  search: '',
  status: 'all',
  priority: 'all',
  projectId: 'all',
  tag: 'all',
  overdueOnly: false,
  unscheduledOnly: false,
  completedFilter: 'all',
  dateFrom: '',
  dateTo: '',
};

export type TaskSortField = 'ddl' | 'start' | 'priority' | 'status' | 'project' | 'updated';

export function filterTasks(
  tasks: Task[],
  filters: TaskFilterState,
  projects: Project[],
  todayStr: string = toLocalDateString()
): Task[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const query = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (query) {
      const projName = task.projectId ? (projectMap.get(task.projectId)?.name ?? '') : '';
      const haystack = `${task.title} ${task.description} ${projName} ${task.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;

    if (filters.projectId === 'unassigned') {
      if (task.projectId !== null) return false;
    } else if (filters.projectId !== 'all') {
      if (task.projectId !== filters.projectId) return false;
    }

    if (filters.tag !== 'all' && !task.tags.includes(filters.tag)) return false;

    if (filters.overdueOnly && !isTaskOverdue(task, todayStr)) return false;
    if (filters.unscheduledOnly && !isTaskUnscheduled(task)) return false;

    if (filters.completedFilter === 'completed' && task.status !== 'completed') return false;
    if (filters.completedFilter === 'active' && task.status === 'completed') return false;

    if (filters.dateFrom) {
      const target = task.plannedEndDate || task.plannedStartDate;
      if (!target || target < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      const target = task.plannedStartDate || task.plannedEndDate;
      if (!target || target > filters.dateTo) return false;
    }

    return true;
  });
}

export function sortTasks(
  tasks: Task[],
  sortBy: TaskSortField,
  projects: Project[]
): Task[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  return [...tasks].sort((a, b) => {
    if (sortBy === 'priority') {
      const diff = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
      if (diff !== 0) return diff;
    }
    if (sortBy === 'ddl') {
      const da = a.plannedEndDate ?? '9999-12-31';
      const db = b.plannedEndDate ?? '9999-12-31';
      if (da !== db) return da.localeCompare(db);
    }
    if (sortBy === 'start') {
      const sa = a.plannedStartDate ?? '9999-12-31';
      const sb = b.plannedStartDate ?? '9999-12-31';
      if (sa !== sb) return sa.localeCompare(sb);
    }
    if (sortBy === 'status') {
      const idxA = STATUS_OPTIONS.indexOf(a.status);
      const idxB = STATUS_OPTIONS.indexOf(b.status);
      if (idxA !== idxB) return idxA - idxB;
    }
    if (sortBy === 'project') {
      const pa = a.projectId ? (projectMap.get(a.projectId)?.name ?? 'zzz') : 'zzz';
      const pb = b.projectId ? (projectMap.get(b.projectId)?.name ?? 'zzz') : 'zzz';
      const cmp = pa.localeCompare(pb, 'zh-CN');
      if (cmp !== 0) return cmp;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
