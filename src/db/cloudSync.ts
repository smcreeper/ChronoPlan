import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import { firestoreDb, handleFirestoreError, OperationType } from '../firebase';
import {
  ActivityNode,
  AppSettings,
  ProgressLog,
  Project,
  ScheduleLog,
  Task,
} from '../types/models';

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) return val;
  return new Date().toISOString();
}

export function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function toFirestoreProjectPayload(p: Project, uid: string, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    id: p.id,
    ownerId: uid,
    name: p.name.trim().slice(0, 120) || '未命名项目',
    description: p.description.slice(0, 1000),
    color: p.color.slice(0, 20),
    status: p.status,
    progressMode: p.progressMode,
    manualProgress: Math.max(0, Math.min(100, Math.round(p.manualProgress))),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export function toFirestoreTaskPayload(t: Task, uid: string, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    id: t.id,
    ownerId: uid,
    title: t.title.trim().slice(0, 200) || '未命名任务',
    description: t.description.slice(0, 4000),
    projectId: t.projectId ?? null,
    plannedStartDate: t.plannedStartDate ?? null,
    plannedEndDate: t.plannedEndDate ?? null,
    originalStartDate: t.originalStartDate ?? null,
    originalEndDate: t.originalEndDate ?? null,
    priority: t.priority,
    status: t.status,
    progress: Math.max(0, Math.min(100, Math.round(t.progress))),
    tags: t.tags.slice(0, 20).map((tag) => tag.slice(0, 40)),
    notes: t.notes.slice(0, 4000),
    completedAt: t.completedAt ?? null,
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export function toFirestoreProgressLogPayload(l: ProgressLog, uid: string, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    id: l.id,
    ownerId: uid,
    taskId: l.taskId,
    progress: Math.max(0, Math.min(100, Math.round(l.progress))),
    note: l.note.slice(0, 1000),
    loggedAt: l.loggedAt.slice(0, 40),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export function toFirestoreActivityNodePayload(n: ActivityNode, uid: string, isCreate: boolean) {
  const payload: Record<string, unknown> = {
    id: n.id,
    ownerId: uid,
    taskId: n.taskId,
    title: n.title.trim().slice(0, 200) || '阶段节点',
    description: n.description.slice(0, 2000),
    eventAt: n.eventAt.slice(0, 40),
    updatedAt: serverTimestamp(),
  };
  if (isCreate && n.systemType) {
    payload.systemType = n.systemType;
  }
  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

export function toFirestoreScheduleLogPayload(s: ScheduleLog, uid: string) {
  return {
    id: s.id,
    ownerId: uid,
    taskId: s.taskId,
    oldStartDate: s.oldStartDate ?? null,
    newStartDate: s.newStartDate ?? null,
    oldEndDate: s.oldEndDate ?? null,
    newEndDate: s.newEndDate ?? null,
    changedAt: s.changedAt.slice(0, 40),
    reason: s.reason.slice(0, 500),
  };
}

export function toFirestoreSettingsPayload(s: AppSettings, uid: string) {
  return {
    id: 'default',
    ownerId: uid,
    theme: s.theme,
    dateFormat: s.dateFormat,
    timeFormat: s.timeFormat,
    weekStartsOn: s.weekStartsOn,
    defaultTimelineScale: s.defaultTimelineScale,
    updatedAt: serverTimestamp(),
  };
}

export async function ensureUserProfileDoc(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(firestoreDb, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: (user.displayName ?? '').slice(0, 120),
        email: (user.email ?? '').slice(0, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        {
          displayName: (user.displayName ?? '').slice(0, 120),
          email: (user.email ?? '').slice(0, 200),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function cloudCollectionHasData(uid: string): Promise<boolean> {
  try {
    const [tasksSnap, projectsSnap] = await Promise.all([
      getDocs(collection(firestoreDb, `users/${uid}/tasks`)),
      getDocs(collection(firestoreDb, `users/${uid}/projects`)),
    ]);
    return !tasksSnap.empty || !projectsSnap.empty;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/tasks`);
  }
}

export async function uploadLocalSnapshotToCloud(
  uid: string,
  bundle: {
    projects: Project[];
    tasks: Task[];
    progressLogs: ProgressLog[];
    activityNodes: ActivityNode[];
    scheduleLogs: ScheduleLog[];
    settings: AppSettings;
  }
): Promise<void> {
  const base = `users/${uid}`;
  // Collect writes in safe chunks (< 450 per WriteBatch)
  // Order: projects -> tasks -> child logs -> settings
  const ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  for (const p of bundle.projects) {
    ops.push({
      ref: doc(firestoreDb, `${base}/projects`, p.id),
      data: toFirestoreProjectPayload(p, uid, true),
    });
  }
  for (const t of bundle.tasks) {
    ops.push({
      ref: doc(firestoreDb, `${base}/tasks`, t.id),
      data: toFirestoreTaskPayload(t, uid, true),
    });
  }
  for (const l of bundle.progressLogs) {
    ops.push({
      ref: doc(firestoreDb, `${base}/progressLogs`, l.id),
      data: toFirestoreProgressLogPayload(l, uid, true),
    });
  }
  for (const n of bundle.activityNodes) {
    ops.push({
      ref: doc(firestoreDb, `${base}/activityNodes`, n.id),
      data: toFirestoreActivityNodePayload(n, uid, true),
    });
  }
  for (const s of bundle.scheduleLogs) {
    ops.push({
      ref: doc(firestoreDb, `${base}/scheduleLogs`, s.id),
      data: toFirestoreScheduleLogPayload(s, uid),
    });
  }
  ops.push({
    ref: doc(firestoreDb, `${base}/settings`, 'default'),
    data: toFirestoreSettingsPayload(bundle.settings, uid),
  });

  try {
    const CHUNK = 400;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = writeBatch(firestoreDb);
      for (const item of ops.slice(i, i + CHUNK)) {
        batch.set(item.ref, item.data);
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, base);
  }
}

export async function clearCloudUserData(uid: string): Promise<void> {
  const base = `users/${uid}`;
  const cols = ['scheduleLogs', 'activityNodes', 'progressLogs', 'tasks', 'projects'];
  try {
    const refsToDelete: ReturnType<typeof doc>[] = [];
    for (const colName of cols) {
      const snap = await getDocs(collection(firestoreDb, `${base}/${colName}`));
      snap.forEach((d) => refsToDelete.push(d.ref));
    }
    const CHUNK = 400;
    for (let i = 0; i < refsToDelete.length; i += CHUNK) {
      const batch = writeBatch(firestoreDb);
      for (const ref of refsToDelete.slice(i, i + CHUNK)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, base);
  }
}

export interface CloudSyncCallbacks {
  onProjects: (items: Project[]) => void;
  onTasks: (items: Task[]) => void;
  onProgressLogs: (items: ProgressLog[]) => void;
  onActivityNodes: (items: ActivityNode[]) => void;
  onScheduleLogs: (items: ScheduleLog[]) => void;
  onSettings: (item: AppSettings | null) => void;
}

export function subscribeUserCloudData(
  uid: string,
  callbacks: CloudSyncCallbacks
): Unsubscribe {
  const base = `users/${uid}`;
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, `${base}/projects`),
      (snap) => {
        const items: Project[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            name: String(data.name ?? ''),
            description: String(data.description ?? ''),
            color: String(data.color ?? '#4F46E5'),
            status: data.status ?? 'active',
            progressMode: data.progressMode ?? 'auto',
            manualProgress: Number(data.manualProgress ?? 0),
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        callbacks.onProjects(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `${base}/projects`)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, `${base}/tasks`),
      (snap) => {
        const items: Task[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            title: String(data.title ?? ''),
            description: String(data.description ?? ''),
            projectId: data.projectId ?? null,
            plannedStartDate: data.plannedStartDate ?? null,
            plannedEndDate: data.plannedEndDate ?? null,
            originalStartDate: data.originalStartDate ?? null,
            originalEndDate: data.originalEndDate ?? null,
            priority: data.priority ?? 'P4',
            status: data.status ?? 'not_started',
            progress: Number(data.progress ?? 0),
            tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
            notes: String(data.notes ?? ''),
            completedAt: data.completedAt ?? null,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        callbacks.onTasks(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `${base}/tasks`)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, `${base}/progressLogs`),
      (snap) => {
        const items: ProgressLog[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            taskId: String(data.taskId ?? ''),
            progress: Number(data.progress ?? 0),
            note: String(data.note ?? ''),
            loggedAt: String(data.loggedAt ?? ''),
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        callbacks.onProgressLogs(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `${base}/progressLogs`)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, `${base}/activityNodes`),
      (snap) => {
        const items: ActivityNode[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            taskId: String(data.taskId ?? ''),
            title: String(data.title ?? ''),
            description: String(data.description ?? ''),
            eventAt: String(data.eventAt ?? ''),
            systemType: data.systemType ?? undefined,
            createdAt: tsToIso(data.createdAt),
            updatedAt: tsToIso(data.updatedAt),
          };
        });
        callbacks.onActivityNodes(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `${base}/activityNodes`)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(firestoreDb, `${base}/scheduleLogs`),
      (snap) => {
        const items: ScheduleLog[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id ?? d.id),
            taskId: String(data.taskId ?? ''),
            oldStartDate: data.oldStartDate ?? null,
            newStartDate: data.newStartDate ?? null,
            oldEndDate: data.oldEndDate ?? null,
            newEndDate: data.newEndDate ?? null,
            changedAt: String(data.changedAt ?? ''),
            reason: String(data.reason ?? ''),
          };
        });
        callbacks.onScheduleLogs(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `${base}/scheduleLogs`)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(firestoreDb, `${base}/settings`, 'default'),
      (snap) => {
        if (!snap.exists()) {
          callbacks.onSettings(null);
          return;
        }
        const data = snap.data();
        callbacks.onSettings({
          id: 'default',
          theme: data.theme ?? 'light',
          dateFormat: data.dateFormat ?? 'zh',
          timeFormat: data.timeFormat ?? '24h',
          weekStartsOn: data.weekStartsOn === 0 ? 0 : 1,
          defaultTimelineScale: data.defaultTimelineScale ?? 'week',
          updatedAt: tsToIso(data.updatedAt),
        });
      },
      (err) => handleFirestoreError(err, OperationType.GET, `${base}/settings/default`)
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function deleteCloudDoc(path: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(firestoreDb, path, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${path}/${id}`);
  }
}
