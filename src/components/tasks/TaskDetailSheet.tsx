import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  CalendarClock,
  Check,
  Edit3,
  History,
  Plus,
  Trash2,
  TrendingUp,
  X,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  addActivityNode,
  db,
  deleteActivityNode,
  deleteProgressLog,
  deleteTask,
  logTaskProgress,
  toggleCompleteTask,
  updateActivityNode,
  updateProgressLog,
  updateTask,
} from '../../db/database';
import {
  ActivityNode,
  AppSettings,
  ProgressLog,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
} from '../../types/models';
import { PRIORITY_META, PRIORITY_OPTIONS, STATUS_META, STATUS_OPTIONS } from '../../utils/constants';
import {
  computePlannedTimeProgress,
  countDeferrals,
  formatPlannedDate,
  formatTimestamp,
  fromLocalDateTimeInputValue,
  getDdlUrgency,
  toLocalDateString,
  toLocalDateTimeInputValue,
} from '../../utils/dateUtils';
import { DdlBadge, PriorityLabel, ProjectLabel, StatusLabel } from '../common/Badges';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ProgressChart } from '../common/ProgressChart';
import { DeferModal } from './DeferModal';

interface TaskDetailSheetProps {
  taskId: string | null;
  projects: Project[];
  settings: AppSettings;
  onClose: () => void;
  onEditTask: (task: Task) => void;
}

type DetailTab = 'overview' | 'progress' | 'activity' | 'schedule';

