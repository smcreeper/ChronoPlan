import Dexie, { Table } from 'dexie';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firestoreDb, handleFirestoreError, OperationType } from '../firebase';
import {
  ActivityNode,
  AppMeta,
  AppSettings,
  ExportBundle,
  ProgressLog,
  Project,
  ProjectStatus,
  ScheduleLog,
  Task,
  TaskPriority,
  TaskStatus,
} from '../types/models';
import { EXPORT_SCHEMA_VERSION } from '../utils/constants';
import { addDaysToLocalDate, toLocalDateString } from '../utils/dateUtils';
import {
  clearCloudUserData,
  deleteCloudDoc,
  toFirestoreActivityNodePayload,
  toFirestoreProgressLogPayload,
  toFirestoreProjectPayload,
  toFirestoreScheduleLogPayload,
  toFirestoreSettingsPayload,
  toFirestoreTaskPayload,
  uploadLocalSnapshotToCloud,
} from './cloudSync';

export class ChronoPlanDB extends Dexie {
  tasks!: Table<Task, string>;
  projects!: Table<Project, string>;
  progressLogs!: Table<ProgressLog, string>;
  activityNodes!: Table<ActivityNode, string>;
  scheduleLogs!: Table<ScheduleLog, string>;
  settings!: Table<AppSettings, string>;
  meta!: Table<AppMeta, string>;

  constructor() {
    super('ChronoPlanLocalDB');
    this.version(1).stores({
      tasks: 'id, title, projectId, plannedStartDate, plannedEndDate, priority, status, progress, *tags, createdAt, updatedAt, completedAt',
      projects: 'id, name, status, color, createdAt, updatedAt',
      progressLogs: 'id, taskId, progress, loggedAt, createdAt, updatedAt',
      activityNodes: 'id, taskId, title, eventAt, createdAt, updatedAt',
      scheduleLogs: 'id, taskId, oldStartDate, newStartDate, oldEndDate, newEndDate, changedAt',
      settings: 'id',
      meta: 'key',
    });
  }
}

export const db = new ChronoPlanDB();

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  theme: 'light',
  dateFormat: 'zh',
  timeFormat: '24h',
  weekStartsOn: 1,
  defaultTimelineScale: 'week',
  updatedAt: new Date().toISOString(),
};

let activeCloudUid: string | null = null;

export function setActiveCloudUid(uid: string | null): void {
  activeCloudUid = uid;
}

export function getActiveCloudUid(): string | null {
  return activeCloudUid;
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// Cloud-to-local snapshot sync helpers
export async function replaceLocalProjects(items: Project[]): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    await db.projects.clear();
    if (items.length) await db.projects.bulkPut(items);
  });
}

export async function replaceLocalTasks(items: Task[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    await db.tasks.clear();
    if (items.length) await db.tasks.bulkPut(items);
  });
}

export async function replaceLocalProgressLogs(items: ProgressLog[]): Promise<void> {
  await db.transaction('rw', db.progressLogs, async () => {
    await db.progressLogs.clear();
    if (items.length) await db.progressLogs.bulkPut(items);
  });
}

export async function replaceLocalActivityNodes(items: ActivityNode[]): Promise<void> {
  await db.transaction('rw', db.activityNodes, async () => {
    await db.activityNodes.clear();
    if (items.length) await db.activityNodes.bulkPut(items);
  });
}

export async function replaceLocalScheduleLogs(items: ScheduleLog[]): Promise<void> {
  await db.transaction('rw', db.scheduleLogs, async () => {
    await db.scheduleLogs.clear();
    if (items.length) await db.scheduleLogs.bulkPut(items);
  });
}

export async function replaceLocalSettings(item: AppSettings | null): Promise<void> {
  if (item) {
    await db.settings.put(item);
  }
}

export async function getLocalSnapshotBundle() {
  const [projects, tasks, progressLogs, activityNodes, scheduleLogs, settings] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.progressLogs.toArray(),
    db.activityNodes.toArray(),
    db.scheduleLogs.toArray(),
    db.settings.get('default'),
  ]);
  return {
    projects,
    tasks,
    progressLogs,
    activityNodes,
    scheduleLogs,
    settings: settings ?? DEFAULT_SETTINGS,
  };
}

// Ensure settings and initial seed (only once on virgin DB)
let initPromise: Promise<void> | null = null;

export async function initializeDatabase(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const existingSettings = await db.settings.get('default');
    if (!existingSettings) {
      await db.settings.put({
        ...DEFAULT_SETTINGS,
        updatedAt: new Date().toISOString(),
      });
    }

    const seededFlag = await db.meta.get('initial_seeded');
    if (!seededFlag) {
      const taskCount = await db.tasks.count();
      const projectCount = await db.projects.count();
      if (taskCount === 0 && projectCount === 0) {
        await seedSampleData();
      }
      await db.meta.put({ key: 'initial_seeded', value: 'true' });
    }
  })();
  return initPromise;
}

