import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarRange,
  CheckSquare,
  Cloud,
  CloudOff,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Settings,
  WifiOff,
} from 'lucide-react';
import {
  cloudCollectionHasData,
  ensureUserProfileDoc,
  subscribeUserCloudData,
  uploadLocalSnapshotToCloud,
} from './db/cloudSync';
import {
  db,
  DEFAULT_SETTINGS,
  getLocalSnapshotBundle,
  initializeDatabase,
  replaceLocalActivityNodes,
  replaceLocalProgressLogs,
  replaceLocalProjects,
  replaceLocalScheduleLogs,
  replaceLocalSettings,
  replaceLocalTasks,
  setActiveCloudUid,
} from './db/database';
import { auth, signInWithGoogle, signOutUser } from './firebase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { NavTab, Task, TaskFilterState } from './types/models';
import { addDaysToLocalDate, toLocalDateString } from './utils/dateUtils';
import { DEFAULT_FILTERS } from './utils/taskFilters';
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
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncRetryNonce, setSyncRetryNonce] = useState(0);

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

  // Auth & Real-time Firestore Synchronization
  useEffect(() => {
    if (!dbReady) return;
    let unsubCloud: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubCloud) {
        unsubCloud();
        unsubCloud = null;
      }

      if (!user) {
        setCloudUser(null);
        setActiveCloudUid(null);
        setSyncState('local');
        return;
      }

      setCloudUser(user);
      setActiveCloudUid(user.uid);
      setSyncState('syncing');
      setSyncNotice(null);

      try {
        await ensureUserProfileDoc(user);
        const hasCloudData = await cloudCollectionHasData(user.uid);
        if (!hasCloudData) {
          const localBundle = await getLocalSnapshotBundle();
          if (localBundle.tasks.length > 0 || localBundle.projects.length > 0) {
            await uploadLocalSnapshotToCloud(user.uid, localBundle);
          }
        }

        if (cancelled) return;

        let projectsReady = false;
        let tasksReady = false;
        let listenerError = false;

        const maybeMarkSynced = () => {
          if (!cancelled && !listenerError && projectsReady && tasksReady) {
            setSyncState('synced');
            setSyncNotice(null);
          }
        };

        unsubCloud = subscribeUserCloudData(user.uid, {
          onProjects: (items) => {
            replaceLocalProjects(items).then(() => {
              projectsReady = true;
              maybeMarkSynced();
            });
          },
          onTasks: (items) => {
            replaceLocalTasks(items).then(() => {
              tasksReady = true;
              maybeMarkSynced();
            });
          },
          onProgressLogs: (items) => {
            replaceLocalProgressLogs(items);
          },
          onActivityNodes: (items) => {
            replaceLocalActivityNodes(items);
          },
          onScheduleLogs: (items) => {
            replaceLocalScheduleLogs(items);
          },
          onSettings: (item) => {
            if (item) replaceLocalSettings(item);
          },
          onError: (err) => {
            console.error('Cloud snapshot listener error:', err);
            listenerError = true;
            setSyncState('error');
            setSyncNotice('云同步连接失败，当前暂使用本地缓存。');
          },
        });
      } catch (err) {
        console.error('Cloud sync setup error:', err);
        setSyncState('error');
        setSyncNotice('云同步连接失败，当前暂使用本地缓存。');
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      if (unsubCloud) unsubCloud();
    };
  }, [dbReady, syncRetryNonce]);

  const handleSignIn = async () => {
    try {
      setSyncNotice(null);
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setSyncNotice('登录失败，请检查弹窗拦截设置或稍后重试。');
      }
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setSyncNotice(null);
  };

  const handleRetrySync = () => {
    setSyncNotice(null);
    setSyncRetryNonce((n) => n + 1);
  };

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
        正在初始化应用与同步引擎...
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
              <span>网络已断开（暂存当前设备）</span>
            </div>
          )}

          {cloudUser ? (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="w-full flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              {syncState === 'error' ? (
                <CloudOff className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              ) : (
                <Cloud
                  className={`w-4 h-4 shrink-0 ${
                    syncState === 'synced'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-slate-900 dark:text-slate-100 truncate">
                  {syncState === 'synced'
                    ? '已同步 · 网页端实时同步'
                    : syncState === 'syncing'
                    ? '已登录 · 正在同步...'
                    : syncState === 'error'
                    ? '已登录 · 云同步失败'
                    : '已登录'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {cloudUser.email}
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="w-full flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <CloudOff className="w-4 h-4 text-slate-400 shrink-0" />
              <span>登录开启网页同步</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sticky Header */}
      <header className="lg:hidden sticky top-0 z-30 h-12 pt-safe bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            时序
          </span>
          {!isOnline ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
              <WifiOff className="w-3 h-3" />
              <span>网络断开</span>
            </span>
          ) : cloudUser ? (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-1 text-[11px] whitespace-nowrap ${
                syncState === 'synced'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : syncState === 'error'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
            >
              {syncState === 'error' ? <CloudOff className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
              <span>
                {syncState === 'synced'
                  ? '已同步'
                  : syncState === 'syncing'
                  ? '已登录 · 同步中'
                  : syncState === 'error'
                  ? '已登录 · 同步失败'
                  : '已登录'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 whitespace-nowrap"
            >
              <CloudOff className="w-3 h-3" />
              <span>开启同步</span>
            </button>
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
          {syncNotice && (
            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
              <span>{syncNotice}</span>
              <div className="flex items-center gap-3 shrink-0">
                {cloudUser && syncState === 'error' && (
                  <button
                    type="button"
                    onClick={handleRetrySync}
                    className="font-medium text-blue-700 dark:text-blue-300 underline"
                  >
                    重试同步
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSyncNotice(null)}
                  className="text-amber-700 dark:text-amber-300 underline"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              tasks={tasks}
              projects={projects}
              progressLogs={progressLogs}
              activityNodes={activityNodes}
              settings={settings}
              cloudUser={cloudUser}
              onSignIn={handleSignIn}
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
              onCreateTaskOnDate={(dateStr) => {
                const start = dateStr ?? toLocalDateString();
                openNewTaskModal({
                  startDate: start,
                  endDate: addDaysToLocalDate(start, 7),
                });
              }}
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
            <SettingsView
              settings={settings}
              cloudUser={cloudUser}
              syncState={syncState}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onRetrySync={handleRetrySync}
              stats={dbStats}
            />
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
