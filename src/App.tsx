import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarRange,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Settings,
  WifiOff,
} from 'lucide-react';
import { db, DEFAULT_SETTINGS, initializeDatabase } from './db/database';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { NavTab, Task, TaskFilterState } from './types/models';
import { toLocalDateString } from './utils/dateUtils';
import { DEFAULT_FILTERS } from './utils/taskFilters';
import { PWAInstallButton } from './components/common/PWAInstallButton';
import { DashboardView } from './components/dashboard/DashboardView';
import { ProjectsView } from './components/projects/ProjectsView';
import { SettingsView } from './components/settings/SettingsView';
import { TaskDetailSheet } from './components/tasks/TaskDetailSheet';
import { TaskFormModal } from './components/tasks/TaskFormModal';
import { TaskListView } from './components/tasks/TaskListView';
import { TimelineView } from './components/timeline/TimelineView';

const NAV_ITEMS: { key: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: '总览', icon: LayoutDashboard },
  { key: 'timeline', label: '时间轴', icon: CalendarRange },
  { key: 'tasks', label: '任务', icon: CheckSquare },
  { key: 'projects', label: '项目', icon: FolderKanban },
  { key: 'settings', label: '设置', icon: Settings },
];

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [taskFilters, setTaskFilters] = useState<TaskFilterState>(DEFAULT_FILTERS);

  // Task Form Modal state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalDefaults, setModalDefaults] = useState<{
    projectId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>({});

  const isOnline = useOnlineStatus();

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const progressLogs = useLiveQuery(() => db.progressLogs.toArray(), [], []);
  const activityNodes = useLiveQuery(() => db.activityNodes.toArray(), [], []);
  const scheduleLogs = useLiveQuery(() => db.scheduleLogs.toArray(), [], []);
  const settingsRecord = useLiveQuery(() => db.settings.get('default'), [], DEFAULT_SETTINGS);

  const settings = settingsRecord ?? DEFAULT_SETTINGS;

  // Apply light / dark / system theme to <html>
  useEffect(() => {
    const applyTheme = () => {
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark =
        settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', isDark);

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#0B0F17' : '#F8F9FA');
      }
    };

    applyTheme();

    if (settings.theme === 'system' && typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [settings.theme]);

  const openNewTaskModal = (defaults?: {
    projectId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }) => {
    setEditingTask(null);
    setModalDefaults(defaults ?? {});
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setModalDefaults({});
    setTaskModalOpen(true);
  };

  const handleNavigateTasksPreset = (preset: 'overdue' | 'today' | 'all') => {
    const today = toLocalDateString();
    if (preset === 'overdue') {
      setTaskFilters({ ...DEFAULT_FILTERS, overdueOnly: true });
    } else if (preset === 'today') {
      setTaskFilters({
        ...DEFAULT_FILTERS,
        dateFrom: today,
        dateTo: today,
        completedFilter: 'active',
      });
    } else {
      setTaskFilters(DEFAULT_FILTERS);
    }
    setActiveTab('tasks');
  };

  const dbStats = useMemo(
    () => ({
      tasks: tasks.length,
      projects: projects.length,
      progressLogs: progressLogs.length,
      activityNodes: activityNodes.length,
      scheduleLogs: scheduleLogs.length,
    }),
    [tasks.length, projects.length, progressLogs.length, activityNodes.length, scheduleLogs.length]
  );

  if (!dbReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8F9FA] dark:bg-[#0B0F17] text-sm text-slate-500">
        正在加载本地数据库...
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-[#F8F9FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-5 justify-between">
        <div className="space-y-6">
          <div className="px-3 flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              时序 ChronoPlan
            </span>
          </div>

          <div className="px-1">
            <button
              type="button"
              onClick={() => openNewTaskModal()}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>新建任务</span>
            </button>
          </div>

          <nav className="space-y-1" aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`w-full min-h-[42px] px-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors ${
                    active
                      ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-blue-600 dark:text-blue-400' : ''
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {projects.length > 0 && (
            <div className="px-2 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
              <div className="px-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                项目快捷跳转
              </div>
              {projects.slice(0, 6).map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(proj.id);
                    setActiveTab('projects');
                  }}
                  className="w-full px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center gap-2 text-left"
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: proj.color }}
                  />
                  <span className="truncate">{proj.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-2 space-y-2">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>离线模式运行中</span>
            </div>
          )}
          <PWAInstallButton variant="compact" />
        </div>
      </aside>

      {/* Mobile Sticky Header */}
      <header className="lg:hidden sticky top-0 z-30 h-12 pt-safe bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            时序
          </span>
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
              <WifiOff className="w-3 h-3" />
              <span>离线</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => openNewTaskModal()}
          className="inline-flex items-center gap-1 min-h-[34px] px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加任务</span>
        </button>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 lg:pl-60 pb-20 lg:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              tasks={tasks}
              projects={projects}
              progressLogs={progressLogs}
              activityNodes={activityNodes}
              settings={settings}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onOpenNewTaskModal={() => openNewTaskModal()}
              onNavigateTasks={handleNavigateTasksPreset}
              onNavigateProjects={(projId) => {
                if (projId) setSelectedProjectId(projId);
                setActiveTab('projects');
              }}
            />
          )}

          {activeTab === 'timeline' && (
            <TimelineView
              tasks={tasks}
              projects={projects}
              settings={settings}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onCreateTaskOnDate={(dateStr) =>
                openNewTaskModal({
                  startDate: dateStr ?? toLocalDateString(),
                  endDate: dateStr ?? toLocalDateString(),
                })
              }
            />
          )}

          {activeTab === 'tasks' && (
            <TaskListView
              tasks={tasks}
              projects={projects}
              settings={settings}
              filters={taskFilters}
              onChangeFilters={setTaskFilters}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onOpenNewTaskModal={() => openNewTaskModal()}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              tasks={tasks}
              settings={settings}
              selectedProjectId={selectedProjectId}
              onSelectProjectId={setSelectedProjectId}
              onSelectTask={(id) => setSelectedTaskId(id)}
              onCreateTaskInProject={(projId) => openNewTaskModal({ projectId: projId })}
              onFilterTasksByProject={(projId) => {
                setTaskFilters({ ...DEFAULT_FILTERS, projectId: projId });
                setActiveTab('tasks');
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView settings={settings} stats={dbStats} />
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar with Safe Area */}
      <nav
        aria-label="底部主导航"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-14 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Task Creation / Edit Modal */}
      <TaskFormModal
        open={taskModalOpen}
        task={editingTask}
        projects={projects}
        defaultProjectId={modalDefaults.projectId}
        defaultStartDate={modalDefaults.startDate}
        defaultEndDate={modalDefaults.endDate}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
      />

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        projects={projects}
        settings={settings}
        onClose={() => setSelectedTaskId(null)}
        onEditTask={(task) => openEditTaskModal(task)}
      />
    </div>
  );
}