export async function seedSampleData(): Promise<void> {
  const today = toLocalDateString();
  const now = new Date();
  const iso = (daysOffset: number, hour = 10, min = 30) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset, hour, min, 0);
    return d.toISOString();
  };

  const pWorkId = createId('proj');
  const pStudyId = createId('proj');
  const pLifeId = createId('proj');

  const projects: Project[] = [
    {
      id: pWorkId,
      name: '个人作品集网站改版',
      description: '重构个人主页、案例研究排版与离线访问能力',
      color: '#4F46E5',
      status: 'active',
      progressMode: 'auto',
      manualProgress: 0,
      createdAt: iso(-12, 9, 0),
      updatedAt: iso(-1, 16, 20),
    },
    {
      id: pStudyId,
      name: 'TypeScript 工程实践学习',
      description: '深入类型体操、离线存储与 PWA 缓存策略',
      color: '#0D9488',
      status: 'active',
      progressMode: 'auto',
      manualProgress: 0,
      createdAt: iso(-8, 14, 0),
      updatedAt: iso(0, 9, 15),
    },
    {
      id: pLifeId,
      name: '年底生活整理与旅行准备',
      description: '跨年出行清单、证件检查与家居整理',
      color: '#9333EA',
      status: 'active',
      progressMode: 'auto',
      manualProgress: 0,
      createdAt: iso(-5, 20, 0),
      updatedAt: iso(-2, 11, 0),
    },
  ];

  const t1Id = createId('task');
  const t2Id = createId('task');
  const t3Id = createId('task');
  const t4Id = createId('task');
  const t5Id = createId('task');
  const t6Id = createId('task');

  const tasks: Task[] = [
    {
      id: t1Id,
      title: '完成交互原型与信息架构定稿',
      description: '梳理首页总览、时间轴与详情页交互流程，输出可点击草图。',
      projectId: pWorkId,
      plannedStartDate: addDaysToLocalDate(today, -6),
      plannedEndDate: addDaysToLocalDate(today, 2),
      originalStartDate: addDaysToLocalDate(today, -6),
      originalEndDate: addDaysToLocalDate(today, -1),
      priority: 'P1',
      status: 'in_progress',
      progress: 70,
      tags: ['设计', '原型'],
      notes: '重点确认手机端单手操作底部栏高度与甘特图横滑体验。',
      createdAt: iso(-7, 9, 10),
      updatedAt: iso(-1, 18, 30),
      completedAt: null,
    },
    {
      id: t2Id,
      title: '整理季度复盘文档并输出明年OKR',
      description: '汇总过去三个月项目完成度、时间估算偏差与改进点。',
      projectId: pWorkId,
      plannedStartDate: addDaysToLocalDate(today, -9),
      plannedEndDate: addDaysToLocalDate(today, -2),
      originalStartDate: addDaysToLocalDate(today, -9),
      originalEndDate: addDaysToLocalDate(today, -2),
      priority: 'P1',
      status: 'in_progress',
      progress: 45,
      tags: ['复盘', '写作'],
      notes: '尚差实验数据章节未补充。',
      createdAt: iso(-9, 10, 0),
      updatedAt: iso(-2, 21, 10),
      completedAt: null,
    },
    {
      id: t3Id,
      title: 'IndexedDB 与云同步离线缓存练习',
      description: '完成事务写入、关联删除及跨设备实时同步校验。',
      projectId: pStudyId,
      plannedStartDate: addDaysToLocalDate(today, -2),
      plannedEndDate: today,
      originalStartDate: addDaysToLocalDate(today, -2),
      originalEndDate: today,
      priority: 'P2',
      status: 'in_progress',
      progress: 80,
      tags: ['前端', '存储'],
      notes: '需要补充异常 JSON 格式导入测试。',
      createdAt: iso(-4, 15, 0),
      updatedAt: iso(0, 8, 45),
      completedAt: null,
    },
    {
      id: t4Id,
      title: '预订跨年出行车票与住宿（跨月跨年计划）',
      description: '确认元旦前后行程日期、对比交通班次并锁定退改政策。',
      projectId: pLifeId,
      plannedStartDate: addDaysToLocalDate(today, 3),
      plannedEndDate: addDaysToLocalDate(today, 38),
      originalStartDate: addDaysToLocalDate(today, 3),
      originalEndDate: addDaysToLocalDate(today, 38),
      priority: 'P2',
      status: 'not_started',
      progress: 0,
      tags: ['出行', '跨年'],
      notes: '注意查看跨年期间价格波动。',
      createdAt: iso(-3, 19, 20),
      updatedAt: iso(-3, 19, 20),
      completedAt: null,
    },
    {
      id: t5Id,
      title: '完成作品集视觉规范与字体选型',
      description: '确定深浅双主题色彩对比度及等宽数字字体。',
      projectId: pWorkId,
      plannedStartDate: addDaysToLocalDate(today, -12),
      plannedEndDate: addDaysToLocalDate(today, -6),
      originalStartDate: addDaysToLocalDate(today, -12),
      originalEndDate: addDaysToLocalDate(today, -6),
      priority: 'P3',
      status: 'completed',
      progress: 100,
      tags: ['视觉', '规范'],
      notes: '已归档色板方案。',
      createdAt: iso(-12, 10, 0),
      updatedAt: iso(-6, 17, 40),
      completedAt: iso(-6, 17, 40),
    },
    {
      id: t6Id,
      title: '收集明年想读的技术与设计书单',
      description: '整理待读列表，待有空余时间再安排具体阅读周计划。',
      projectId: pStudyId,
      plannedStartDate: null,
      plannedEndDate: null,
      originalStartDate: null,
      originalEndDate: null,
      priority: 'P4',
      status: 'not_started',
      progress: 0,
      tags: ['阅读', '待排期'],
      notes: '先放入未排期池中。',
      createdAt: iso(-1, 21, 0),
      updatedAt: iso(-1, 21, 0),
      completedAt: null,
    },
  ];

  const progressLogs: ProgressLog[] = [
    {
      id: createId('prog'),
      taskId: t1Id,
      progress: 25,
      note: '完成竞品调研与功能清单梳理',
      loggedAt: iso(-5, 18, 30),
      createdAt: iso(-5, 18, 30),
      updatedAt: iso(-5, 18, 30),
    },
    {
      id: createId('prog'),
      taskId: t1Id,
      progress: 50,
      note: '完成核心页面低保真线框图',
      loggedAt: iso(-3, 21, 15),
      createdAt: iso(-3, 21, 15),
      updatedAt: iso(-3, 21, 15),
    },
    {
      id: createId('prog'),
      taskId: t1Id,
      progress: 70,
      note: '完成甘特图与任务详情弹层细化',
      loggedAt: iso(-1, 15, 40),
      createdAt: iso(-1, 15, 40),
      updatedAt: iso(-1, 15, 40),
    },
    {
      id: createId('prog'),
      taskId: t3Id,
      progress: 80,
      note: '核心表结构与索引测试通过',
      loggedAt: iso(0, 8, 45),
      createdAt: iso(0, 8, 45),
      updatedAt: iso(0, 8, 45),
    },
  ];

  const activityNodes: ActivityNode[] = [
    {
      id: createId('act'),
      taskId: t1Id,
      title: '开始准备与结构拆分',
      description: '明确移动端优先策略及五栏导航布局',
      eventAt: iso(-6, 10, 15),
      createdAt: iso(-6, 10, 15),
      updatedAt: iso(-6, 10, 15),
    },
    {
      id: createId('act'),
      taskId: t1Id,
      title: '完成初稿走查',
      description: '在手机浏览器实测触摸热区，微调底部弹窗高度',
      eventAt: iso(-2, 16, 40),
      createdAt: iso(-2, 16, 40),
      updatedAt: iso(-2, 16, 40),
    },
    {
      id: createId('act'),
      taskId: t3Id,
      title: '验证离线读写持久化',
      description: '断开网络刷新页面后数据恢复正常',
      eventAt: iso(0, 8, 50),
      createdAt: iso(0, 8, 50),
      updatedAt: iso(0, 8, 50),
    },
    {
      id: createId('act'),
      taskId: t5Id,
      title: '任务完成',
      description: '完成全部状态与优先级色彩定稿',
      eventAt: iso(-6, 17, 40),
      createdAt: iso(-6, 17, 40),
      updatedAt: iso(-6, 17, 40),
      systemType: 'completed',
    },
  ];

  const scheduleLogs: ScheduleLog[] = [
    {
      id: createId('sch'),
      taskId: t1Id,
      oldStartDate: addDaysToLocalDate(today, -6),
      newStartDate: addDaysToLocalDate(today, -6),
      oldEndDate: addDaysToLocalDate(today, -1),
      newEndDate: addDaysToLocalDate(today, 2),
      changedAt: iso(-1, 18, 54),
      reason: '补充时间轴视图细节与手机触控优化',
    },
  ];

  await db.transaction(
    'rw',
    [db.projects, db.tasks, db.progressLogs, db.activityNodes, db.scheduleLogs],
    async () => {
      await db.projects.bulkPut(projects);
      await db.tasks.bulkPut(tasks);
      await db.progressLogs.bulkPut(progressLogs);
      await db.activityNodes.bulkPut(activityNodes);
      await db.scheduleLogs.bulkPut(scheduleLogs);
    }
  );

  if (activeCloudUid) {
    const currentSettings = (await db.settings.get('default')) ?? DEFAULT_SETTINGS;
    await uploadLocalSnapshotToCloud(activeCloudUid, {
      projects,
      tasks,
      progressLogs,
      activityNodes,
      scheduleLogs,
      settings: currentSettings,
    });
  }
}

