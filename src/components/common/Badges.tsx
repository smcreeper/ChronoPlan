import React from 'react';
import { AlertCircle, Clock, Flag, Pause, Play, Check, Circle } from 'lucide-react';
import { DdlUrgency, Project, TaskPriority, TaskStatus } from '../../types/models';
import { DDL_URGENCY_META, PRIORITY_META, STATUS_META } from '../../utils/constants';

export const PriorityLabel: React.FC<{ priority: TaskPriority; compact?: boolean }> = ({
  priority,
  compact = false,
}) => {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
    >
      <Flag className="w-3 h-3 shrink-0" />
      <span>{compact ? `${priority} ${meta.shortLabel}` : `${priority} · ${meta.shortLabel}`}</span>
    </span>
  );
};

export const StatusLabel: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const meta = STATUS_META[status];
  const Icon =
    status === 'completed'
      ? Check
      : status === 'in_progress'
      ? Play
      : status === 'paused'
      ? Pause
      : Circle;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap shrink-0 ${meta.textClass}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
};

export const DdlBadge: React.FC<{ urgency: DdlUrgency }> = ({ urgency }) => {
  const meta = DDL_URGENCY_META[urgency];
  if (!meta.showBadge) return null;
  const Icon = urgency === 'overdue' ? AlertCircle : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap shrink-0 ${meta.textClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
};

export const ProjectLabel: React.FC<{ project?: Project | null }> = ({ project }) => {
  if (!project) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0 max-w-[140px]">
      <span
        className="w-2 h-2 rounded-xs shrink-0"
        style={{ backgroundColor: project.color }}
        aria-hidden="true"
      />
      <span className="truncate">{project.name}</span>
    </span>
  );
};
