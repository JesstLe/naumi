import "server-only";

import {claimVideoTaskPoll, listDueVideoTaskRefs, releaseVideoTaskPoll, scheduleVideoTaskRetry} from "@/lib/video/task-polling";
import {completeVideoTask, failVideoTask} from "@/lib/video/task-transitions";
import {createVideoTask, getVideoTask, listVideoTasks} from "@/lib/video/task-repository";
import {type VideoTaskRow} from "@/lib/video/task-types";

// ---------------------------------------------------------------------------
// Compatibility object for existing service callers. SQL and transactions live
// in their video owners; these bindings are the same functions, not wrappers.
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