// ============================================================================
// Task Operations
// ============================================================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  progress?: number;
  tags?: string[];
  notes?: string;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const status: TaskStatus = input.status ?? 'not_started';
  let progress = typeof input.progress === 'number' ? Math.max(0, Math.min(100, Math.round(input.progress))) : 0;
  let completedAt: string | null = null;

  if (status === 'completed') {
    progress = 100;
    completedAt = now;
  } else if (status === 'not_started' && input.progress === undefined) {
    progress = 0;
  }

  const start = input.plannedStartDate || null;
  const end = input.plannedEndDate || null;

  const task: Task = {
    id: createId('task'),
    title: input.title.trim().slice(0, 200),
    description: (input.description ?? '').trim().slice(0, 4000),
    projectId: input.projectId || null,
    plannedStartDate: start,
    plannedEndDate: end,
    originalStartDate: start,
    originalEndDate: end,
    priority: input.priority ?? 'P4',
    status,
    progress,
    tags: (input.tags ?? []).map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 20),
    notes: (input.notes ?? '').trim().slice(0, 4000),
    createdAt: now,
    updatedAt: now,
    completedAt,
  };

  const completionNode: ActivityNode | null =
    status === 'completed'
      ? {
          id: createId('act'),
          taskId: task.id,
          title: '任务完成',
          description: '创建时直接标记为已完成',
          eventAt: now,
          createdAt: now,
          updatedAt: now,
          systemType: 'completed',
        }
      : null;

  await db.transaction('rw', [db.tasks, db.activityNodes], async () => {
    await db.tasks.add(task);
    if (completionNode) {
      await db.activityNodes.add(completionNode);
    }
  });

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      batch.set(
        doc(firestoreDb, `${base}/tasks`, task.id),
        toFirestoreTaskPayload(task, uid, true)
      );
      if (completionNode) {
        batch.set(
          doc(firestoreDb, `${base}/activityNodes`, completionNode.id),
          toFirestoreActivityNodePayload(completionNode, uid, true)
        );
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${base}/tasks/${task.id}`);
    }
  }

  return task;
}

export interface UpdateTaskOptions {
  scheduleReason?: string;
  createCompletionActivity?: boolean;
}

export async function updateTask(
  taskId: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt'>>,
  options: UpdateTaskOptions = {}
): Promise<Task | undefined> {
  const existing = await db.tasks.get(taskId);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const nextStart =
    patch.plannedStartDate !== undefined ? patch.plannedStartDate || null : existing.plannedStartDate;
  const nextEnd =
    patch.plannedEndDate !== undefined ? patch.plannedEndDate || null : existing.plannedEndDate;

  const originalStartDate = existing.originalStartDate ?? nextStart;
  const originalEndDate = existing.originalEndDate ?? nextEnd;

  let nextStatus = patch.status ?? existing.status;
  let nextProgress =
    patch.progress !== undefined
      ? Math.max(0, Math.min(100, Math.round(patch.progress)))
      : existing.progress;
  let nextCompletedAt = patch.completedAt !== undefined ? patch.completedAt : existing.completedAt;

  if (patch.status !== undefined && patch.status !== existing.status) {
    if (patch.status === 'completed') {
      nextProgress = 100;
      nextCompletedAt = nextCompletedAt ?? now;
    } else if (existing.status === 'completed') {
      if (patch.progress === undefined && nextProgress === 100) {
        nextProgress = patch.status === 'not_started' ? 0 : 90;
      }
      nextCompletedAt = null;
    } else if (patch.status === 'not_started' && patch.progress === undefined) {
      nextProgress = 0;
    } else if (patch.status === 'in_progress' && nextProgress >= 100 && patch.progress === undefined) {
      nextProgress = 99;
    }
  } else if (patch.progress !== undefined && nextStatus === 'not_started' && nextProgress > 0 && nextProgress < 100) {
    nextStatus = 'in_progress';
  }

  const datesChanged = nextStart !== existing.plannedStartDate || nextEnd !== existing.plannedEndDate;
  const hadPreviousDates = existing.plannedStartDate !== null || existing.plannedEndDate !== null;

  const updated: Task = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim().slice(0, 200) : existing.title,
    description: patch.description !== undefined ? patch.description.trim().slice(0, 4000) : existing.description,
    notes: patch.notes !== undefined ? patch.notes.trim().slice(0, 4000) : existing.notes,
    tags:
      patch.tags !== undefined
        ? patch.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 20)
        : existing.tags,
    projectId: patch.projectId !== undefined ? patch.projectId || null : existing.projectId,
    plannedStartDate: nextStart,
    plannedEndDate: nextEnd,
    originalStartDate,
    originalEndDate,
    status: nextStatus,
    progress: nextProgress,
    completedAt: nextCompletedAt,
    updatedAt: now,
  };

  let newScheduleLog: ScheduleLog | null = null;
  if (datesChanged && hadPreviousDates) {
    newScheduleLog = {
      id: createId('sch'),
      taskId,
      oldStartDate: existing.plannedStartDate,
      newStartDate: nextStart,
      oldEndDate: existing.plannedEndDate,
      newEndDate: nextEnd,
      changedAt: now,
      reason: (options.scheduleReason ?? '').trim().slice(0, 500),
    };
  }

  let newActivityNode: ActivityNode | null = null;

  await db.transaction('rw', [db.tasks, db.scheduleLogs, db.activityNodes], async () => {
    await db.tasks.put(updated);

    if (newScheduleLog) {
      await db.scheduleLogs.add(newScheduleLog);
    }

    if (existing.status !== 'completed' && nextStatus === 'completed' && options.createCompletionActivity !== false) {
      const existingNodes = await db.activityNodes.where('taskId').equals(taskId).toArray();
      const sorted = existingNodes.sort((a, b) => b.eventAt.localeCompare(a.eventAt));
      const latestSystem = sorted.find((n) => n.systemType);
      if (!latestSystem || latestSystem.systemType !== 'completed') {
        const node: ActivityNode = {
          id: createId('act'),
          taskId,
          title: '任务完成',
          description: '任务状态变更为已完成，进度 100%',
          eventAt: now,
          createdAt: now,
          updatedAt: now,
          systemType: 'completed',
        };
        newActivityNode = node;
        await db.activityNodes.add(node);
      }
    } else if (existing.status === 'completed' && nextStatus !== 'completed') {
      const node: ActivityNode = {
        id: createId('act'),
        taskId,
        title: '重新打开任务',
        description: `状态调整为「${nextStatus === 'in_progress' ? '进行中' : nextStatus === 'paused' ? '暂停' : '未开始'}」，保留历史完成记录`,
        eventAt: now,
        createdAt: now,
        updatedAt: now,
        systemType: 'reopened',
      };
      newActivityNode = node;
      await db.activityNodes.add(node);
    }
  });

  const createdActivityNode = newActivityNode as ActivityNode | null;

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      const taskRef = doc(firestoreDb, `${base}/tasks`, taskId);

      // Build exact update fields aligned with Firestore security rule Actions 1, 2, 3
      const updateFields: Record<string, unknown> = {
        title: updated.title,
        description: updated.description,
        projectId: updated.projectId,
        plannedStartDate: updated.plannedStartDate,
        plannedEndDate: updated.plannedEndDate,
        priority: updated.priority,
        tags: updated.tags,
        notes: updated.notes,
        updatedAt: serverTimestamp(),
      };

      if (existing.status !== 'completed') {
        // Action 1
        updateFields.originalStartDate = updated.originalStartDate;
        updateFields.originalEndDate = updated.originalEndDate;
        updateFields.status = updated.status;
        updateFields.progress = updated.progress;
        updateFields.completedAt = updated.completedAt;
      } else if (nextStatus !== 'completed') {
        // Action 2: Reopen completed task
        updateFields.status = updated.status;
        updateFields.progress = updated.progress;
        updateFields.completedAt = updated.completedAt;
      }
      // Action 3 (completed -> completed metadata edit) keeps status/progress/completedAt untouched

      batch.update(taskRef, updateFields);

      if (newScheduleLog) {
        batch.set(
          doc(firestoreDb, `${base}/scheduleLogs`, newScheduleLog.id),
          toFirestoreScheduleLogPayload(newScheduleLog, uid)
        );
      }
      if (createdActivityNode) {
        batch.set(
          doc(firestoreDb, `${base}/activityNodes`, createdActivityNode.id),
          toFirestoreActivityNodePayload(createdActivityNode, uid, true)
        );
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${base}/tasks/${taskId}`);
    }
  }

  return updated;
}

