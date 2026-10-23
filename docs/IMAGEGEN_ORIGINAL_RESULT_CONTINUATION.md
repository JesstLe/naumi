# 历史精确原图的本地续交 verifier

## 范围与状态

- 基线：`d86c95096a4854e999f8befe82406e15b6ffcd73`。仅新增本脚本和本文，不修改产品、父任务测试、价格或配置。
- 目标：两笔历史任务的 **原始输出字节 → 当前真实 `recoverStoredDelivery` → `readImagegenReceipt`**，不是员工完整提交重放。
- 精确员工重放仍为 **0**；本地 verifier 不恢复线上两笔状态，不执行 SSH、供应商查询、生成 POST（包括 loopback）或生产写入。
- `started` 且无 `result` 的原 checkpoint 必须先被真实 stored-delivery 拒绝且不收费。后续由 verifier **显式导入本地有证据的原图**，建立 `done` checkpoint；这不是现有产品会自动跨越该门槛的证明。
- 记录原/最终完整解码尺寸、字节 SHA256、实际 `succeeded/partial`、账务和拒绝行为。原合同不满足完整续交时保留实际 `partial`，不改冻结配置或 quote 凑成功。

## 输入与证据链

脚本：`scripts/verify-imagegen-original-result-continuation.ts`。不创建 framework，不加载 `.env`。

必需三个私有 JSON，均先以命令行提供的 SHA256 锁定并在完成后重读：

1. `--input`：父只读采集 `original-tasks.private.json`，包含两个原 parent/child snapshot、payload、quote、原 task GET 回执与 DB 输出 URL hash。
2. `--downloads`：`original-output-download.json`，包含每张原图本地 `.original` 路径、字节数、SHA256、原 URL hash、GET/200/无鉴权转发/无跳转证据。脚本按 manifest 读取原图，不再联网。
3. `--config`：`frozen-config.private.json`，含原 `modelVersion={version,digest,config}` 及 `accountIdentityMatch=true`。以产品相同的 canonical JSON 排序验证 digest；使用完整原配置进行 processing/preset lookup，绝不使用 active/current 配置。

原 task ID 必须匹配原 GET 回执，GET 必须完成，回执唯一 URL 的 hash 必须同时匹配 download manifest 与原 DB 输出 hash。原 PNG 经 SHA256 校验后，使用 `sharp(...,{failOn:'warning'}).raw().toBuffer()` 完整解码，不以 metadata 代替解码。

不打印/提交员工 prompt、原 signed URLs、原配置或凭据。真实 owner/email 映射成随机 `example.test` fixture；冻结 prompt、`p/count/ratio/resolution/targetWidth/targetHeight`、原 quote 和执行参数保持原值。原 signed result URL 不写入 PG checkpoint、不透传存储，只导入已核验原字节。原配置仅在随机隔离 schema 内使用，credential refs 不解析、不创建 secret。不存在 active model pointer。

## 执行

只能连接以下专用本地库，字符串及隔离开关必须完全匹配：

```powershell
$env:DATABASE_URL='postgresql://fixture:fixture-local-only@127.0.0.1:65435/goal'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$source='C:/PRIVATE_EVIDENCE_DIRECTORY'
$pins=@{
  input=(Get-FileHash "$source/original-tasks.private.json" -Algorithm SHA256).Hash.ToLower()
  downloads=(Get-FileHash "$source/original-output-download.json" -Algorithm SHA256).Hash.ToLower()
  config=(Get-FileHash "$source/frozen-config.private.json" -Algorithm SHA256).Hash.ToLower()
}
$common=@('--conditions','react-server','scripts/verify-imagegen-original-result-continuation.ts',
  '--input',"$source/original-tasks.private.json",'--input-sha256',$pins.input,
  '--downloads',"$source/original-output-download.json",'--downloads-sha256',$pins.downloads,
  '--config',"$source/frozen-config.private.json",'--config-sha256',$pins.config,
  '--out','output/imagegen-original-result-continuation')
node node_modules/tsx/dist/cli.mjs @common --mode baseline
node node_modules/tsx/dist/cli.mjs @common --mode continue
```

