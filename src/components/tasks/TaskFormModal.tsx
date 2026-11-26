import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X, AlertCircle } from 'lucide-react';
import { createTask, updateTask } from '../../db/database';
import { Project, Task, TaskPriority, TaskStatus } from '../../types/models';
import { PRIORITY_META, PRIORITY_OPTIONS, STATUS_META, STATUS_OPTIONS } from '../../utils/constants';
import { addDaysToLocalDate, diffLocalDays, toLocalDateString } from '../../utils/dateUtils';

interface TaskFormModalProps {
  open: boolean;
  task?: Task | null; // If provided -> edit mode
  projects: Project[];
  defaultProjectId?: string | null;
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  onClose: () => void;
  onSaved?: (task: Task) => void;
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  open,
  task,
  projects,
  defaultProjectId = null,
  defaultStartDate = null,
  defaultEndDate = null,
  onClose,
  onSaved,
}) => {
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('P4');
  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [progress, setProgress] = useState<number>(0);
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setProjectId(task.projectId ?? '');
      setPlannedStartDate(task.plannedStartDate ?? '');
      setPlannedEndDate(task.plannedEndDate ?? '');
      setPriority(task.priority);
      setStatus(task.status);
      setProgress(task.progress);
      setTagsInput(task.tags.join(', '));
      setNotes(task.notes);
      setScheduleReason('');
      setShowAdvanced(true);
    } else {
      const start = defaultStartDate || toLocalDateString();
      setTitle('');
      setDescription('');
      setProjectId(defaultProjectId ?? '');
      setPlannedStartDate(start);
      setPlannedEndDate(defaultEndDate || addDaysToLocalDate(start, 7));
      setPriority('P4');
      setStatus('not_started');
      setProgress(0);
      setTagsInput('');
      setNotes('');
      setScheduleReason('');
      setShowAdvanced(Boolean(defaultStartDate || defaultEndDate || defaultProjectId));
    }
    setError('');
  }, [open, task, defaultProjectId, defaultStartDate, defaultEndDate]);

  if (!open) return null;

  const dateInvalid =
    Boolean(plannedStartDate && plannedEndDate) &&
    diffLocalDays(plannedStartDate, plannedEndDate) < 0;

  const datesChanged =
    isEdit &&
    task &&
    ((plannedStartDate || null) !== task.plannedStartDate ||
      (plannedEndDate || null) !== task.plannedEndDate);

  const handleStatusChange = (nextStatus: TaskStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'completed') {
      setProgress(100);
    } else if (nextStatus === 'not_started') {
      setProgress(0);
    } else if (nextStatus === 'in_progress' && progress >= 100) {
      setProgress(90);
    }
  };

  const handleProgressChange = (val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    setProgress(clamped);
    if (clamped === 100) {
      setStatus('completed');
    } else if (clamped > 0 && status === 'not_started') {
      setStatus('in_progress');
    } else if (clamped < 100 && status === 'completed') {
      setStatus('in_progress');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请输入任务名称');
      return;
    }
    if (dateInvalid) {
      setError('计划开始日期不能晚于截止日期 (DDL)');
      return;
    }

    setSaving(true);
    try {
      const tags = tagsInput
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      let saved: Task | undefined;
      if (isEdit && task) {
        saved = await updateTask(
          task.id,
          {
            title,
            description,
            projectId: projectId || null,
            plannedStartDate: plannedStartDate || null,
            plannedEndDate: plannedEndDate || null,
            priority,
            status,
            progress,
            tags,
            notes,
          },
          { scheduleReason }
        );
      } else {
        saved = await createTask({
          title,
          description,
          projectId: projectId || null,
          plannedStartDate: plannedStartDate || null,
          plannedEndDate: plannedEndDate || null,
          priority,
          status,
          progress,
          tags,
          notes,
        });
      }
      if (saved && onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      console.error('Failed to save task:', err);
      setError('保存失败，请检查网络连接后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? '编辑任务' : '新建任务'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Task Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              任务名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="输入任务名称，例如：完成本周方案初稿"
              autoFocus
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
          </div>

          {/* Core quick fields: Dates & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                计划开始日期
              </label>
              <input
                type="date"
                value={plannedStartDate}
                onChange={(e) => setPlannedStartDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                截止日期 (DDL)
              </label>
              <input
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  dateInvalid
                    ? 'border-rose-400 dark:border-rose-600'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
            </div>
          </div>

          {dateInvalid && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              提示：计划开始日期晚于截止日期，请调整后再保存。
            </p>
          )}

          {datesChanged && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                日期调整原因（可选，将记录到计划变更历史）
              </label>
              <input
                type="text"
                value={scheduleReason}
                onChange={(e) => setScheduleReason(e.target.value)}
                placeholder="例如：需求范围调整 / 优先级变更"
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          )}

          {/* Priority segmented selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              优先级
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((p) => {
                const meta = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                      active
                        ? `${meta.bgClass} ${meta.textClass} ${meta.borderClass} ring-2 ring-offset-1 ring-blue-500/30 dark:ring-offset-slate-900`
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{p}</span>
                    <span>{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                所属项目
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="">未归类项目</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                任务状态
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_META[st].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Collapsible Advanced Fields */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border-t border-slate-100 dark:border-slate-800"
          >
            <span>更多字段（进度、描述、标签、备注）</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-1">
              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    当前进度
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(e) => handleProgressChange(Number(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-right text-xs font-mono-num text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => handleProgressChange(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex items-center justify-between gap-1.5 mt-1.5">
                  {[0, 25, 50, 75, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleProgressChange(val)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono-num border transition-colors ${
                        progress === val
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  任务描述
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="任务目标与拆解说明..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  标签（用逗号或空格分隔）
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="例如：设计, 重要, 本周"
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  备注
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="补充记录或注意事项..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 pb-safe flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || dateInvalid}
              className="min-h-[44px] px-5 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : isEdit ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