export async function toggleCompleteTask(taskId: string): Promise<Task | undefined> {
  const existing = await db.tasks.get(taskId);
  if (!existing) return undefined;
  if (existing.status === 'completed') {
    return updateTask(taskId, { status: 'in_progress', progress: 90, completedAt: null });
  }
  return updateTask(taskId, { status: 'completed', progress: 100 });
}

export async function deferTaskDeadline(
  taskId: string,
  newEndDate: string,
  reason: string
): Promise<Task | undefined> {
  return updateTask(
    taskId,
    { plannedEndDate: newEndDate },
    { scheduleReason: reason }
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.tasks, db.progressLogs, db.activityNodes, db.scheduleLogs],
    async () => {
      await db.tasks.delete(taskId);
      await db.progressLogs.where('taskId').equals(taskId).delete();
      await db.activityNodes.where('taskId').equals(taskId).delete();
      await db.scheduleLogs.where('taskId').equals(taskId).delete();
    }
  );

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const [progSnap, actSnap, schSnap] = await Promise.all([
        getDocs(query(collection(firestoreDb, `${base}/progressLogs`), where('taskId', '==', taskId))),
        getDocs(query(collection(firestoreDb, `${base}/activityNodes`), where('taskId', '==', taskId))),
        getDocs(query(collection(firestoreDb, `${base}/scheduleLogs`), where('taskId', '==', taskId))),
      ]);
      const batch = writeBatch(firestoreDb);
      progSnap.forEach((d) => batch.delete(d.ref));
      actSnap.forEach((d) => batch.delete(d.ref));
      schSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(firestoreDb, `${base}/tasks`, taskId));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${base}/tasks/${taskId}`);
    }
  }
}

// ============================================================================
// Progress History Operations
// ============================================================================

export async function logTaskProgress(
  taskId: string,
  progress: number,
  note: string,
  autoCompleteIf100 = false
): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;

  const now = new Date().toISOString();
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const newLog: ProgressLog = {
    id: createId('prog'),
    taskId,
    progress: clamped,
    note: note.trim().slice(0, 1000),
    loggedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  let completionNode: ActivityNode | null = null;
  const patch: Partial<Task> = {
    progress: clamped,
    updatedAt: now,
  };

  if (clamped === 100 && autoCompleteIf100 && task.status !== 'completed') {
    patch.status = 'completed';
    patch.completedAt = now;
    completionNode = {
      id: createId('act'),
      taskId,
      title: '任务完成',
      description: note.trim() ? `进度达到 100%：${note.trim()}` : '进度达到 100%，任务自动完成',
      eventAt: now,
      createdAt: now,
      updatedAt: now,
      systemType: 'completed',
    };
  } else if (clamped > 0 && clamped < 100 && task.status === 'not_started') {
    patch.status = 'in_progress';
  }

  await db.transaction('rw', [db.tasks, db.progressLogs, db.activityNodes], async () => {
    await db.progressLogs.add(newLog);
    if (completionNode) {
      await db.activityNodes.add(completionNode);
    }
    await db.tasks.update(taskId, patch);
  });

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      batch.set(
        doc(firestoreDb, `${base}/progressLogs`, newLog.id),
        toFirestoreProgressLogPayload(newLog, uid, true)
      );
      if (task.status !== 'completed') {
        const taskUpdate: Record<string, unknown> = {
          progress: clamped,
          updatedAt: serverTimestamp(),
        };
        if (patch.status) taskUpdate.status = patch.status;
        if (patch.completedAt) taskUpdate.completedAt = patch.completedAt;
        batch.update(doc(firestoreDb, `${base}/tasks`, taskId), taskUpdate);
      }
      if (completionNode) {
        batch.set(
          doc(firestoreDb, `${base}/activityNodes`, completionNode.id),
          toFirestoreActivityNodePayload(completionNode, uid, true)
        );
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${base}/progressLogs/${newLog.id}`);
    }
  }
}

