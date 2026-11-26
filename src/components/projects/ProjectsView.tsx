import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FolderPlus,
  Plus,
  Trash2,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  createProject,
  deleteProject,
  toggleCompleteTask,
  updateProject,
} from '../../db/database';
import { AppSettings, Project, ProjectStatus, Task } from '../../types/models';
import { PROJECT_COLORS, PROJECT_STATUS_META } from '../../utils/constants';
import { formatPlannedDate, getDdlUrgency, toLocalDateString } from '../../utils/dateUtils';
import { DdlBadge, PriorityLabel, StatusLabel } from '../common/Badges';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ProjectsViewProps {
  projects: Project[];
  tasks: Task[];
  settings: AppSettings;
  selectedProjectId: string | null;
  onSelectProjectId: (id: string | null) => void;
  onSelectTask: (taskId: string) => void;
  onCreateTaskInProject: (projectId: string) => void;
  onFilterTasksByProject: (projectId: string) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  tasks,
  settings,
  selectedProjectId,
  onSelectProjectId,
  onSelectTask,
  onCreateTaskInProject,
  onFilterTasksByProject,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0].hex);
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [progressMode, setProgressMode] = useState<'auto' | 'manual'>('auto');
  const [manualProgress, setManualProgress] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [unlinkTasksOnDelete, setUnlinkTasksOnDelete] = useState(true);

  const todayStr = toLocalDateString();

  const openCreateModal = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setColor(PROJECT_COLORS[projects.length % PROJECT_COLORS.length].hex);
    setStatus('active');
    setProgressMode('auto');
    setManualProgress(0);
    setShowForm(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setDescription(project.description);
    setColor(project.color);
    setStatus(project.status);
    setProgressMode(project.progressMode);
    setManualProgress(project.manualProgress);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingProject) {
      await updateProject(editingProject.id, {
        name,
        description,
        color,
        status,
        progressMode,
        manualProgress,
      });
    } else {
      await createProject({
        name,
        description,
        color,
        status,
        progressMode,
        manualProgress,
      });
    }
    setShowForm(false);
  };

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedProjectTasks = useMemo(
    () =>
      selectedProject
        ? tasks.filter((t) => t.projectId === selectedProject.id)
        : [],
    [tasks, selectedProject]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">项目管理</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            共 {projects.length} 个项目 · 支持自动完成率统计或手动设置进度
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
        >
          <FolderPlus className="w-4 h-4" />
          <span>新建项目</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-12 px-4 text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            还没有创建项目，新建项目可以更好地归类与追踪长期任务进度。
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>创建第一个项目</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Project Cards */}
          <div className="lg:col-span-5 space-y-3">
            {projects.map((proj) => {
              const pTasks = tasks.filter((t) => t.projectId === proj.id);
              const doneCount = pTasks.filter((t) => t.status === 'completed').length;
              const autoPct = pTasks.length === 0 ? 0 : Math.round((doneCount / pTasks.length) * 100);
              const displayPct = proj.progressMode === 'manual' ? proj.manualProgress : autoPct;
              const isSelected = selectedProjectId === proj.id;
              const stMeta = PROJECT_STATUS_META[proj.status];

              return (
                <div
                  key={proj.id}
                  className={`rounded-2xl bg-white dark:bg-slate-900 border p-4 transition-colors ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/15'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectProjectId(isSelected ? null : proj.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: proj.color }}
                        />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {proj.name}
                        </h3>
                        <span className={`text-xs font-medium shrink-0 ${stMeta.textClass}`}>
                          · {stMeta.label}
                        </span>
                      </div>
                      {proj.description && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {proj.description}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(proj)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        aria-label="编辑项目"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUnlinkTasksOnDelete(true);
                          setDeleteTarget(proj);
                        }}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        aria-label="删除项目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        任务完成 {doneCount}/{pTasks.length}
                        {proj.progressMode === 'manual' ? ' · 手动进度' : ' · 自动计算'}
                      </span>
                      <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                        {displayPct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${displayPct}%`, backgroundColor: proj.color }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onCreateTaskInProject(proj.id)}
                      className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>添加任务</span>
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onFilterTasksByProject(proj.id)}
                        className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        在列表中筛选
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectProjectId(isSelected ? null : proj.id)}
                        className="inline-flex items-center gap-0.5 font-medium text-slate-900 dark:text-slate-100"
                      >
                        <span>{isSelected ? '收起任务' : '查看任务'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Project Tasks Panel */}
          <div className="lg:col-span-7">
            {selectedProject ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0"
                      style={{ backgroundColor: selectedProject.color }}
                    />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {selectedProject.name} · 关联任务 ({selectedProjectTasks.length})
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateTaskInProject(selectedProject.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增任务</span>
                  </button>
                </div>

                {selectedProjectTasks.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    该项目下暂无任务，点击右上角「新增任务」即可关联。
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedProjectTasks.map((task) => {
                      const urgency = getDdlUrgency(task, todayStr);
                      return (
                        <div
                          key={task.id}
                          className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCompleteTask(task.id)}
                            className={`w-6 h-6 min-w-[24px] rounded-lg border flex items-center justify-center transition-colors ${
                              task.status === 'completed'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {task.status === 'completed' && <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectTask(task.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-sm font-medium truncate ${
                                  task.status === 'completed'
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {task.title}
                              </span>
                              <span className="text-xs font-mono-num text-slate-500 shrink-0">
                                {task.progress}%
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <PriorityLabel priority={task.priority} compact />
                              <StatusLabel status={task.status} />
                              {task.plannedEndDate && (
                                <span className="font-mono-num">
                                  DDL {formatPlannedDate(task.plannedEndDate, settings.dateFormat, todayStr)}
                                </span>
                              )}
                              <DdlBadge urgency={urgency} />
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden lg:flex rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 px-6 items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                点击左侧任意项目卡片上的「查看任务」，即可在此查看并管理该项目下的全部任务。
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 pb-safe shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingProject ? '编辑项目' : '新建项目'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  项目名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="例如：个人产品开发、日语N2备考"
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  项目说明
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="项目目标与范围..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  项目识别色（独立于任务优先级颜色）
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      title={c.name}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform ${
                        color === c.hex ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-900 scale-105' : ''
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {color === c.hex && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    项目状态
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-sm"
                  >
                    {Object.entries(PROJECT_STATUS_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    进度计算方式
                  </label>
                  <select
                    value={progressMode}
                    onChange={(e) => setProgressMode(e.target.value as 'auto' | 'manual')}
                    className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-sm"
                  >
                    <option value="auto">按任务完成率自动计算</option>
                    <option value="manual">手动设置进度</option>
                  </select>
                </div>
              </div>

              {progressMode === 'manual' && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">手动项目进度</span>
                    <span className="font-mono-num font-semibold">{manualProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={manualProgress}
                    onChange={(e) => setManualProgress(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  {editingProject ? '保存修改' : '创建项目'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除项目？"
        description={
          deleteTarget
            ? `将删除项目「${deleteTarget.name}」，关联任务及其历史记录不会被删除。`
            : ''
        }
        confirmLabel="确认删除"
        danger
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteProject(deleteTarget.id, unlinkTasksOnDelete);
            if (selectedProjectId === deleteTarget.id) onSelectProjectId(null);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      >
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={unlinkTasksOnDelete}
            onChange={(e) => setUnlinkTasksOnDelete(e.target.checked)}
            className="rounded accent-blue-600"
          />
          <span>同时移除关联任务的所属项目归属（保留任务与所有历史记录）</span>
        </label>
      </ConfirmDialog>
    </div>
  );
};
