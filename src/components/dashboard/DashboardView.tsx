import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock,
  Cloud,
  FolderKanban,
  LogIn,
  Plus,
  TrendingUp,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { createTask, toggleCompleteTask } from '../../db/database';
import {
  ActivityNode,
  AppSettings,
  ProgressLog,
  Project,
  Task,
} from '../../types/models';
import { PRIORITY_META } from '../../utils/constants';
import {
  diffLocalDays,
  formatPlannedDate,
  formatTimestamp,
  getDdlUrgency,
  isTaskOverdue,
  toLocalDateString,
} from '../../utils/dateUtils';
import { DdlBadge, PriorityLabel, ProjectLabel } from '../common/Badges';

interface DashboardViewProps {
  tasks: Task[];
  projects: Project[];
  progressLogs: ProgressLog[];
  activityNodes: ActivityNode[];
  settings: AppSettings;
  cloudUser: User | null;
  onSignIn: () => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onOpenNewTaskModal: () => void;
  onNavigateTasks: (preset: 'overdue' | 'today' | 'all') => void;
  onNavigateProjects: (projectId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  projects,
  progressLogs,
  activityNodes,
  settings,
  cloudUser,
  onSignIn,
  onSelectTask,
  onOpenNewTaskModal,
  onNavigateTasks,
  onNavigateProjects,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [addingQuick, setAddingQuick] = useState(false);

  const todayStr = toLocalDateString();
  const nowDate = new Date();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Metrics
  const todayTasksCount = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === 'completed') return false;
      const startOk = !t.plannedStartDate || t.plannedStartDate <= todayStr;
      const endOk = !t.plannedEndDate || t.plannedEndDate >= todayStr;
      return (t.plannedStartDate || t.plannedEndDate) && startOk && endOk;
    }).length;
  }, [tasks, todayStr]);

  const dueTodayCount = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.plannedEndDate === todayStr).length,
    [tasks, todayStr]
  );

  const completedTodayCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status === 'completed' &&
          t.completedAt &&
          toLocalDateString(new Date(t.completedAt)) === todayStr
      ).length,
    [tasks, todayStr]
  );

  const overdueTasks = useMemo(
    () =>
      tasks
        .filter((t) => isTaskOverdue(t, todayStr))
        .sort((a, b) => (a.plannedEndDate ?? '').localeCompare(b.plannedEndDate ?? '')),
    [tasks, todayStr]
  );

  const dueSoonTasks = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.status === 'completed' || !t.plannedEndDate) return false;
          const diff = diffLocalDays(todayStr, t.plannedEndDate);
          return diff >= 0 && diff <= 7;
        })
        .sort((a, b) => (a.plannedEndDate ?? '').localeCompare(b.plannedEndDate ?? '')),
    [tasks, todayStr]
  );

  const inProgressTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'in_progress')
        .sort((a, b) => {
          const pDiff = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
          if (pDiff !== 0) return pDiff;
          return (a.plannedEndDate ?? '9999-12-31').localeCompare(b.plannedEndDate ?? '9999-12-31');
        }),
    [tasks]
  );

  // Today's activity feed (activity nodes + progress logs recorded today)
  const todayFeed = useMemo(() => {
    const items: Array<{
      id: string;
      kind: 'activity' | 'progress';
      taskId: string;
      taskTitle: string;
      title: string;
      subtitle: string;
      at: string;
    }> = [];

    for (const node of activityNodes) {
      if (toLocalDateString(new Date(node.eventAt)) === todayStr) {
        items.push({
          id: node.id,
          kind: 'activity',
          taskId: node.taskId,
          taskTitle: taskMap.get(node.taskId)?.title ?? '已删除任务',
          title: node.title,
          subtitle: node.description,
          at: node.eventAt,
        });
      }
    }

    for (const log of progressLogs) {
      if (toLocalDateString(new Date(log.loggedAt)) === todayStr) {
        items.push({
          id: log.id,
          kind: 'progress',
          taskId: log.taskId,
          taskTitle: taskMap.get(log.taskId)?.title ?? '已删除任务',
          title: `进度更新至 ${log.progress}%`,
          subtitle: log.note,
          at: log.loggedAt,
        });
      }
    }

    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [activityNodes, progressLogs, todayStr, taskMap]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status !== 'archived'),
    [projects]
  );

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || addingQuick) return;
    setAddingQuick(true);
    try {
      await createTask({ title: quickTitle.trim() });
      setQuickTitle('');
    } finally {
      setAddingQuick(false);
    }
  };

  const weekdayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][nowDate.getDay()];

  return (
    <div className="space-y-6">
      {!cloudUser && (
        <div className="rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-blue-900 dark:text-blue-200">
            <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              当前为本地浏览器存储；登录 Google 账号后，每次打开网页端都将自动同步完全一致的任务与进度。
            </span>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shrink-0 whitespace-nowrap self-start sm:self-auto"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>登录开启云同步</span>
          </button>
        </div>
      )}

      {/* Header & Quick Add */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono-num">
            {nowDate.getFullYear()}年{nowDate.getMonth() + 1}月{nowDate.getDate()}日 · {weekdayLabel}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-0.5">
            今日规划总览
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenNewTaskModal}
          className="hidden sm:inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>新建详细任务</span>
        </button>
      </div>

      {/* Quick Add Bar */}
      <form
        onSubmit={handleQuickAdd}
        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2"
      >
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="快速记录一个新任务，回车直接创建..."
          className="flex-1 min-h-[42px] bg-transparent px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!quickTitle.trim() || addingQuick}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0"
        >
          快速添加
        </button>
      </form>

      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigateTasks('all')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">今日进行中周期</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-slate-900 dark:text-slate-100">
            {todayTasksCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTasks('today')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">今日到期 DDL</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono-num ${
              dueTodayCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {dueTodayCount}
          </div>
        </button>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">今日已完成</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-emerald-600 dark:text-emerald-400">
            {completedTodayCount}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTasks('overdue')}
          className="text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">已逾期任务</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono-num ${
              overdueTasks.length > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {overdueTasks.length}
          </div>
        </button>
      </div>

      {/* Main 2-column responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Overdue Tasks */}
          {overdueTasks.length > 0 && (
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>逾期提醒 ({overdueTasks.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTasks('overdue')}
                  className="text-xs text-rose-700 dark:text-rose-300 hover:underline"
                >
                  查看全部
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {overdueTasks.slice(0, 5).map((task) => (
                  <DashboardTaskRow
                    key={task.id}
                    task={task}
                    project={task.projectId ? projectMap.get(task.projectId) : undefined}
                    settings={settings}
                    todayStr={todayStr}
                    onSelect={() => onSelectTask(task.id)}
                    onToggleComplete={() => toggleCompleteTask(task.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Due Within 7 Days */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>未来 7 天即将到期 ({dueSoonTasks.length})</span>
              </div>
            </div>
            {dueSoonTasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                未来 7 天内暂无到期任务。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dueSoonTasks.slice(0, 6).map((task) => (
                  <DashboardTaskRow
                    key={task.id}
                    task={task}
                    project={task.projectId ? projectMap.get(task.projectId) : undefined}
                    settings={settings}
                    todayStr={todayStr}
                    onSelect={() => onSelectTask(task.id)}
                    onToggleComplete={() => toggleCompleteTask(task.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* In Progress Tasks */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>进行中任务 ({inProgressTasks.length})</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTasks('all')}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              >
                全部任务
              </button>
            </div>
            {inProgressTasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                当前没有「进行中」的任务，可以从任务列表切换状态或新建任务。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {inProgressTasks.slice(0, 6).map((task) => (
                  <DashboardTaskRow
                    key={task.id}
                    task={task}
                    project={task.projectId ? projectMap.get(task.projectId) : undefined}
                    settings={settings}
                    todayStr={todayStr}
                    onSelect={() => onSelectTask(task.id)}
                    onToggleComplete={() => toggleCompleteTask(task.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Projects Overview + Today's Activity */}
        <div className="lg:col-span-5 space-y-6">
          {/* Projects Overview */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <FolderKanban className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>项目概览</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateProjects()}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              >
                管理项目
              </button>
            </div>
            {activeProjects.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                暂无活跃项目。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeProjects.map((proj) => {
                  const pTasks = tasks.filter((t) => t.projectId === proj.id);
                  const doneCount = pTasks.filter((t) => t.status === 'completed').length;
                  const pct =
                    proj.progressMode === 'manual'
                      ? proj.manualProgress
                      : pTasks.length === 0
                      ? 0
                      : Math.round((doneCount / pTasks.length) * 100);

                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => onNavigateProjects(proj.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: proj.color }}
                          />
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {proj.name}
                          </span>
                        </div>
                        <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
                          {doneCount}/{pTasks.length} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: proj.color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Today Activity Feed */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>今日执行记录 ({todayFeed.length})</span>
              </div>
            </div>

            {todayFeed.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                今天尚未记录新的进度或活动节点。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {todayFeed.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTask(item.taskId)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-2.5"
                  >
                    {item.kind === 'progress' ? (
                      <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    ) : (
                      <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </span>
                        <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                          {formatTimestamp(item.at, settings)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {item.taskTitle}
                        {item.subtitle ? ` · ${item.subtitle}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

interface DashboardTaskRowProps {
  task: Task;
  project?: Project;
  settings: AppSettings;
  todayStr: string;
  onSelect: () => void;
  onToggleComplete: () => void;
}

const DashboardTaskRow: React.FC<DashboardTaskRowProps> = ({
  task,
  project,
  settings,
  todayStr,
  onSelect,
  onToggleComplete,
}) => {
  const urgency = getDdlUrgency(task, todayStr);
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
        className={`w-6 h-6 min-w-[24px] rounded-lg border flex items-center justify-center transition-colors ${
          task.status === 'completed'
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'border-slate-300 dark:border-slate-600 hover:border-blue-500'
        }`}
        aria-label={task.status === 'completed' ? '取消完成' : '标记完成'}
      >
        {task.status === 'completed' && <Check className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {task.title}
          </span>
          <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
            {task.progress}%
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <PriorityLabel priority={task.priority} compact />
          {project && <ProjectLabel project={project} />}
          {task.plannedEndDate && (
            <span className="font-mono-num">
              DDL {formatPlannedDate(task.plannedEndDate, settings.dateFormat, todayStr)}
            </span>
          )}
          <DdlBadge urgency={urgency} />
        </div>
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        aria-label="打开任务详情"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};