export async function updateProgressLog(
  logId: string,
  patch: { progress?: number; note?: string; loggedAt?: string },
  syncCurrentProgress?: boolean
): Promise<void> {
  const existing = await db.progressLogs.get(logId);
  if (!existing) return;

  const now = new Date().toISOString();
  const nextProgress =
    patch.progress !== undefined
      ? Math.max(0, Math.min(100, Math.round(patch.progress)))
      : existing.progress;
  const nextNote = patch.note !== undefined ? patch.note.trim().slice(0, 1000) : existing.note;
  const nextLoggedAt = (patch.loggedAt ?? existing.loggedAt).slice(0, 40);

  await db.transaction('rw', [db.progressLogs, db.tasks], async () => {
    await db.progressLogs.update(logId, {
      progress: nextProgress,
      note: nextNote,
      loggedAt: nextLoggedAt,
      updatedAt: now,
    });
    if (syncCurrentProgress) {
      await db.tasks.update(existing.taskId, {
        progress: nextProgress,
        updatedAt: now,
      });
    }
  });

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      batch.update(doc(firestoreDb, `${base}/progressLogs`, logId), {
        progress: nextProgress,
        note: nextNote,
        loggedAt: nextLoggedAt,
        updatedAt: serverTimestamp(),
      });
      if (syncCurrentProgress) {
        const parentTask = await db.tasks.get(existing.taskId);
        if (parentTask && parentTask.status !== 'completed') {
          batch.update(doc(firestoreDb, `${base}/tasks`, existing.taskId), {
            progress: nextProgress,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${base}/progressLogs/${logId}`);
    }
  }
}

export async function deleteProgressLog(logId: string, fallbackCurrentProgress?: number): Promise<void> {
  const existing = await db.progressLogs.get(logId);
  if (!existing) return;
  const clampedFallback =
    fallbackCurrentProgress !== undefined
      ? Math.max(0, Math.min(100, Math.round(fallbackCurrentProgress)))
      : undefined;

  await db.transaction('rw', [db.progressLogs, db.tasks], async () => {
    await db.progressLogs.delete(logId);
    if (clampedFallback !== undefined) {
      await db.tasks.update(existing.taskId, {
        progress: clampedFallback,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      batch.delete(doc(firestoreDb, `${base}/progressLogs`, logId));
      if (clampedFallback !== undefined) {
        const parentTask = await db.tasks.get(existing.taskId);
        if (parentTask && parentTask.status !== 'completed') {
          batch.update(doc(firestoreDb, `${base}/tasks`, existing.taskId), {
            progress: clampedFallback,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${base}/progressLogs/${logId}`);
    }
  }
}

// ============================================================================
// Activity Node Operations
// ============================================================================

export async function addActivityNode(
  taskId: string,
  title: string,
  description: string,
  customEventAt?: string
): Promise<ActivityNode> {
  const now = new Date().toISOString();
  const node: ActivityNode = {
    id: createId('act'),
    taskId,
    title: title.trim().slice(0, 200),
    description: description.trim().slice(0, 2000),
    eventAt: (customEventAt || now).slice(0, 40),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.activityNodes, db.tasks], async () => {
    await db.activityNodes.add(node);
    await db.tasks.update(taskId, { updatedAt: now });
  });

  if (activeCloudUid) {
    const uid = activeCloudUid;
    const base = `users/${uid}`;
    try {
      const batch = writeBatch(firestoreDb);
      batch.set(
        doc(firestoreDb, `${base}/activityNodes`, node.id),
        toFirestoreActivityNodePayload(node, uid, true)
      );
      batch.update(doc(firestoreDb, `${base}/tasks`, taskId), {
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${base}/activityNodes/${node.id}`);
    }
  }

  return node;
}

export async function updateActivityNode(
  nodeId: string,
  patch: { title?: string; description?: string; eventAt?: string }
): Promise<void> {
  const existing = await db.activityNodes.get(nodeId);
  if (!existing) return;
  const now = new Date().toISOString();
  const nextTitle = patch.title !== undefined ? patch.title.trim().slice(0, 200) : existing.title;
  const nextDescription =
    patch.description !== undefined ? patch.description.trim().slice(0, 2000) : existing.description;
  const nextEventAt = (patch.eventAt !== undefined ? patch.eventAt : existing.eventAt).slice(0, 40);

  await db.activityNodes.update(nodeId, {
    title: nextTitle,
    description: nextDescription,
    eventAt: nextEventAt,
    updatedAt: now,
  });

  if (activeCloudUid) {
    const base = `users/${activeCloudUid}`;
    try {
      await updateDoc(doc(firestoreDb, `${base}/activityNodes`, nodeId), {
        title: nextTitle,
        description: nextDescription,
        eventAt: nextEventAt,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${base}/activityNodes/${nodeId}`);
    }
  }
}

export async function deleteActivityNode(nodeId: string): Promise<void> {
  await db.activityNodes.delete(nodeId);
  if (activeCloudUid) {
    await deleteCloudDoc(`users/${activeCloudUid}/activityNodes`, nodeId);
  }
}

// ============================================================================
// Project Operations
// ============================================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  color: string;
  status?: ProjectStatus;
  progressMode?: 'auto' | 'manual';
  manualProgress?: number;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: createId('proj'),
    name: input.name.trim().slice(0, 120),
    description: (input.description ?? '').trim().slice(0, 1000),
    color: input.color.slice(0, 20),
    status: input.status ?? 'active',
    progressMode: input.progressMode ?? 'auto',
    manualProgress: Math.max(0, Math.min(100, Math.round(input.manualProgress ?? 0))),
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);

  if (activeCloudUid) {
    const base = `users/${activeCloudUid}`;
    try {
      await setDoc(
        doc(firestoreDb, `${base}/projects`, project.id),
        toFirestoreProjectPayload(project, activeCloudUid, true)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${base}/projects/${project.id}`);
    }
  }

  return project;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.projects.get(projectId);
  if (!existing) return;
  const next: Project = {
    ...existing,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim().slice(0, 120) : existing.name,
    description: patch.description !== undefined ? patch.description.trim().slice(0, 1000) : existing.description,
    manualProgress:
      patch.manualProgress !== undefined
        ? Math.max(0, Math.min(100, Math.round(patch.manualProgress)))
        : existing.manualProgress,
    updatedAt: new Date().toISOString(),
  };

  await db.projects.put(next);

  if (activeCloudUid) {
    const base = `users/${activeCloudUid}`;
    try {
      await updateDoc(doc(firestoreDb, `${base}/projects`, projectId), {
        name: next.name,
        description: next.description,
        color: next.color,
        status: next.status,
        progressMode: next.progressMode,
        manualProgress: next.manualProgress,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${base}/projects/${projectId}`);
    }
  }
}

