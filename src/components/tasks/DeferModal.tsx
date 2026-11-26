import React, { useEffect, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { deferTaskDeadline } from '../../db/database';
import { AppSettings, Task } from '../../types/models';
import { addDaysToLocalDate, diffLocalDays, formatPlannedDate, toLocalDateString } from '../../utils/dateUtils';

interface DeferModalProps {
  open: boolean;
  task: Task | null;
  settings: AppSettings;
  onClose: () => void;
}

export const DeferModal: React.FC<DeferModalProps> = ({ open, task, settings, onClose }) => {
  const [newEndDate, setNewEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !task) return;
    const base = task.plannedEndDate ?? toLocalDateString();
    setNewEndDate(addDaysToLocalDate(base, 3));
    setReason('');
    setError('');
  }, [open, task]);

  if (!open || !task) return null;

  const baseDate = task.plannedEndDate ?? toLocalDateString();
  const invalidStartOrder =
    task.plannedStartDate !== null &&
    newEndDate !== '' &&
    diffLocalDays(task.plannedStartDate, newEndDate) < 0;

  const handleQuickDays = (days: number) => {
    setNewEndDate(addDaysToLocalDate(baseDate, days));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEndDate || invalidStartOrder) return;
    setSaving(true);
    setError('');
    try {
      await deferTaskDeadline(task.id, newEndDate, reason);
      onClose();
    } catch (err) {
      console.error('Failed to defer task:', err);
      setError('保存延期失败，请检查网络连接后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 pb-safe shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              延期截止日期 (DDL)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1">
            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
              {task.title}
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>原始 DDL：{formatPlannedDate(task.originalEndDate, settings.dateFormat)}</span>
              <span>当前 DDL：{formatPlannedDate(task.plannedEndDate, settings.dateFormat)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
              快速顺延
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 7, 14].map((d) => {
                const target = addDaysToLocalDate(baseDate, d);
                const selected = newEndDate === target;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleQuickDays(d)}
                    className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    +{d} 天
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              自定义新 DDL
            </label>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
            {invalidStartOrder && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                新 DDL 不能早于计划开始日期 ({task.plannedStartDate})
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              延期原因（可选）
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：修改范围增加、等待外部资料"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            延期仅调整当前 DDL 并保存变更历史，不会修改原进度记录、活动节点发生时间或开始日期。
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !newEndDate || invalidStartOrder}
              className="min-h-[44px] px-5 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '确认延期'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
