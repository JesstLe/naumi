# PR8 Verify：普通 JSON 回放 wire 合同修复

## 输入与真实失败

- PR8 head `3c1aee90074601b3047d40e84533245b282c8aaa`；Verify run41612388657 / job125837255368。
- CI以PR合并快照5397cfaf执行，billing-all在第16项canvas-extra失败：15 PASS / 1 FAIL / 2 NOT_RUN。text/model/referenceCount一致，但多出 `replayed:true`，原 deepEqual 失败。
- 当前固定3c1aee90在自有PostgreSQL16 / actual canvas handler / signed cookie / 本地text/OCR supplier fixture再次原样复现exit1；原脚本字节与断言未改。

## 职责、原因与最小修复

独立只读复核64ff重构输入与c4b1e267主线输入，两者普通JSON回放均返回原result_response；本轮e54d owner汇合把内部result.replayed普遍投影成公开JSON字段，是产品wire回归，不是旧fixture失效。

- `billing/synchronous-operation.ts` 继续拥有原回执、身份、归属、账务和恢复。仅cutout/image已保存作品恢复分支在body保留原有 `replayed:true`；内部replayed metadata保持。
- `billing/synchronous.ts` 是HTTP适配；普通JSON直接投影原body/status，不泛化新增字段。assistant SSE的原done/replayed帧保持。
- 没有改价格、钱包、schema、锁、供应商重试或UNKNOWN。两个产品文件三处表达式变化；原verify-billing-canvas-extra.ts逐字节保持，原正文/model/referenceCount、OCR全JSON、单supplier/单ledger、冻结价格/输出异常/流恢复断言保留。

## 验证与回退

精确基线、修改版、回滚命令及literal stdout/stderr/exit归 `output/pr8-verify-canvas-replay-20261103/COMMANDS.json` 与最终 `VERIFICATION.txt`。集中运行完整18项billing-all、图片恢复43项、客户端回执、非增量tsc和两产品lint；不是完整237项core或生产验收。

四产物与独立副本hash守卫回滚在最终DELIVERY记录。原3c全量封装保持不动；本轮基线已经含restore-context正确合同，不回退它。仅修本次Verify失败，整体重构ACTIVE、main未合、本轮未部署、47 HOLD保持。新头CI独立验收，旧头结果不重标。

## 最终集中结果

- billing-all原18项单次全PASS / 0FAIL / 0NOT_RUN；原canvas-extra逐字节保持，text/OCR exact JSON、assistant SSE及冻结价/UNKNOWN/存量结果恢复全部经过原脚本。
- TOOL_IMAGE_RECEIPTS 43项PASS，覆盖工具恢复marker/原作品/归属/失败/无供应重放。
- 附加TOOL_CLIENT_RECEIPTS初次因旧fixture未绑定availability等迁移owner而exit2，真实前17项已执行；仅将原ports映射到当前imports并为不应触及的published/catalogue/writer增加throw guards，24项最终PASS。该错误属于测试依赖适配，与上方产品wire回归分别留证。
- 非增量tsc exit0；两个产品lint exit0，harness lint exit0。完整模块测试后的所有src/services产品hash与最终源码相同；没有把fixture改动当作产品修复。

精确命令与字面日志均已保存。剩余新头CI/整体core与固定运行验收继续，不将本次18项账务模块通过扩展为整体重构退出。