export async function deleteProject(projectId: string, unlinkTasks = true): Promise<void> {
  let linkedTaskIds: string[] = [];
  await db.transaction('rw', [db.projects, db.tasks], async () => {
    await db.projects.delete(projectId);
    if (unlinkTasks) {
      const linked = await db.tasks.where('projectId').equals(projectId).toArray();
      linkedTaskIds = linked.map((t) => t.id);
      const now = new Date().toISOString();
      await Promise.all(
        linked.map((t) => db.tasks.update(t.id, { projectId: null, updatedAt: now }))
      );
    }
  });

  if (activeCloudUid) {
    const base = `users/${activeCloudUid}`;
    try {
      const batch = writeBatch(firestoreDb);
      for (const tid of linkedTaskIds) {
        batch.update(doc(firestoreDb, `${base}/tasks`, tid), {
          projectId: null,
          updatedAt: serverTimestamp(),
        });
      }
      batch.delete(doc(firestoreDb, `${base}/projects`, projectId));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${base}/projects/${projectId}`);
    }
  }
}

// ============================================================================
// Settings, Export, Import & Wipe Operations
// ============================================================================

export async function updateSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const current = (await db.settings.get('default')) ?? DEFAULT_SETTINGS;
  const next: AppSettings = {
    ...current,
    ...patch,
    id: 'default',
    updatedAt: new Date().toISOString(),
  };
  await db.settings.put(next);

  if (activeCloudUid) {
    const base = `users/${activeCloudUid}`;
    try {
      await setDoc(
        doc(firestoreDb, `${base}/settings`, 'default'),
        toFirestoreSettingsPayload(next, activeCloudUid)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${base}/settings/default`);
    }
  }
}

