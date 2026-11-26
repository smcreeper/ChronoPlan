import React, { useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  clearAllData,
  exportAllData,
  importAllData,
  seedSampleData,
  updateSettings,
  validateExportBundle,
} from '../../db/database';
import {
  AppSettings,
  DateFormatOption,
  ExportBundle,
  ThemeMode,
  TimeFormatOption,
  TimelineScale,
  WeekStartOption,
} from '../../types/models';
import { APP_VERSION } from '../../utils/constants';
import { toLocalDateString } from '../../utils/dateUtils';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  cloudUser: User | null;
  syncState: 'local' | 'syncing' | 'synced' | 'error';
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  stats: {
    tasks: number;
    projects: number;
    progressLogs: number;
    activityNodes: number;
    scheduleLogs: number;
  };
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  cloudUser,
  syncState,
  onSignIn,
  onSignOut,
  stats,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<ExportBundle | null>(null);
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);

  const handleExportJson = async () => {
    try {
      const bundle = await exportAllData();
      const jsonStr = JSON.stringify(bundle, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronoplan-backup-${toLocalDateString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage({
        type: 'success',
        text: `已成功导出全部本地数据（${bundle.data.tasks.length} 项任务、${bundle.data.projects.length} 个项目）。`,
      });
    } catch {
      setStatusMessage({ type: 'error', text: '导出 JSON 文件失败，请稍后重试。' });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateExportBundle(parsed)) {
        setStatusMessage({
          type: 'error',
          text: '导入失败：文件内容不符合 ChronoPlan 备份数据结构。',
        });
        return;
      }
      setPendingImport(parsed);
      setStatusMessage(null);
    } catch {
      setStatusMessage({
        type: 'error',
        text: '导入失败：无法解析 JSON 文件，请确认文件格式有效。',
      });
    }
  };

  const executeImport = async (mode: 'merge' | 'overwrite') => {
    if (!pendingImport) return;
    try {
      const res = await importAllData(pendingImport, mode);
      setPendingImport(null);
      setStatusMessage({
        type: 'success',
        text:
          mode === 'overwrite'
            ? `已覆盖导入 ${res.importedTasks} 项任务与 ${res.importedProjects} 个项目。`
            : `已合并导入 ${res.importedTasks} 项新任务与 ${res.importedProjects} 个新项目（跳过 ${res.skippedTasks} 项重复任务）。`,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: '写入本地数据库时发生异常，导入已取消。',
      });
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">设置与数据管理</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          支持登录 Google 账号进行跨网页端实时云同步，并保留离线本地缓存与 JSON 备份能力
        </p>
      </div>

      {/* Web Cloud Sync Section */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                cloudUser
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {cloudUser ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {cloudUser ? '网页端云同步已开启' : '当前仅本地浏览器存储'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {cloudUser
                  ? `已绑定账号：${cloudUser.email || cloudUser.displayName || 'Google 用户'}（${
                      syncState === 'syncing'
                        ? '正在同步...'
                        : syncState === 'error'
                        ? '同步出错'
                        : '每次打开网页端自动同步最新任务与进度'
                    }）`
                  : '登录 Google 账号后，每次在任意电脑或手机浏览器打开网页，都将显示完全一致的任务与进度。'}
              </div>
            </div>
          </div>

          {cloudUser ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>退出云同步</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shrink-0 whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>登录 Google 开启同步</span>
            </button>
          )}
        </div>
      </section>

      {statusMessage && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Appearance & Time Preferences */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">外观主题</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              默认浅色，可切换深色或跟随系统设置
            </div>
          </div>
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start sm:self-auto">
            {(
              [
                { key: 'light', label: '浅色' },
                { key: 'dark', label: '深色' },
                { key: 'system', label: '跟随系统' },
              ] as { key: ThemeMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => updateSettings({ theme: opt.key })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  settings.theme === opt.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">日期显示格式</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">影响列表与详情中的日期展示</div>
          </div>
          <select
            value={settings.dateFormat}
            onChange={(e) => updateSettings({ dateFormat: e.target.value as DateFormatOption })}
            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
          >
            <option value="zh">11月26日（中文自然格式）</option>
            <option value="iso">2026-11-26（标准 ISO）</option>
            <option value="slash">2026/11/26</option>
          </select>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">时间显示制式</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">活动节点与进度记录的时间格式</div>
          </div>
          <select
            value={settings.timeFormat}
            onChange={(e) => updateSettings({ timeFormat: e.target.value as TimeFormatOption })}
            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
          >
            <option value="24h">24 小时制 (18:54)</option>
            <option value="12h">12 小时制 (下午 6:54)</option>
          </select>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">一周起始日</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">时间轴周视图的起始对齐日</div>
          </div>
          <select
            value={settings.weekStartsOn}
            onChange={(e) =>
              updateSettings({ weekStartsOn: Number(e.target.value) as WeekStartOption })
            }
            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
          >
            <option value={1}>周一</option>
            <option value={0}>周日</option>
          </select>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">默认时间轴视图</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">进入时间轴页面时默认展示尺度</div>
          </div>
          <select
            value={settings.defaultTimelineScale}
            onChange={(e) =>
              updateSettings({ defaultTimelineScale: e.target.value as TimelineScale })
            }
            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
          >
            <option value="day">日视图</option>
            <option value="week">周视图（手机推荐）</option>
            <option value="month">月视图</option>
            <option value="quarter">季度视图</option>
            <option value="year">年视图</option>
          </select>
        </div>
      </section>

      {/* PWA & Mobile Install */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              安装到手机主屏幕与离线运行
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              支持以独立应用窗口启动，核心任务、甘特图与记录功能在无网络环境下依然可用
            </p>
          </div>
          <PWAInstallButton />
        </div>
      </section>

      {/* Data Backup, Export & Import */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            本地数据备份与迁移
          </h2>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-400">任务</div>
              <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.tasks}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-400">项目</div>
              <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.projects}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-400">进度记录</div>
              <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.progressLogs}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-400">活动节点</div>
              <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.activityNodes}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-400">日期调整</div>
              <div className="font-mono-num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {stats.scheduleLogs}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            重要提醒：本地数据仅保存在当前浏览器 IndexedDB 存储中，若清除浏览器缓存、卸载浏览器或更换设备可能会导致数据丢失。建议定期点击下方「导出 JSON 备份」妥善保存。
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90"
          >
            <Download className="w-4 h-4" />
            <span>导出 JSON 备份</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Upload className="w-4 h-4" />
            <span>导入 JSON 恢复</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            className="hidden"
          />

          <button
            type="button"
            onClick={async () => {
              await seedSampleData();
              setStatusMessage({ type: 'success', text: '已补充写入一组示例项目与任务数据。' });
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>载入示例数据</span>
          </button>

          <button
            type="button"
            onClick={() => setWipeStep(1)}
            className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/70 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空全部数据</span>
          </button>
        </div>
      </section>

      {/* Version Info */}
      <div className="text-center sm:text-left text-xs text-slate-400 dark:text-slate-500 pt-1">
        时序 ChronoPlan · 版本 v{APP_VERSION} · 纯本地离线个人规划工具
      </div>

      {/* Import Choice Dialog */}
      {pendingImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setPendingImport(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              选择数据导入方式
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              已校验备份文件：包含 <strong className="font-mono-num">{pendingImport.data.tasks.length}</strong> 项任务、
              <strong className="font-mono-num">{pendingImport.data.projects.length}</strong> 个项目、
              <strong className="font-mono-num">{pendingImport.data.progressLogs.length}</strong> 条进度记录与
              <strong className="font-mono-num">{pendingImport.data.activityNodes.length}</strong> 条活动节点。
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => executeImport('merge')}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  合并导入（推荐）
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  保留现有数据，仅新增不重复 ID 的任务、项目与关联历史
                </div>
              </button>

              <button
                type="button"
                onClick={() => executeImport('overwrite')}
                className="w-full text-left rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/40 dark:bg-rose-950/20 p-3 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <div className="text-sm font-medium text-rose-700 dark:text-rose-300">
                  覆盖现有数据
                </div>
                <div className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                  清空当前设备所有任务与项目，完全替换为备份文件内容
                </div>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              className="w-full min-h-[40px] rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              取消导入
            </button>
          </div>
        </div>
      )}

      {/* 2-Step Clear Data Confirmation */}
      <ConfirmDialog
        open={wipeStep === 1}
        title="确认清空全部本地数据？"
        description="这将删除所有任务、项目、进度历史、活动节点与日期调整记录。"
        confirmLabel="继续"
        danger
        onConfirm={() => setWipeStep(2)}
        onCancel={() => setWipeStep(0)}
      />

      <ConfirmDialog
        open={wipeStep === 2}
        title="最终确认：不可恢复的清空操作"
        description="请确认您已提前导出 JSON 备份。点击「彻底清空」后本地数据将立即永久清除。"
        confirmLabel="彻底清空"
        danger
        onConfirm={async () => {
          await clearAllData();
          setWipeStep(0);
          setStatusMessage({ type: 'success', text: '已清空所有本地任务与项目数据。' });
        }}
        onCancel={() => setWipeStep(0)}
      />
    </div>
  );
};
