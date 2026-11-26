import { AppSettings, DdlUrgency, Task } from '../types/models';

/**
 * Returns local YYYY-MM-DD for a Date object (default: now).
 * Never uses toISOString() slice to prevent UTC date shift bugs.
 */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses YYYY-MM-DD into a local Date at 00:00:00 local time.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Returns number of calendar days between two YYYY-MM-DD strings (b - a).
 * Uses UTC noon internally to avoid DST hour-offset rounding issues.
 */
export function diffLocalDays(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const utcStart = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
  const utcEnd = Date.UTC(ey, em - 1, ed, 12, 0, 0);
  return Math.round((utcEnd - utcStart) / 86400000);
}

/**
 * Adds N calendar days to a YYYY-MM-DD string, returning local YYYY-MM-DD.
 */
export function addDaysToLocalDate(dateStr: string, days: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return toLocalDateString(dt);
}

/**
 * Adds N months to a Date safely.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return d;
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function getStartOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function getDdlUrgency(task: Pick<Task, 'status' | 'plannedEndDate'>, todayStr: string = toLocalDateString()): DdlUrgency {
  if (task.status === 'completed') {
    return 'completed';
  }
  if (!task.plannedEndDate) {
    return 'none';
  }
  const daysLeft = diffLocalDays(todayStr, task.plannedEndDate);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'due_today';
  if (daysLeft <= 3) return 'due_3d';
  if (daysLeft <= 7) return 'due_7d';
  return 'upcoming';
}

export function isTaskOverdue(task: Pick<Task, 'status' | 'plannedEndDate'>, todayStr: string = toLocalDateString()): boolean {
  return getDdlUrgency(task, todayStr) === 'overdue';
}

export function isTaskUnscheduled(task: Pick<Task, 'plannedStartDate' | 'plannedEndDate'>): boolean {
  return !task.plannedStartDate || !task.plannedEndDate;
}

export function formatPlannedDate(
  dateStr: string | null,
  dateFormat: AppSettings['dateFormat'] = 'zh',
  todayStr: string = toLocalDateString()
): string {
  if (!dateStr) return '未设置';
  const [y, m, d] = dateStr.split('-').map(Number);
  const currentYear = Number(todayStr.slice(0, 4));
  if (dateFormat === 'iso') return dateStr;
  if (dateFormat === 'slash') return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
  if (y !== currentYear) {
    return `${y}年${m}月${d}日`;
  }
  return `${m}月${d}日`;
}

export function formatTimestamp(
  isoStr: string | null,
  options?: Pick<AppSettings, 'dateFormat' | 'timeFormat'>
): string {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '—';

  const now = new Date();
  const todayStr = toLocalDateString(now);
  const yesterdayStr = addDaysToLocalDate(todayStr, -1);
  const targetStr = toLocalDateString(dt);

  const dateFormat = options?.dateFormat ?? 'zh';
  const timeFormat = options?.timeFormat ?? '24h';

  const hours24 = dt.getHours();
  const minutes = String(dt.getMinutes()).padStart(2, '0');
  let timePart = `${String(hours24).padStart(2, '0')}:${minutes}`;
  if (timeFormat === '12h') {
    const period = hours24 >= 12 ? '下午' : '上午';
    const h12 = hours24 % 12 || 12;
    timePart = `${period} ${h12}:${minutes}`;
  }

  let datePart = '';
  if (targetStr === todayStr) {
    datePart = '今天';
  } else if (targetStr === yesterdayStr) {
    datePart = '昨天';
  } else {
    datePart = formatPlannedDate(targetStr, dateFormat, todayStr);
  }

  return `${datePart} ${timePart}`;
}

export function toLocalDateTimeInputValue(isoStr?: string): string {
  const dt = isoStr ? new Date(isoStr) : new Date();
  if (Number.isNaN(dt.getTime())) return toLocalDateTimeInputValue();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function fromLocalDateTimeInputValue(val: string): string {
  const dt = new Date(val);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

/**
 * Computes planned elapsed time percentage reference (0 - 100) for tasks that have both start & end dates.
 * Explicitly represents planned schedule consumption, NOT actual task completion.
 */
export function computePlannedTimeProgress(
  startStr: string | null,
  endStr: string | null,
  todayStr: string = toLocalDateString()
): number | null {
  if (!startStr || !endStr) return null;
  const totalDays = diffLocalDays(startStr, endStr);
  if (totalDays <= 0) {
    return diffLocalDays(startStr, todayStr) >= 0 ? 100 : 0;
  }
  const elapsed = diffLocalDays(startStr, todayStr);
  const ratio = Math.round((elapsed / totalDays) * 100);
  return Math.max(0, Math.min(100, ratio));
}

export function getWeekdayShortZh(dayIndex0: number): string {
  return ['日', '一', '二', '三', '四', '五', '六'][dayIndex0] ?? '';
}

export function countDeferrals(scheduleLogs: { oldEndDate: string | null; newEndDate: string | null }[]): number {
  return scheduleLogs.filter(
    (log) => log.oldEndDate && log.newEndDate && diffLocalDays(log.oldEndDate, log.newEndDate) > 0
  ).length;
}