export async function exportAllData(): Promise<ExportBundle> {
  const [tasks, projects, progressLogs, activityNodes, scheduleLogs, settings] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.progressLogs.toArray(),
    db.activityNodes.toArray(),
    db.scheduleLogs.toArray(),
    db.settings.get('default'),
  ]);

  const enrichedTasks: Task[] = tasks.map((t) => ({
    ...t,
    progressHistoryIds: progressLogs.filter((p) => p.taskId === t.id).map((p) => p.id),
    activityHistoryIds: activityNodes.filter((a) => a.taskId === t.id).map((a) => a.id),
    scheduleHistoryIds: scheduleLogs.filter((s) => s.taskId === t.id).map((s) => s.id),
  }));

  return {
    app: 'ChronoPlan',
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: enrichedTasks,
      projects,
      progressLogs,
      activityNodes,
      scheduleLogs,
      settings: settings ?? DEFAULT_SETTINGS,
    },
  };
}

export function validateExportBundle(raw: unknown): raw is ExportBundle {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.schemaVersion !== 'number' || !obj.data || typeof obj.data !== 'object') {
    return false;
  }
  const data = obj.data as Record<string, unknown>;
  if (
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.progressLogs) ||
    !Array.isArray(data.activityNodes) ||
    !Array.isArray(data.scheduleLogs)
  ) {
    return false;
  }
  for (const t of data.tasks) {
    if (!t || typeof t !== 'object' || typeof (t as Task).id !== 'string' || typeof (t as Task).title !== 'string') {
      return false;
    }
  }
  for (const p of data.projects) {
    if (!p || typeof p !== 'object' || typeof (p as Project).id !== 'string' || typeof (p as Project).name !== 'string') {
      return false;
    }
  }
  return true;
}

