import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RotateCcw,
  Inbox,
} from 'lucide-react';
import { AppSettings, Project, Task, TaskFilterState, TimelineScale } from '../../types/models';
import { PRIORITY_META, PRIORITY_OPTIONS, STATUS_META, STATUS_OPTIONS } from '../../utils/constants';
import {
  addDaysToLocalDate,
  addMonths,
  diffLocalDays,
  formatPlannedDate,
  getDaysInMonth,
  getStartOfWeek,
  getWeekdayShortZh,
  isTaskUnscheduled,
  parseLocalDate,
  toLocalDateString,
} from '../../utils/dateUtils';
import { DEFAULT_FILTERS, filterTasks, sortTasks, TaskSortField } from '../../utils/taskFilters';
import { PriorityLabel, ProjectLabel, StatusLabel } from '../common/Badges';

interface TimelineViewProps {
  tasks: Task[];
  projects: Project[];
  settings: AppSettings;
  onSelectTask: (taskId: string) => void;
  onCreateTaskOnDate: (dateStr?: string) => void;
}

interface TimelineColumn {
  key: string;
  label: string;
  subLabel?: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  widthPx: number;
  isToday: boolean;
}

const SCALE_LABELS: { key: TimelineScale; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' },
];

export const TimelineView: React.FC<TimelineViewProps> = ({
  tasks,
  projects,
  settings,
  onSelectTask,
  onCreateTaskOnDate,
}) => {
  const [scale, setScale] = useState<TimelineScale>(settings.defaultTimelineScale || 'week');
  const [anchorDate, setAnchorDate] = useState<string>(toLocalDateString());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<TaskSortField>('start');
  const [showUnscheduled, setShowUnscheduled] = useState(true);

  const todayStr = toLocalDateString();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(
    () => sortTasks(filterTasks(tasks, filters, projects, todayStr), sortBy, projects),
    [tasks, filters, projects, todayStr, sortBy]
  );

  // Tasks that have at least one planned date (start or DDL) appear on timeline;
  // Tasks missing start OR DDL also appear in unscheduled area so user can assign dates.
  const scheduledTasks = useMemo(
    () => filteredTasks.filter((t) => t.plannedStartDate || t.plannedEndDate),
    [filteredTasks]
  );

  const unscheduledTasks = useMemo(
    () => filteredTasks.filter((t) => isTaskUnscheduled(t)),
    [filteredTasks]
  );

  // Compute timeline columns & range based on scale and anchorDate
  const { columns, rangeStart, rangeEnd, rangeTitle } = useMemo(() => {
    const anchor = parseLocalDate(anchorDate);
    const cols: TimelineColumn[] = [];

    if (scale === 'day') {
      // 7-day high-resolution day focus centered around anchor (anchor - 2 .. anchor + 4)
      const start = addDaysToLocalDate(anchorDate, -2);
      for (let i = 0; i < 7; i++) {
        const dStr = addDaysToLocalDate(start, i);
        const dt = parseLocalDate(dStr);
        cols.push({
          key: dStr,
          label: `${dt.getMonth() + 1}/${dt.getDate()}`,
          subLabel: `周${getWeekdayShortZh(dt.getDay())}`,
          startDate: dStr,
          endDate: dStr,
          widthPx: 88,
          isToday: dStr === todayStr,
        });
      }
      const end = cols[cols.length - 1].endDate;
      return {
        columns: cols,
        rangeStart: start,
        rangeEnd: end,
        rangeTitle: `${formatPlannedDate(start, 'zh', todayStr)} — ${formatPlannedDate(end, 'zh', todayStr)}`,
      };
    }

    if (scale === 'week') {
      // 14 days (2 weeks starting from current week start)
      const weekStart = getStartOfWeek(anchor, settings.weekStartsOn);
      const start = toLocalDateString(weekStart);
      for (let i = 0; i < 14; i++) {
        const dStr = addDaysToLocalDate(start, i);
        const dt = parseLocalDate(dStr);
        cols.push({
          key: dStr,
          label: `${dt.getDate()}`,
          subLabel:
            dt.getDate() === 1 || i === 0
              ? `${dt.getMonth() + 1}月`
              : `周${getWeekdayShortZh(dt.getDay())}`,
          startDate: dStr,
          endDate: dStr,
          widthPx: 54,
          isToday: dStr === todayStr,
        });
      }
      const end = cols[cols.length - 1].endDate;
      return {
        columns: cols,
        rangeStart: start,
        rangeEnd: end,
        rangeTitle: `${formatPlannedDate(start, 'zh', todayStr)} — ${formatPlannedDate(end, 'zh', todayStr)}`,
      };
    }

    if (scale === 'month') {
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const days = getDaysInMonth(year, month);
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      for (let i = 0; i < days; i++) {
        const dStr = addDaysToLocalDate(start, i);
        const dt = parseLocalDate(dStr);
        cols.push({
          key: dStr,
          label: `${dt.getDate()}`,
          subLabel: `周${getWeekdayShortZh(dt.getDay())}`,
          startDate: dStr,
          endDate: dStr,
          widthPx: 40,
          isToday: dStr === todayStr,
        });
      }
      const end = cols[cols.length - 1].endDate;
      return {
        columns: cols,
        rangeStart: start,
        rangeEnd: end,
        rangeTitle: `${year}年${month + 1}月`,
      };
    }

    if (scale === 'quarter') {
      // 3 months starting from anchor's quarter start
      const qStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
      const qStart = new Date(anchor.getFullYear(), qStartMonth, 1);
      // Render weekly buckets across the quarter (approx 13 weeks) for crisp mobile scannability
      const start = toLocalDateString(qStart);
      const qEndDate = new Date(anchor.getFullYear(), qStartMonth + 3, 0);
      const qEnd = toLocalDateString(qEndDate);

      let cursor = start;
      let idx = 1;
      while (cursor <= qEnd) {
        const bucketEndCandidate = addDaysToLocalDate(cursor, 6);
        const bucketEnd = bucketEndCandidate > qEnd ? qEnd : bucketEndCandidate;
        const cDt = parseLocalDate(cursor);
        cols.push({
          key: cursor,
          label: `${cDt.getMonth() + 1}/${cDt.getDate()}`,
          subLabel: `第${idx}周`,
          startDate: cursor,
          endDate: bucketEnd,
          widthPx: 68,
          isToday: todayStr >= cursor && todayStr <= bucketEnd,
        });
        cursor = addDaysToLocalDate(bucketEnd, 1);
        idx++;
      }
      const qNum = Math.floor(qStartMonth / 3) + 1;
      return {
        columns: cols,
        rangeStart: start,
        rangeEnd: qEnd,
        rangeTitle: `${anchor.getFullYear()}年 Q${qNum}`,
      };
    }

    // Year view: 12 monthly columns
    const year = anchor.getFullYear();
    for (let m = 0; m < 12; m++) {
      const mStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const days = getDaysInMonth(year, m);
      const mEnd = `${year}-${String(m + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
      cols.push({
        key: `${year}-${m + 1}`,
        label: `${m + 1}月`,
        subLabel: `${days}天`,
        startDate: mStart,
        endDate: mEnd,
        widthPx: 72,
        isToday: todayStr >= mStart && todayStr <= mEnd,
      });
    }
    return {
      columns: cols,
      rangeStart: `${year}-01-01`,
      rangeEnd: `${year}-12-31`,
      rangeTitle: `${year}年 全年`,
    };
  }, [scale, anchorDate, settings.weekStartsOn, todayStr]);

  const totalGridWidth = useMemo(
    () => columns.reduce((acc, c) => acc + c.widthPx, 0),
    [columns]
  );

  // Map a YYYY-MM-DD date to pixel X offset within [rangeStart .. rangeEnd]
  const dateToOffsetPx = (dateStr: string, edge: 'start' | 'end'): number => {
    let accX = 0;
    for (const col of columns) {
      const colDays = diffLocalDays(col.startDate, col.endDate) + 1;
      if (dateStr < col.startDate) {
        return accX;
      }
      if (dateStr <= col.endDate) {
        const offsetDays = diffLocalDays(col.startDate, dateStr);
        const dayWidth = col.widthPx / colDays;
        return accX + (edge === 'start' ? offsetDays * dayWidth : (offsetDays + 1) * dayWidth);
      }
      accX += col.widthPx;
    }
    return totalGridWidth;
  };

  // Today vertical marker line X offset
  const todayLineX = useMemo(() => {
    if (todayStr < rangeStart || todayStr > rangeEnd) return null;
    const startX = dateToOffsetPx(todayStr, 'start');
    const endX = dateToOffsetPx(todayStr, 'end');
    return (startX + endX) / 2;
  }, [todayStr, rangeStart, rangeEnd, columns]);

  const stepRange = (dir: -1 | 1) => {
    const dt = parseLocalDate(anchorDate);
    if (scale === 'day') {
      setAnchorDate(addDaysToLocalDate(anchorDate, dir * 5));
    } else if (scale === 'week') {
      setAnchorDate(addDaysToLocalDate(anchorDate, dir * 7));
    } else if (scale === 'month') {
      setAnchorDate(toLocalDateString(addMonths(dt, dir)));
    } else if (scale === 'quarter') {
      setAnchorDate(toLocalDateString(addMonths(dt, dir * 3)));
    } else {
      setAnchorDate(toLocalDateString(new Date(dt.getFullYear() + dir, dt.getMonth(), 1)));
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status !== 'all') count++;
    if (filters.priority !== 'all') count++;
    if (filters.projectId !== 'all') count++;
    if (filters.tag !== 'all') count++;
    if (filters.overdueOnly) count++;
    return count;
  }, [filters]);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              时间轴与甘特图
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num mt-0.5">
              {rangeTitle} · 点击日期列可快速创建任务
            </p>
          </div>

          {/* Scale Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
            {SCALE_LABELS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScale(s.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  scale === s.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepRange(-1)}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="上一个时间段"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(todayStr)}
              className="min-h-[38px] px-3 rounded-xl text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 whitespace-nowrap"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => {
                setScale('week');
                setAnchorDate(todayStr);
              }}
              className="hidden sm:inline-flex items-center min-h-[38px] px-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              本周
            </button>
            <button
              type="button"
              onClick={() => {
                setScale('month');
                setAnchorDate(todayStr);
              }}
              className="hidden sm:inline-flex items-center min-h-[38px] px-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              本月
            </button>
            <button
              type="button"
              onClick={() => stepRange(1)}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="下一个时间段"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => e.target.value && setAnchorDate(e.target.value)}
                aria-label="跳转日期"
                className="min-h-[38px] pl-8 pr-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono-num text-slate-700 dark:text-slate-200"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Expanded Filter & Sort Drawer */}
        {showFilters && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as TaskFilterState['status'] })}
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
                onChange={(e) => setFilters({ ...filters, priority: e.target.value as TaskFilterState['priority'] })}
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
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
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
                onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
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
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TaskSortField)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5"
              >
                <option value="start">排序：开始日期</option>
                <option value="ddl">排序：截止日期 (DDL)</option>
                <option value="priority">排序：优先级</option>
                <option value="status">排序：状态</option>
                <option value="project">排序：项目</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={filters.overdueOnly}
                  onChange={(e) => setFilters({ ...filters, overdueOnly: e.target.checked })}
                  className="rounded accent-rose-600"
                />
                <span>仅看逾期任务</span>
              </label>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重置筛选</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gantt Chart Grid Container */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {scheduledTasks.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              当前筛选条件下没有已设置日期的任务。
            </p>
            <button
              type="button"
              onClick={() => onCreateTaskOnDate(todayStr)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              <span>在今天创建任务</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto thin-scrollbar">
            <div style={{ minWidth: `${140 + totalGridWidth}px` }}>
              {/* Timeline Header Row */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70">
                <div className="sticky left-0 z-20 w-[140px] sm:w-[210px] shrink-0 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    任务 ({scheduledTasks.length})
                  </span>
                </div>

                <div className="flex relative" style={{ width: `${totalGridWidth}px` }}>
                  {columns.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => onCreateTaskOnDate(col.startDate)}
                      title={`点击在 ${col.startDate} 创建任务`}
                      style={{ width: `${col.widthPx}px` }}
                      className={`shrink-0 py-1.5 px-1 text-center border-r border-slate-100 dark:border-slate-800/80 transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-950/30 ${
                        col.isToday ? 'bg-blue-50/80 dark:bg-blue-950/40' : ''
                      }`}
                    >
                      <div
                        className={`text-[10px] leading-tight ${
                          col.isToday
                            ? 'text-blue-600 dark:text-blue-400 font-semibold'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {col.isToday ? '今天' : col.subLabel}
                      </div>
                      <div
                        className={`text-xs font-mono-num leading-tight mt-0.5 ${
                          col.isToday
                            ? 'text-blue-700 dark:text-blue-300 font-bold'
                            : 'text-slate-700 dark:text-slate-200 font-medium'
                        }`}
                      >
                        {col.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline Task Rows */}
              <div className="relative divide-y divide-slate-100 dark:divide-slate-800/80">
                {scheduledTasks.map((task) => {
                  const hasStart = !!task.plannedStartDate;
                  const hasEnd = !!task.plannedEndDate;
                  const effectiveStart = task.plannedStartDate ?? task.plannedEndDate!;
                  const effectiveEnd = task.plannedEndDate ?? task.plannedStartDate!;

                  const visibleInWindow =
                    effectiveEnd >= rangeStart && effectiveStart <= rangeEnd;

                  const clampedStart = effectiveStart < rangeStart ? rangeStart : effectiveStart;
                  const clampedEnd = effectiveEnd > rangeEnd ? rangeEnd : effectiveEnd;

                  const leftPx = visibleInWindow ? dateToOffsetPx(clampedStart, 'start') : 0;
                  const rightPx = visibleInWindow ? dateToOffsetPx(clampedEnd, 'end') : 0;
                  const barWidthPx = Math.max(28, rightPx - leftPx);

                  const priorityMeta = PRIORITY_META[task.priority];
                  const proj = task.projectId ? projectMap.get(task.projectId) : undefined;

                  return (
                    <div
                      key={task.id}
                      className="flex items-stretch min-h-[54px] hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      {/* Sticky Left Task Name */}
                      <button
                        type="button"
                        onClick={() => onSelectTask(task.id)}
                        className="sticky left-0 z-10 w-[140px] sm:w-[210px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-3 py-2 text-left flex flex-col justify-center"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: priorityMeta.dotColor }}
                          />
                          <span
                            className={`text-xs font-medium truncate ${
                              task.status === 'completed'
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          <span>{task.priority}</span>
                          <span>·</span>
                          <span className="font-mono-num">{task.progress}%</span>
                          {proj && (
                            <>
                              <span>·</span>
                              <span className="truncate">{proj.name}</span>
                            </>
                          )}
                        </div>
                      </button>

                      {/* Right Timeline Canvas */}
                      <div
                        className="relative flex items-center"
                        style={{ width: `${totalGridWidth}px` }}
                      >
                        {/* Background grid cells */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {columns.map((col) => (
                            <div
                              key={col.key}
                              style={{ width: `${col.widthPx}px` }}
                              className={`shrink-0 h-full border-r border-slate-100 dark:border-slate-800/60 ${
                                col.isToday ? 'bg-blue-50/35 dark:bg-blue-950/20' : ''
                              }`}
                            />
                          ))}
                        </div>

                        {/* Vertical Today Marker */}
                        {todayLineX !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-blue-500/70 z-10 pointer-events-none"
                            style={{ left: `${todayLineX}px` }}
                          />
                        )}

                        {/* Task Bar */}
                        {visibleInWindow ? (
                          <button
                            type="button"
                            onClick={() => onSelectTask(task.id)}
                            style={{
                              left: `${leftPx + 2}px`,
                              width: `${Math.max(24, barWidthPx - 4)}px`,
                            }}
                            className={`relative z-10 h-9 rounded-xl border px-2 flex items-center gap-1.5 overflow-hidden text-left transition-transform active:scale-[0.98] ${
                              priorityMeta.barClass
                            } ${!hasStart || !hasEnd ? 'border-dashed' : ''} ${
                              task.status === 'completed' ? 'opacity-65' : ''
                            }`}
                          >
                            {/* Progress inner fill */}
                            <span
                              className="absolute inset-y-0 left-0 bg-current opacity-10 pointer-events-none"
                              style={{ width: `${task.progress}%` }}
                            />
                            <span className="relative text-[11px] font-medium truncate flex-1">
                              {task.title}
                            </span>
                            {barWidthPx >= 86 && (
                              <span className="relative text-[10px] font-mono-num opacity-80 shrink-0">
                                {task.progress}%
                              </span>
                            )}
                            {barWidthPx >= 140 && task.plannedEndDate && (
                              <span className="relative text-[10px] font-mono-num opacity-75 shrink-0">
                                · {formatPlannedDate(task.plannedEndDate, settings.dateFormat, todayStr)}
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setAnchorDate(effectiveStart)
                            }
                            className="ml-3 text-[11px] text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 underline z-10"
                          >
                            任务在 {formatPlannedDate(effectiveStart, settings.dateFormat, todayStr)}（点击跳转）
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Unscheduled Tasks Area */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowUnscheduled(!showUnscheduled)}
          className="w-full px-4 py-3 flex items-center justify-between text-left border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Inbox className="w-4 h-4 text-slate-500" />
            <span>未排期或日期不完整任务 ({unscheduledTasks.length})</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {showUnscheduled ? '收起' : '展开'}
          </span>
        </button>

        {showUnscheduled && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {unscheduledTasks.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                所有任务都已设置开始日期与 DDL。
              </div>
            ) : (
              unscheduledTasks.map((task) => {
                const proj = task.projectId ? projectMap.get(task.projectId) : undefined;
                return (
                  <div
                    key={task.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <PriorityLabel priority={task.priority} compact />
                        <StatusLabel status={task.status} />
                        {proj && <ProjectLabel project={proj} />}
                        <span>
                          {!task.plannedStartDate && !task.plannedEndDate
                            ? '未设置开始日期与 DDL'
                            : !task.plannedStartDate
                            ? `仅设置 DDL (${formatPlannedDate(task.plannedEndDate, settings.dateFormat)})`
                            : `仅设置开始日期 (${formatPlannedDate(task.plannedStartDate, settings.dateFormat)})`}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      安排日期
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
