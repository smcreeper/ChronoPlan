import React from 'react';
import { AppSettings, ProgressLog } from '../../types/models';
import { formatTimestamp } from '../../utils/dateUtils';

interface ProgressChartProps {
  logs: ProgressLog[];
  currentProgress: number;
  settings: AppSettings;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({
  logs,
  currentProgress,
  settings,
}) => {
  const sorted = [...logs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-5 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
        暂无进度记录，点击「记录进度」后将自动绘制进度变化曲线。
      </div>
    );
  }

  // Build points: if only 1 log, show baseline 0% -> log -> current if different
  const points = sorted.map((l) => ({
    value: l.progress,
    label: formatTimestamp(l.loggedAt, settings),
  }));

  if (points.length === 1) {
    points.unshift({ value: 0, label: '起点' });
  }

  const lastPoint = points[points.length - 1];
  if (lastPoint.value !== currentProgress) {
    points.push({ value: currentProgress, label: '当前' });
  }

  const width = 320;
  const height = 110;
  const padX = 16;
  const padY = 14;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const coords = points.map((p, idx) => {
    const x = points.length === 1 ? padX + plotW / 2 : padX + (idx / (points.length - 1)) * plotW;
    const y = padY + plotH - (p.value / 100) * plotH;
    return { x, y, ...p };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPoints = `${coords[0].x.toFixed(1)},${padY + plotH} ${polylinePoints} ${coords[coords.length - 1].x.toFixed(1)},${padY + plotH}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
        <span>实际进度变化曲线</span>
        <span className="font-mono-num">{points.length} 个采样点</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 overflow-visible" aria-label="进度变化曲线">
        {[0, 50, 100].map((tick) => {
          const ty = padY + plotH - (tick / 100) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padX}
                y1={ty}
                x2={width - padX}
                y2={ty}
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={2}
                y={ty + 3}
                fontSize="8"
                className="fill-slate-400 dark:fill-slate-500 font-mono-num"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        <polygon
          points={areaPoints}
          className="fill-blue-500/10 dark:fill-blue-400/10"
        />
        <polyline
          fill="none"
          stroke="#2563EB"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />

        {coords.map((c, idx) => (
          <g key={idx}>
            <circle
              cx={c.x}
              cy={c.y}
              r="3.5"
              className="fill-white dark:fill-slate-900 stroke-blue-600 dark:stroke-blue-400"
              strokeWidth="2"
            />
            <title>{`${c.label}: ${c.value}%`}</title>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
        <span className="truncate max-w-[45%]">{coords[0].label}</span>
        <span className="truncate max-w-[45%] text-right">{coords[coords.length - 1].label}</span>
      </div>
    </div>
  );
};
