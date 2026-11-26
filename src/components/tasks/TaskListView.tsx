import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Filter,
  Inbox,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createTask,
  deleteTask,
  toggleCompleteTask,
  updateTask,
} from '../../db/database';
import {
  AppSettings,
  Project,
  Task,
  TaskFilterState,
  TaskPriority,
  TaskStatus,
} from '../../types/models';
import {
  PRIORITY_META,
  PRIORITY_OPTIONS,
  STATUS_META,
  STATUS_OPTIONS,
} from '../../utils/constants';
import {
  formatPlannedDate,
  getDdlUrgency,
  isTaskUnscheduled,
  toLocalDateString,
} from '../../utils/dateUtils';
import {
  DEFAULT_FILTERS,
  filterTasks,
  sortTasks,
  TaskSortField,
} from '../../utils/taskFilters';
import { DdlBadge, ProjectLabel } from '../common/Badges';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DeferModal } from './DeferModal';

interface TaskListViewProps {
  tasks: Task[];
  projects: Project[];
  settings: AppSettings;
  filters: TaskFilterState;
  onChangeFilters: (next: TaskFilterState) => void;
  onSelectTask: (taskId: string) => void;
  onOpenNewTaskModal: () => void;
}

type GroupByMode = 'none' | 'status' | 'priority' | 'project' | 'date';

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  projects,
  settings,
  filters,
  onChangeFilters,
  onSelectTask,
  onOpenNewTaskModal,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');
  const [sortBy, setSortBy] = useState<TaskSortField>('ddl');
  const [deferTarget, setDeferTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [progressEditId, setProgressEditId] = useState<string | null>(null);

  const todayStr = toLocalDateString();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => s.add(tag)));
    return Array.from(s).sort();
  }, [tasks]);

  const filteredAndSorted = useMemo(() => {
    const list = filterTasks(tasks, filters, projects, todayStr);
    return sortTasks(list, sortBy, projects);
  }, [tasks, filters, projects, todayStr, sortBy]);

  const unscheduledTasks = useMemo(
    () => filteredAndSorted.filter((t) => isTaskUnscheduled(t)),
    [filteredAndSorted]
  );

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', title: `全部符合条件 (${filteredAndSorted.length})`, items: filteredAndSorted }];
    }

    const map = new Map<string, { title: string; items: Task[] }>();

    if (groupBy === 'status') {
      STATUS_OPTIONS.forEach((st) => map.set(st, { title: STATUS_META[st].label, items: [] }));
      filteredAndSorted.forEach((t) => map.get(t.status)?.items.push(t));
    } else if (groupBy === 'priority') {
      PRIORITY_OPTIONS.forEach((p) =>
        map.set(p, { title: `${p} · ${PRIORITY_META[p].label}`, items: [] })
      );
      filteredAndSorted.forEach((t) => map.get(t.priority)?.items.push(t));
    } else if (groupBy === 'project') {
      projects.forEach((p) => map.set(p.id, { title: p.name, items: [] }));
      map.set('unassigned', { title: '未归类项目', items: [] });
      filteredAndSorted.forEach((t) => {
        const key = t.projectId && map.has(t.projectId) ? t.projectId : 'unassigned';
        map.get(key)!.items.push(t);
      });
    } else if (groupBy === 'date') {
      map.set('overdue', { title: '已逾期', items: [] });
      map.set('today', { title: '今天截止', items: [] });
      map.set('upcoming', { title: '未来计划', items: [] });
      map.set('no_ddl', { title: '未设置 DDL', items: [] });
      map.set('completed', { title: '已完成', items: [] });
      filteredAndSorted.forEach((t) => {
        if (t.status === 'completed') map.get('completed')!.items.push(t);
        else if (!t.plannedEndDate) map.get('no_ddl')!.items.push(t);
        else if (t.plannedEndDate < todayStr) map.get('overdue')!.items.push(t);
        else if (t.plannedEndDate === todayStr) map.get('today')!.items.push(t);
        else map.get('upcoming')!.items.push(t);
      });
    }

    return Array.from(map.entries())
      .filter(([, g]) => g.items.length > 0)
      .map(([key, g]) => ({ key, title: `${g.title} (${g.items.length})`, items: g.items }));
  }, [filteredAndSorted, groupBy, projects, todayStr]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.status !== 'all') c++;
    if (filters.priority !== 'all') c++;
    if (filters.projectId !== 'all') c++;
    if (filters.tag !== 'all') c++;
    if (filters.overdueOnly) c++;
    if (filters.unscheduledOnly) c++;
    if (filters.completedFilter !== 'all') c++;
    if (filters.dateFrom || filters.dateTo) c++;
    return c;
  }, [filters]);

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    await createTask({
      title: quickTitle.trim(),
      projectId:
        filters.projectId !== 'all' && filters.projectId !== 'unassigned'
          ? filters.projectId
          : null,
    });
    setQuickTitle('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">任务列表</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            共 {tasks.length} 项 · 当前匹配 {filteredAndSorted.length} 项
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNewTaskModal}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>新建任务</span>
        </button>
      </div>

      {/* Quick Add */}
      <form
        onSubmit={handleQuickCreate}
        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5"
      >
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="快速添加任务名称..."
          className="flex-1 min-h-[40px] bg-transparent px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!quickTitle.trim()}
          className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
        >
          添加
        </button>
      </form>

      {/* Search & Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
            placeholder="搜索任务名称、描述、项目或标签..."
            className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
            aria-label="分组方式"
            className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <option value="none">不分组</option>
            <option value="status">按状态分组</option>
            <option value="priority">按优先级分组</option>
            <option value="project">按项目分组</option>
            <option value="date">按日期分组</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TaskSortField)}
            aria-label="排序方式"
            className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <option value="ddl">按 DDL 排序</option>
            <option value="priority">按优先级排序</option>
            <option value="status">按状态排序</option>
            <option value="updated">按最近更新</option>
          </select>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`min-h-[42px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              showFilters || activeFilterCount > 0
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Multi-Condition Filter Panel */}
      {showFilters && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <select
              value={filters.status}
              onChange={(e) =>
                onChangeFilters({ ...filters, status: e.target.value as TaskFilterState['status'] })
              }
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
            >
              <option value="all">全部状态</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {STATUS_META[st].label}
                </option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  priority: e.target.value as TaskFilterState['priority'],
                })
              }
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
            >
              <option value="all">全部优先级</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p} · {PRIORITY_META[p].label}
                </option>
              ))}
            </select>

            <select
              value={filters.projectId}
              onChange={(e) => onChangeFilters({ ...filters, projectId: e.target.value })}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
            >
              <option value="all">全部项目</option>
              <option value="unassigned">未归类项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={filters.tag}
              onChange={(e) => onChangeFilters({ ...filters, tag: e.target.value })}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
            >
              <option value="all">全部标签</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>

            <select
              value={filters.completedFilter}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  completedFilter: e.target.value as TaskFilterState['completedFilter'],
                })
              }
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
            >
              <option value="all">完成状态：全部</option>
              <option value="active">仅未完成</option>
              <option value="completed">仅已完成</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 shrink-0">日期范围：</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChangeFilters({ ...filters, dateFrom: e.target.value })}
                className="flex-1 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChangeFilters({ ...filters, dateTo: e.target.value })}
                className="flex-1 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={filters.overdueOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, overdueOnly: e.target.checked })
                    }
                    className="rounded accent-rose-600"
                  />
                  <span>仅逾期</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={filters.unscheduledOnly}
                    onChange={(e) =>
                      onChangeFilters({ ...filters, unscheduledOnly: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  <span>仅未排期</span>
                </label>
              </div>

              {(activeFilterCount > 0 || filters.search) && (
                <button
                  type="button"
                  onClick={() => onChangeFilters(DEFAULT_FILTERS)}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>清空筛选</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task Groups / List */}
      {groupedSections.length === 0 || filteredAndSorted.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-12 px-4 text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            没有符合当前条件的任务。
          </p>
          <button
            type="button"
            onClick={onOpenNewTaskModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>新建任务</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedSections.map((group) => (
            <section
              key={group.key}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {group.title}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((task) => {
                  const proj = task.projectId ? projectMap.get(task.projectId) : undefined;
                  const urgency = getDdlUrgency(task, todayStr);
                  const priorityMeta = PRIORITY_META[task.priority];
                  const statusMeta = STATUS_META[task.status];
                  const isEditingProg = progressEditId === task.id;

                  return (
                    <div key={task.id} className="p-4 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleCompleteTask(task.id)}
                          className={`mt-0.5 w-6 h-6 min-w-[24px] rounded-lg border flex items-center justify-center transition-colors ${
                            task.status === 'completed'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:border-blue-500'
                          }`}
                          aria-label={task.status === 'completed' ? '重新打开' : '标记完成'}
                        >
                          {task.status === 'completed' && <Check className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectTask(task.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm font-medium leading-snug ${
                                task.status === 'completed'
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </span>
                            <DdlBadge urgency={urgency} />
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            {proj && <ProjectLabel project={proj} />}
                            {(task.plannedStartDate || task.plannedEndDate) && (
                              <span className="font-mono-num">
                                {task.plannedStartDate
                                  ? formatPlannedDate(task.plannedStartDate, settings.dateFormat, todayStr)
                                  : '未设开始'}
                                {' → '}
                                {task.plannedEndDate
                                  ? formatPlannedDate(task.plannedEndDate, settings.dateFormat, todayStr)
                                  : '未设DDL'}
                              </span>
                            )}
                            {task.tags.length > 0 && (
                              <span className="text-slate-400">
                                {task.tags.map((t) => `#${t}`).join(' ')}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>

                      {/* Quick Inline Action Row */}
                      <div className="pl-9 flex flex-wrap items-center gap-2">
                        <select
                          value={task.status}
                          onChange={(e) =>
                            updateTask(task.id, { status: e.target.value as TaskStatus })
                          }
                          aria-label="快速修改状态"
                          className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium ${statusMeta.bgClass} ${statusMeta.textClass} ${statusMeta.borderClass}`}
                        >
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {STATUS_META[st].label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={task.priority}
                          onChange={(e) =>
                            updateTask(task.id, { priority: e.target.value as TaskPriority })
                          }
                          aria-label="快速修改优先级"
                          className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium ${priorityMeta.bgClass} ${priorityMeta.textClass} ${priorityMeta.borderClass}`}
                        >
                          {PRIORITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p} · {PRIORITY_META[p].shortLabel}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            setProgressEditId(isEditingProg ? null : task.id)
                          }
                          className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-mono-num text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          进度 {task.progress}%
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeferTarget(task)}
                          className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                        >
                          <CalendarClock className="w-3 h-3" />
                          <span>延期</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(task)}
                          className="ml-auto min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          aria-label="删除任务"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isEditingProg && (
                        <div className="pl-9 pt-1 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={task.progress}
                            onChange={(e) =>
                              updateTask(task.id, { progress: Number(e.target.value) })
                            }
                            className="flex-1 accent-blue-600"
                          />
                          {[0, 50, 100].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => updateTask(task.id, { progress: v })}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-mono-num"
                            >
                              {v}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Dedicated Unscheduled Tasks Section */}
      {!filters.unscheduledOnly && unscheduledTasks.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Inbox className="w-4 h-4 text-slate-500" />
            <span>未排期或日期不完整任务 ({unscheduledTasks.length})</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {unscheduledTasks.map((task) => (
              <div
                key={`unsched-${task.id}`}
                className="px-4 py-2.5 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onSelectTask(task.id)}
                  className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate text-left flex-1"
                >
                  {task.title}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTask(task.id)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                >
                  补充计划日期
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <DeferModal
        open={!!deferTarget}
        task={deferTarget}
        settings={settings}
        onClose={() => setDeferTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除任务？"
        description={
          deleteTarget
            ? `将删除「${deleteTarget.title}」及其全部进度历史、活动节点和日期修改记录。`
            : ''
        }
        confirmLabel="确认删除"
        danger
        onConfirm={async () => {
          if (deleteTarget) await deleteTask(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
