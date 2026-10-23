# 最小 imagegen benchmark case 取证包

## 本轮范围与状态

- 固定基线 `cd64d1ffd4eda66afcbe7817fc9016203c92be4a`，只新增一个 Node 标准库 CLI、集中测试及本文，不修改 `channel-fetch.ts`、历史 catalog 或主 runner。
- 只处理操作者显式提供的本地文件；无 HTTP 录制、供应商请求、SSH、生产、数据库、遥测、UI、依赖变更或部署。47继续暂缓发布。本地选择性提交，不 push。
- 采集成功只表示 **captured**，不是 replayed 或 repaired。历史 catalog 的 `employeeExactRequestsReplayed=0` 保持不变；本模块不关闭 OPEN/NOT_PROVEN、不统计新增历史修复。

## 使用

```powershell
node scripts/capture-imagegen-benchmark-case.cjs --input output/operator-input/descriptor.json --output output/imagegen-case-evidence/NEW_CASE
node scripts/capture-imagegen-benchmark-case.cjs --verify output/imagegen-case-evidence/NEW_CASE
# 模块完成后一次集中测试，无DB、无额外依赖
node --test scripts/test-capture-imagegen-benchmark-case.cjs
```

输出必须是当前 checkout 的 `output/` 下**新目录**，并经实际 `git check-ignore` 和未跟踪校验；拒绝覆盖、路径穿越、UNC/设备路径、ADS及 symlink/junction。输入 descriptor 可以是本地绝对路径，其 evidence.path 只能是相对于 descriptor 的向下路径。错误只打印固定错误码，不打印原路径、JSON正文或堆栈。成功 exit0 只证明本地包校验通过，错误 exit1。

输出为 `manifest.json` 和零到多个 `evidence/e-NNN.json`。每个输入按原始字节校验操作者给定 SHA256；分享副本规范化序列化，另记最终字节 hash/长度，重开校验。私有原件只分块读取/hash，不自动复制、上传或提交，manifest 不包含源绝对路径、原文件名或 descriptor 副本。manifest 自身不能自引用 hash；归档时对 manifest 另外计算 SHA256。

## Descriptor v1

```json
{
  "schemaVersion": 1,
  "caseId": "case-local-busy",
  "fidelity": "mechanism-fixture",
  "source": {
    "commit": "cd64d1ffd4eda66afcbe7817fc9016203c92be4a",
    "entrypoint": "/api/imagegen",
    "operationPseudonym": "op-0123456789abcdef"
  },
  "inputAssetCount": 0,
  "evidence": [
    {
      "id": "parameters-one",
      "role": "parameters",
      "origin": "fixture",
      "sourceId": "fixture-local",
      "operationPseudonym": "op-0123456789abcdef",
      "handling": "shareable-json",
      "path": "parameters.json",
      "sha256": "REPLACE_WITH_SHA256_OF_EXACT_LOCAL_BYTES"
    }
  ]
}
```

这是字段示例，实际最少还需 `operation-sequence`、`initial-state`、`fault-conditions` 三份证据；缺项会拒绝。`inputAssetCount` 是原操作所需原素材数量，不是“当前找到了几张”，未取得的素材仍填原数量。caseId/id/sourceId 必须为去身份短别名，operation 必须为操作者预先生成的 `op-`＋16–64位十六进制伪名，不填原身份/operation ID。source.commit 要求40位实际版本；入口枚举为 `/api/imagegen`、`/api/generate-image`、`worker-recovery`、`local-handler`、`parameter-function`。此处版本与来源是操作者声明，不等于工具核验了历史出处。

每条 evidence 必填上述所有字段；原件 `origin=original`、脱敏投影 `sanitized-original`、机制样本 `fixture` 必须区分。每条绑定同一 operation 伪名，`sourceId` 是同案原来源索引；原来源文件的**实际字节 hash** 与分享副本 hash 分开。cohort汇总报告不能冒充原POST/原图；工具不认证文件的历史真实性。