export const TaskDetailSheet: React.FC<TaskDetailSheetProps> = ({
  taskId,
  projects,
  settings,
  onClose,
  onEditTask,
}) => {
  const task = useLiveQuery(() => (taskId ? db.tasks.get(taskId) : undefined), [taskId]);

  const progressLogs = useLiveQuery(
    async () => {
      if (!taskId) return [];
      const rows = await db.progressLogs.where('taskId').equals(taskId).toArray();
      return rows.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    },
    [taskId],
    []
  );

  const activityNodes = useLiveQuery(
    async () => {
      if (!taskId) return [];
      const rows = await db.activityNodes.where('taskId').equals(taskId).toArray();
      return rows.sort((a, b) => b.eventAt.localeCompare(a.eventAt));
    },
    [taskId],
    []
  );

  const scheduleLogs = useLiveQuery(
    async () => {
      if (!taskId) return [];
      const rows = await db.scheduleLogs.where('taskId').equals(taskId).toArray();
      return rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
    },
    [taskId],
    []
  );

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeferModal, setShowDeferModal] = useState(false);

  // Progress log form state
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [editingProgLog, setEditingProgLog] = useState<ProgressLog | null>(null);
  const [progInput, setProgInput] = useState(0);
  const [progNote, setProgNote] = useState('');
  const [progLoggedAtInput, setProgLoggedAtInput] = useState('');
  const [autoComplete100, setAutoComplete100] = useState(true);
  const [completePromptValue, setCompletePromptValue] = useState<boolean>(false);

  // Activity node form state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingNode, setEditingNode] = useState<ActivityNode | null>(null);
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeDesc, setNodeDesc] = useState('');
  const [useCustomEventTime, setUseCustomEventTime] = useState(false);
  const [nodeEventAtInput, setNodeEventAtInput] = useState('');

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  if (!taskId || !task) return null;

  const project = task.projectId ? projectMap.get(task.projectId) ?? null : null;
  const todayStr = toLocalDateString();
  const urgency = getDdlUrgency(task, todayStr);
  const plannedTimePct = computePlannedTimeProgress(
    task.plannedStartDate,
    task.plannedEndDate,
    todayStr
  );
  const deferralCount = countDeferrals(scheduleLogs);

  const openNewProgressLog = () => {
    setEditingProgLog(null);
    setProgInput(task.progress);
    setProgNote('');
    setProgLoggedAtInput('');
    setAutoComplete100(true);
    setShowProgressForm(true);
    setActiveTab('progress');
  };

  const openEditProgressLog = (log: ProgressLog) => {
    setEditingProgLog(log);
    setProgInput(log.progress);
    setProgNote(log.note);
    setProgLoggedAtInput(toLocalDateTimeInputValue(log.loggedAt));
    setShowProgressForm(true);
  };

  const handleSaveProgressLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProgLog) {
      const isLatest = progressLogs[0]?.id === editingProgLog.id;
      await updateProgressLog(
        editingProgLog.id,
        {
          progress: progInput,
          note: progNote,
          loggedAt: progLoggedAtInput ? fromLocalDateTimeInputValue(progLoggedAtInput) : undefined,
        },
        isLatest
      );
    } else {
      await logTaskProgress(task.id, progInput, progNote, autoComplete100);
    }
    setShowProgressForm(false);
    setEditingProgLog(null);
  };

  const openNewActivityNode = () => {
    setEditingNode(null);
    setNodeTitle('');
    setNodeDesc('');
    setUseCustomEventTime(false);
    setNodeEventAtInput(toLocalDateTimeInputValue());
    setShowActivityForm(true);
    setActiveTab('activity');
  };

  const openEditActivityNode = (node: ActivityNode) => {
    setEditingNode(node);
    setNodeTitle(node.title);
    setNodeDesc(node.description);
    setUseCustomEventTime(true);
    setNodeEventAtInput(toLocalDateTimeInputValue(node.eventAt));
    setShowActivityForm(true);
  };

  const handleSaveActivityNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeTitle.trim()) return;
    if (editingNode) {
      await updateActivityNode(editingNode.id, {
        title: nodeTitle,
        description: nodeDesc,
        eventAt: useCustomEventTime && nodeEventAtInput
          ? fromLocalDateTimeInputValue(nodeEventAtInput)
          : editingNode.eventAt,
      });
    } else {
      await addActivityNode(
        task.id,
        nodeTitle,
        nodeDesc,
        useCustomEventTime && nodeEventAtInput ? fromLocalDateTimeInputValue(nodeEventAtInput) : undefined
      );
    }
    setShowActivityForm(false);
    setEditingNode(null);
  };

  const handleSliderOrQuickProgress = async (val: number) => {
    await updateTask(task.id, { progress: val });
    if (val === 100 && task.status !== 'completed') {
      setCompletePromptValue(true);
    } else {
      setCompletePromptValue(false);
    }
  };

  const handleDeleteTask = async () => {
    await deleteTask(task.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[90dvh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Grab handle on mobile */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>

          {/* Sticky Top Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <PriorityLabel priority={task.priority} compact />
                  <StatusLabel status={task.status} />
                  {project && (
                    <>
                      <span aria-hidden="true">·</span>
                      <ProjectLabel project={project} />
                    </>
                  )}
                  <DdlBadge urgency={urgency} />
                </div>
                <h2
                  className={`text-lg font-semibold leading-snug ${
                    task.status === 'completed'
                      ? 'line-through text-slate-400 dark:text-slate-500'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {task.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                aria-label="关闭详情"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCompleteTask(task.id)}
                className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  task.status === 'completed'
                    ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'border-emerald-600/30 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {task.status === 'completed' ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重新打开</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>标记完成</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={openNewProgressLog}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>记录进度</span>
              </button>

              <button
                type="button"
                onClick={openNewActivityNode}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>新增节点</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeferModal(true)}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <CalendarClock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>延期</span>
              </button>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEditTask(task)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="编辑任务"
                  aria-label="编辑任务"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="删除任务"
                  aria-label="删除任务"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="mt-3 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { key: 'overview' as DetailTab, label: '概览与对照' },
                { key: 'progress' as DetailTab, label: `进度 (${progressLogs.length})` },
                { key: 'activity' as DetailTab, label: `活动节点 (${activityNodes.length})` },
                { key: 'schedule' as DetailTab, label: `计划与延期 (${scheduleLogs.length})` },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    activeTab === t.key
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-safe space-y-5">
            {activeTab === 'overview' && (
              <>
                {completePromptValue && task.status !== 'completed' && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/35 px-3.5 py-2.5 text-xs">
                    <span className="text-emerald-800 dark:text-emerald-200">
                      当前进度已达到 100%，是否将任务状态设为「已完成」？
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await updateTask(task.id, { status: 'completed', progress: 100 });
                        setCompletePromptValue(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-medium shrink-0"
                    >
                      设为已完成
                    </button>
                  </div>
                )}

                {/* Quick Status & Priority controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      状态
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {STATUS_OPTIONS.map((st) => {
                        const meta = STATUS_META[st];
                        const active = task.status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => updateTask(task.id, { status: st })}
                            className={`min-h-[36px] rounded-lg border text-xs font-medium transition-colors ${
                              active
                                ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass}`
                                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      优先级
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PRIORITY_OPTIONS.map((p) => {
                        const meta = PRIORITY_META[p];
                        const active = task.priority === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateTask(task.id, { priority: p as TaskPriority })}
                            className={`min-h-[36px] rounded-lg border text-xs font-medium transition-colors ${
                              active
                                ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass}`
                                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {p} {meta.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Progress Direct Adjustment */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      当前任务实际进度
                    </span>
                    <span className="text-base font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                      {task.progress}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={task.progress}
                    onChange={(e) => handleSliderOrQuickProgress(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex items-center gap-1.5">
                    {[0, 25, 50, 75, 100].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleSliderOrQuickProgress(v)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono-num border transition-colors ${
                          task.progress === v
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plan vs Actual Comparison */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      计划时间与实际执行对照
                    </h3>
                    {deferralCount > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        已延期 {deferralCount} 次
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-slate-400 dark:text-slate-500">原始开始日期</div>
                      <div className="mt-0.5 font-mono-num text-slate-700 dark:text-slate-300">
                        {formatPlannedDate(task.originalStartDate, settings.dateFormat)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 dark:text-slate-500">当前计划开始</div>
                      <div className="mt-0.5 font-mono-num text-slate-900 dark:text-slate-100 font-medium">
                        {formatPlannedDate(task.plannedStartDate, settings.dateFormat)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 dark:text-slate-500">原始 DDL</div>
                      <div className="mt-0.5 font-mono-num text-slate-700 dark:text-slate-300">
                        {formatPlannedDate(task.originalEndDate, settings.dateFormat)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 dark:text-slate-500">当前 DDL</div>
                      <div className="mt-0.5 font-mono-num text-slate-900 dark:text-slate-100 font-medium">
                        {formatPlannedDate(task.plannedEndDate, settings.dateFormat)}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <div className="text-slate-400 dark:text-slate-500">实际完成时间</div>
                      <div className="mt-0.5 font-mono-num text-slate-900 dark:text-slate-100">
                        {task.completedAt ? formatTimestamp(task.completedAt, settings) : '尚未完成'}
                      </div>
                    </div>
                  </div>

                  {/* Planned Time Progress vs Actual Task Progress */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    {plannedTimePct !== null && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-500 dark:text-slate-400">
                            计划时间进度（仅表示计划周期时间消耗）
                          </span>
                          <span className="font-mono-num text-slate-700 dark:text-slate-300">
                            {plannedTimePct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-slate-400 dark:bg-slate-500 rounded-full"
                            style={{ width: `${plannedTimePct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-700 dark:text-slate-200 font-medium">
                          实际任务进度
                        </span>
                        <span className="font-mono-num text-blue-600 dark:text-blue-400 font-semibold">
                          {task.progress}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <ProgressChart
                    logs={progressLogs}
                    currentProgress={task.progress}
                    settings={settings}
                  />
                </div>

                {/* Description, Tags & Notes */}
                {(task.description || task.tags.length > 0 || task.notes) && (
                  <div className="space-y-3 text-sm">
                    {task.description && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          任务描述
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {task.description}
                        </p>
                      </div>
                    )}
                    {task.tags.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          标签
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {task.tags.map((tag, i) => (
                            <React.Fragment key={tag}>
                              {i > 0 && <span className="mx-1.5 text-slate-400">·</span>}
                              <span>#{tag}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                    {task.notes && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          备注
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                          {task.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>创建：{formatTimestamp(task.createdAt, settings)}</span>
                  <span>更新：{formatTimestamp(task.updatedAt, settings)}</span>
                </div>
              </>
            )}

            {activeTab === 'progress' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      进度历史记录
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      当前进度：{task.progress}%（独立保存，删除历史不破坏其他记录）
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openNewProgressLog}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>记录进度</span>
                  </button>
                </div>

                {showProgressForm && (
                  <form
                    onSubmit={handleSaveProgressLog}
                    className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {editingProgLog ? '修改进度记录' : '新增进度记录（自动记录当前本地时间）'}
                      </span>
                      <span className="text-sm font-mono-num font-semibold text-blue-600 dark:text-blue-400">
                        {progInput}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progInput}
                      onChange={(e) => setProgInput(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={progInput}
                        onChange={(e) =>
                          setProgInput(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                        }
                        className="w-20 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono-num"
                      />
                      <input
                        type="text"
                        value={progNote}
                        onChange={(e) => setProgNote(e.target.value)}
                        placeholder="进度说明，例如：完成资料收集"
                        className="flex-1 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
                      />
                    </div>

                    {editingProgLog && (
                      <div>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          记录时间
                        </label>
                        <input
                          type="datetime-local"
                          value={progLoggedAtInput}
                          onChange={(e) => setProgLoggedAtInput(e.target.value)}
                          className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
                        />
                      </div>
                    )}

                    {!editingProgLog && progInput === 100 && task.status !== 'completed' && (
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={autoComplete100}
                          onChange={(e) => setAutoComplete100(e.target.checked)}
                          className="rounded accent-blue-600"
                        />
                        <span>进度达到 100% 时自动将任务标记为已完成</span>
                      </label>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowProgressForm(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                      >
                        保存记录
                      </button>
                    </div>
                  </form>
                )}

                <ProgressChart
                  logs={progressLogs}
                  currentProgress={task.progress}
                  settings={settings}
                />

                {progressLogs.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-6">
                    尚未添加进度记录。
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {progressLogs.map((log, idx) => (
                      <div
                        key={log.id}
                        className="p-3.5 bg-white dark:bg-slate-900 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono-num text-slate-500 dark:text-slate-400">
                              {formatTimestamp(log.loggedAt, settings)}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              —
                            </span>
                            <span className="font-mono-num font-semibold text-blue-600 dark:text-blue-400">
                              {log.progress}%
                            </span>
                          </div>
                          <p className="text-sm text-slate-800 dark:text-slate-200">
                            {log.note || '无说明'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditProgressLog(log)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="编辑进度记录"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              // If deleting the newest log and there is a previous log, optionally keep current progress or sync if user wants;
                              // prompt specifies: current progress is stored separately and deleting a record must not break others.
                              const fallback =
                                idx === 0 && progressLogs.length > 1
                                  ? progressLogs[1].progress
                                  : undefined;
                              await deleteProgressLog(log.id, fallback);
                            }}
                            className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            aria-label="删除进度记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      任务阶段节点与活动记录
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      独立记录真实执行事件，不强制修改进度
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openNewActivityNode}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增节点</span>
                  </button>
                </div>

                {showActivityForm && (
                  <form
                    onSubmit={handleSaveActivityNode}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 space-y-3"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {editingNode ? '编辑活动节点' : '新增活动节点（点击保存即自动记录设备当前时间）'}
                    </div>
                    <input
                      type="text"
                      value={nodeTitle}
                      onChange={(e) => setNodeTitle(e.target.value)}
                      placeholder="节点名称，例如：完成初稿、提交审核"
                      required
                      className="w-full min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                    />
                    <textarea
                      rows={2}
                      value={nodeDesc}
                      onChange={(e) => setNodeDesc(e.target.value)}
                      placeholder="节点说明（可选）"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                    />

                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={useCustomEventTime}
                        onChange={(e) => setUseCustomEventTime(e.target.checked)}
                        className="rounded accent-blue-600"
                      />
                      <span>{editingNode ? '修改实际发生时间' : '补录过去发生的时间（默认自动使用当前时间）'}</span>
                    </label>

                    {useCustomEventTime && (
                      <input
                        type="datetime-local"
                        value={nodeEventAtInput}
                        onChange={(e) => setNodeEventAtInput(e.target.value)}
                        className="w-full min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
                      />
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowActivityForm(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                      >
                        保存节点
                      </button>
                    </div>
                  </form>
                )}

                {activityNodes.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-6">
                    暂无活动节点，点击上方「新增节点」记录关键阶段。
                  </p>
                ) : (
                  <div className="relative pl-5 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
                    {activityNodes.map((node) => (
                      <div key={node.id} className="relative">
                        <span
                          className={`absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                            node.systemType === 'completed'
                              ? 'bg-emerald-600'
                              : node.systemType === 'reopened'
                              ? 'bg-amber-500'
                              : 'bg-blue-600'
                          }`}
                        />
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {node.title}
                              </span>
                              <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                                {formatTimestamp(node.eventAt, settings)}
                              </span>
                            </div>
                            {node.description && (
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {node.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditActivityNode(node)}
                              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label="编辑节点"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteActivityNode(node.id)}
                              className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              aria-label="删除节点"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'schedule' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      计划日期变更与延期历史
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      原始 DDL：{formatPlannedDate(task.originalEndDate, settings.dateFormat)} · 累计延期 {deferralCount} 次
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeferModal(true)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>延期 DDL</span>
                  </button>
                </div>

                {scheduleLogs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    尚未发生计划日期调整或延期记录。
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {scheduleLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-mono-num">
                            <History className="w-3.5 h-3.5" />
                            修改时间：{formatTimestamp(log.changedAt, settings)}
                          </span>
                        </div>
                        {log.oldEndDate !== log.newEndDate && (
                          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-medium">
                            <span className="text-slate-500">原DDL：{formatPlannedDate(log.oldEndDate, settings.dateFormat)}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>新DDL：{formatPlannedDate(log.newEndDate, settings.dateFormat)}</span>
                          </div>
                        )}
                        {log.oldStartDate !== log.newStartDate && (
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <span className="text-slate-500">开始日期：{formatPlannedDate(log.oldStartDate, settings.dateFormat)}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatPlannedDate(log.newStartDate, settings.dateFormat)}</span>
                          </div>
                        )}
                        {log.reason && (
                          <div className="text-slate-600 dark:text-slate-300">
                            原因：{log.reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <DeferModal
        open={showDeferModal}
        task={task}
        settings={settings}
        onClose={() => setShowDeferModal(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="确认删除该任务？"
        description={`将永久删除「${task.title}」及其关联的进度历史、活动节点和计划变更记录，此操作不可撤销。`}
        confirmLabel="确认删除"
        danger
        onConfirm={handleDeleteTask}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};