首次核验应从父可信采集记录取得 pins，而不是把同一次任意下载的 hash 当独立来源验证。当前两笔专用验收记录会保存实际 pins、命令、字面输出和退出码。

## 验收模块

1. 原冻结 `modelVersion=135 / billingVersion=8`、原 quote 与原 child `billingQuote` 相等；各 12 预占通过真实 `createImageJob` + billing service 建立，fixture 钱包独立供资，不导入原钱包。
2. baseline：原 `started` 无结果时 `readImagegenReceipt` 不宣称可恢复；真实 recover 拒绝，零消费账本，预占保持 12。
3. 显式证据导入：保持原 paid operation model/replayable 等字段，只在隔离副本把对应操作设为 `done` 并写入 `data:image/png` 原字节与原 executed quality，附 `localEvidenceImport`。
4. wrong owner、活动 child lease、已有原图但混合未知 started call 均由真实 recover 拒绝。核对无新 artwork/收费，wrong owner 回执为 null。
5. 当前真实 continuation 完成处理、local private storage、artwork、父子回执；按冻结配置独立调用真实 `finishStoredImage` 对照最终字节，并完整解码最终产物。记录原/最终尺寸和 hash，允许处理实际改变字节。
6. 各 12 结算一次，`reserved_credits=0`、预占行删除、钱包预占归零、`billing_settled=true`、单笔 `consume=-12`。重复 continuation 两次必须同 artwork、零新账本、冻结 payload/paid checkpoint 保持。
7. 运行时阻断 fetch/http/https/TLS，仅允许指定 PG 的 socket；不启动任何 HTTP 服务，真实和 loopback 生成 POST 都为 0。最终断言 HTTP 尝试和非 PG socket 尝试为 0。
8. finally 关闭 coordination 与 DB pools，删除本轮随机 schema 与临时媒体，重读三个 private 输入 hash 不变。脱敏报告写 `baseline.json` / `continue.json` 并重开检查。

## 交付与回滚

本模块只做本地 selective commit，不 push/deploy，不连接供应商/SSH，不执行全套测试或全 tsc。集中 baseline + continue；仅在 fixture 实际失败后修 fixture 重试。

`output/imagegen-original-result-continuation/` 保留脱敏回执与 `MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。新文件无既有内容可覆盖；回滚仅在显式指定的独立副本中按 hash 删除这两个新增文件，原产品行为/私有输入保持。真实源脚本保留新增状态，线上仍未恢复。

## 当前记录

2026-10-23 已集中运行 baseline + continue，退出均为 0：

- sample-1 原/最终均 `1536×2048`，`4,018,782` 字节，SHA256 `790a2ae28ddba485fab56fd850d6b95b352cd68a2d33de54e550df4b418b2939`。
- sample-2 原/最终均 `2048×2048`，`3,989,857` 字节，SHA256 `69161dd9522c04d65ea1efa25fc1319666c20d98e8db49479be9c250562f0d33`。
- 两图均完整 sharp 解码；原版本135的 preset 和 business postprocess 均未启用，真实处理没有改写原图，两笔真实回执均 `succeeded`、`complete=true`。
- 原无 checkpoint 两笔均拒绝、收费0、总预占24；显式证据导入后各结算12、预占0、各一笔消费账本；重复两次无新账本、同 artwork，三类 guard 全部拒绝。
- HTTP 尝试0、生成 POST0（包括 loopback）、真实 secret 导入0；临时 schema 与媒体已清理、三个 private 输入重读 hash 不变。
- 首次 baseline 在导入 PG 前暴露 fixture 对回执 `images[].url` 数组形状的错误假设（`ORIGINAL_URL_HASH`）；修正为按真实单元素数组展平后集中重试成功，未改产品或证据源。
- exact employee replay 仍0，线上两笔仍未恢复。未执行全 tsc、全套测试、push 或 deploy。此模块功能迭代计数1，未整合/更新远端主线。

字面命令、输出、退出码与副本回滚结果保留在本轮 `VERIFICATION.txt`；脱敏逐笔证据为 `baseline.json` / `continue.json`。