|role|shareable-json 可接受的最小结构|
|---|---|
|parameters / frozen-config|白名单参数：width、height、count、referenceCount、modelVersion、billingVersion、sizePolicyVersion，及 ratio（如1:2）、resolution（1K/2K/4K/auto）、quality（枚举）|
|request|`{"method":"POST","parameters":{"width":1024,"height":2048}}`；只接受 GET/POST，不是完整HTTP原包|
|response|`{"status":403,"outcome":"failed","deliveredImages":0}`；outcome 为 failed/pending/delivered/unknown/rejected|
|frozen-quote|`{"modelVersion":112,"billingVersion":8,"credits":14,"count":1}`|
|operation-sequence|`{"steps":[{"action":"preview"},{"action":"submit","afterMs":200}]}`|
|initial-state|`{"status":"new","reservation":"none","checkpoint":"none","paidOperation":"not-started"}`|
|fault-conditions|`{"conditions":[{"kind":"supplier-quota","httpStatus":403,"afterStep":1}]}`|
|input-asset|只能 `private-hash-only`，不复制原图或任意二进制|

完整 action/state/fault 枚举和数值边界以 CLI 的 `validatePayload` 为准。未知字段、嵌套任意内容、自由描述、prompt、邮箱、Authorization、cookie、token、secret、URL（包括query/userinfo）等一律拒绝，而非猜测式正则替换。保密字段即使值为“已脱敏”也不进入共享结构。完整原prompt/原请求/原响应/原quote/config如需留证，放在本机已有私有原件，使用 `private-hash-only`。`ignored` 不是脱敏保证；操作者仍应检查去身份别名及原来源声明，不把私有文件连目录打包分享。

## 精度与完整性

- **mechanism-fixture**：最少具备参数、操作顺序、初态、故障条件；允许 synthetic/local fixture。缺失原始证据在 `evidenceCompleteness.missingOriginalEvidence` 逐项列出。
- **original-parameters**：另要求 parameters 有实际校验hash的 `origin=original` 证据；脱敏投影不自动升级为原参数，原图/原quote等缺失不掩盖。
- **exact-full-request**：仅为**原材料完整候选**。必须具备同operation的原 request、response、parameters、frozen-quote、frozen-config、operation-sequence、initial-state、fault-conditions，以及与 inputAssetCount 一致的全部原素材；request/response 必须 private-hash-only。缺任何一项、标为 fixture/sanitized-original 或混案均拒绝，不静默升级。即使齐全，来源真实性仍是 operator-declared / not-authenticated。

三类输出都固定 `status=captured`、`replay.status=not-run`、`replay.result=null`、`exactReplayVerified=false`、`employeeExactRequestsReplayed=0`、`historyClosure=NOT_PROVEN`、`historicalIncidentsResolvedByThisCapture=0`。descriptor 不接受 replay/closure 等自报结论；verify 重算完整性并拒绝被篡改的 exact/replay/修复声明。字段齐全、hash正确、包verify通过都不证明精确重放。

## 供既有 runner 读取（本轮不改主 runner）

CommonJS 可直接 `const {verifyCase} = require('./capture-imagegen-benchmark-case.cjs'); const m = verifyCase(caseDir);`，或先执行上述 `--verify`。调用无导入副作用，不执行 manifest 中的命令。读取 `m.source`、`m.fidelity`、`m.evidenceCompleteness`、`m.evidence[].packageFile`；分享文件的 path 仅在包内有效，private 项的 packageFile 永远为 null。verify 可重新确认分享文件的实际hash、schema与目录清单，**不能**在未重新提供私有原件时验证其仍存在/未变化。captureTool.sha256 标识采集器字节，不是签名。

以后 replay 应另存独立结果，绑定 manifest hash、每份实际输入hash、baseline/modified完整产品commit、runner hash、真实命令、输入、字面输出及exit。原版复现目标故障、新版完成原合同，还需原始出处核查和最终图像/持久化/作品归属/父子回执/结算/无重复付费证据；现有机制 runner 不会因读到一个新 case 自动重放私有原件，也不会将采集材料计作员工历史修复。不要执行未审阅的 descriptor 指令，不自动重提历史收费任务。

## 实现与验证记录

- 复用已有 `output/` ignore 约定、Node标准库和历史三层证据口径，无新框架/平台；依赖、产品源码、catalog、主runner不改。
- 集中覆盖合法包、三种精度、秘密/PII及错误输出不回显、逐字节hash、私有原件不复制、缺字段/错hash、路径穿越/链接逃逸/覆盖、伪造exact与replay/closure、额外文件与产物篡改。
- 本地三组实跑与四产物见 `output/imagegen-case-capture-20261023/VERIFICATION.txt`；其中 baseline/rollback 的预期行为是该基线不存在新 CLI，modified 才生成合法包。它们验证新增取证工具的可逆性，不是历史产品缺陷修复验收。
- 待父整合：主runner的选择性读取接线、实际原证据审查及真实replay。未连接/发布47，无新增供应商调用。
