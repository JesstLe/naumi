/** Customer failure is separate from an unknown supplier payment outcome. */
export const IMAGE_JOB_RELEASED_MESSAGE = "本次图片生成未取得结果，已结束等待并释放预占积分，请重新发起。";
export const IMAGE_JOB_REVIEW_MESSAGE = "本次图片任务已暂停，已有结果或上游费用需要核对，请联系管理员。";

export function imageJobHasResults(snapshot: Record<string, any>): boolean {
  return !!snapshot.images?.length || snapshot.shots?.some((s: any) => s.status === "done" && s.url) ||
    Object.values(snapshot.paidOperations || {}).some((a: any) => a.state === "done" && a.result !== undefined);
}

export function hasUnreplayableImageAttempt(snapshot: Record<string, any>): boolean {
  return Object.values(snapshot.paidOperations || {}).some((a: any) => a.state === "started" && !a.replayable);
}

export function imageJobPollState(status: string) {
  // Existing toolbox, canvas and Agent clients already stop on error. Keep the
  // internal attention state for review, never disguise it as running work.
  return status === "needs_attention" ? "error" : status;
}
