# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. Every document under `/users/{userId}/...` is strictly owned by `userId`, and requires `request.auth != null && request.auth.token.email_verified == true && request.auth.uid == userId`.
2. Every document ID (`projectId`, `taskId`, `logId`, `nodeId`, `settingId`) must match `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
3. `ownerId` and `createdAt` are immutable once created. `createdAt == request.time` on creation and `updatedAt == request.time` on creation and updates.
4. `ProgressLog`, `ActivityNode`, and `ScheduleLog` must reference an existing `Task` owned by the user (`exists(...)`) unless created in the same atomic batch (`existsAfter(...)`), preventing orphaned sub-records.
5. `Task.tags` is bounded to `<= 20` items and checked via `tags.size() == 0 || (tags[0] is string && tags[0].size() <= 40)`.
6. `Task.progress`, `Project.manualProgress`, and `ProgressLog.progress` must be numbers in `[0, 100]`.
7. Shadow/ghost fields are blocked on both `create` (`keys().hasOnly(...)`) and `update` (`affectedKeys().hasOnly(...)`).

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/uid1/tasks/t1`.
2. Cross-user read/write by `uid2` to `/users/uid1/tasks/t1`.
3. Unverified email user (`email_verified: false`) writing to `/users/uid1/tasks/t1`.
4. Identity spoofing: `uid1` creates task with `ownerId: "uid2"`.
5. Shadow field injection on create: task payload includes `isAdmin: true`.
6. Shadow field injection on update: task update includes `extraField: "hack"`.
7. ID poisoning: creating task with `taskId` = 200-char string or containing `$` / spaces.
8. String size exhaustion: creating task with `title` > 200 chars or `description` > 4000 chars.
9. Array boundary bypass: creating task with 25 tags or `tags: [123]`.
10. Progress out-of-bounds: creating task with `progress: 150` or `progress: -5`.
11. Timestamp tampering: creating task with `createdAt: "2020-01-01"` instead of `request.time`, or mutating `createdAt` on update.
12. Orphaned log injection: creating a `ProgressLog` referencing a non-existent `taskId`.
