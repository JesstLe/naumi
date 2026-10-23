/** A stale preview is a definite pre-acceptance conflict, never a supplier error. */
export class ImagegenConfirmationChanged extends Error {
  readonly code = "IMAGEGEN_PLAN_CHANGED";
  readonly status = 409;
  constructor() { super("生成报价已更新，请按最新报价提交"); }
}
