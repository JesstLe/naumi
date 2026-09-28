import "server-only";

import {
  claimVideoTaskPoll,
  completeVideoTask,
  createVideoTask,
  failVideoTask,
  getVideoTask,
  listDueVideoTaskRefs,
  listVideoTasks,
  releaseVideoTaskPoll,
  scheduleVideoTaskRetry,
  type VideoTaskRow,
} from "@/lib/db";

// ---------------------------------------------------------------------------
// 视频领域数据访问门面(§11 repository):service 只通过这里触达持久层。
// 实际 SQL 仍在 db.ts(契约测试锚定在那里);本层负责聚合并暴露领域词汇。
// ---------------------------------------------------------------------------

export type { VideoTaskRow };

export const videoRepo = {
  create: createVideoTask,
  get: getVideoTask,
  list: listVideoTasks,
  listDueRefs: listDueVideoTaskRefs,
  claimPoll: claimVideoTaskPoll,
  releasePoll: releaseVideoTaskPoll,
  complete: completeVideoTask,
  fail: failVideoTask,
  scheduleRetry: scheduleVideoTaskRetry,
};