export async function importAllData(
  bundle: ExportBundle,
  mode: 'overwrite' | 'merge'
): Promise<{ importedTasks: number; importedProjects: number; skippedTasks: number }> {
  const { tasks, projects, progressLogs, activityNodes, scheduleLogs, settings } = bundle.data;

  let importedTasks = 0;
  let importedProjects = 0;
  let skippedTasks = 0;

  let uploadedProjects: Project[] = [];
  let uploadedTasks: Task[] = [];
  let uploadedProg: ProgressLog[] = [];
  let uploadedAct: ActivityNode[] = [];
  let uploadedSch: ScheduleLog[] = [];

  await db.transaction(
    'rw',
    [db.tasks, db.projects, db.progressLogs, db.activityNodes, db.scheduleLogs, db.settings, db.meta],
    async () => {
      if (mode === 'overwrite') {
        await Promise.all([
          db.tasks.clear(),
          db.projects.clear(),
          db.progressLogs.clear(),
          db.activityNodes.clear(),
          db.scheduleLogs.clear(),
        ]);

        if (projects.length) await db.projects.bulkPut(projects);
        if (tasks.length) await db.tasks.bulkPut(tasks);
        if (progressLogs.length) await db.progressLogs.bulkPut(progressLogs);
        if (activityNodes.length) await db.activityNodes.bulkPut(activityNodes);
        if (scheduleLogs.length) await db.scheduleLogs.bulkPut(scheduleLogs);
        if (settings) {
          await db.settings.put({ ...settings, id: 'default' });
        }

        uploadedProjects = projects;
        uploadedTasks = tasks;
        uploadedProg = progressLogs;
        uploadedAct = activityNodes;
        uploadedSch = scheduleLogs;
        importedTasks = tasks.length;
        importedProjects = projects.length;
      } else {
        const existingProjectIds = new Set((await db.projects.toCollection().primaryKeys()) as string[]);
        const existingTaskIds = new Set((await db.tasks.toCollection().primaryKeys()) as string[]);
        const existingProgIds = new Set((await db.progressLogs.toCollection().primaryKeys()) as string[]);
        const existingActIds = new Set((await db.activityNodes.toCollection().primaryKeys()) as string[]);
        const existingSchIds = new Set((await db.scheduleLogs.toCollection().primaryKeys()) as string[]);

        const newProjects = projects.filter((p) => !existingProjectIds.has(p.id));
        const newTasks = tasks.filter((t) => {
          if (existingTaskIds.has(t.id)) {
            skippedTasks++;
            return false;
          }
          return true;
        });

        const validTaskIds = new Set([...existingTaskIds, ...newTasks.map((t) => t.id)]);
        const newProg = progressLogs.filter((l) => !existingProgIds.has(l.id) && validTaskIds.has(l.taskId));
        const newAct = activityNodes.filter((l) => !existingActIds.has(l.id) && validTaskIds.has(l.taskId));
        const newSch = scheduleLogs.filter((l) => !existingSchIds.has(l.id) && validTaskIds.has(l.taskId));

        if (newProjects.length) await db.projects.bulkAdd(newProjects);
        if (newTasks.length) await db.tasks.bulkAdd(newTasks);
        if (newProg.length) await db.progressLogs.bulkAdd(newProg);
        if (newAct.length) await db.activityNodes.bulkAdd(newAct);
        if (newSch.length) await db.scheduleLogs.bulkAdd(newSch);

        uploadedProjects = newProjects;
        uploadedTasks = newTasks;
        uploadedProg = newProg;
        uploadedAct = newAct;
        uploadedSch = newSch;
        importedTasks = newTasks.length;
        importedProjects = newProjects.length;
      }
      await db.meta.put({ key: 'initial_seeded', value: 'true' });
    }
  );

  if (activeCloudUid) {
    if (mode === 'overwrite') {
      await clearCloudUserData(activeCloudUid);
    }
    const finalSettings = (await db.settings.get('default')) ?? DEFAULT_SETTINGS;
    await uploadLocalSnapshotToCloud(activeCloudUid, {
      projects: uploadedProjects,
      tasks: uploadedTasks,
      progressLogs: uploadedProg,
      activityNodes: uploadedAct,
      scheduleLogs: uploadedSch,
      settings: finalSettings,
    });
  }

  return { importedTasks, importedProjects, skippedTasks };
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.tasks, db.projects, db.progressLogs, db.activityNodes, db.scheduleLogs, db.meta],
    async () => {
      await Promise.all([
        db.tasks.clear(),
        db.projects.clear(),
        db.progressLogs.clear(),
        db.activityNodes.clear(),
        db.scheduleLogs.clear(),
      ]);
      await db.meta.put({ key: 'initial_seeded', value: 'true' });
    }
  );

  if (activeCloudUid) {
    await clearCloudUserData(activeCloudUid);
  }
}
