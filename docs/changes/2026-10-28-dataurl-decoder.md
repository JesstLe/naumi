# 大图 data URL 解码修复补强

## 范围与基线

- 用户指定分支：`codex/fix-dataurl-stack-20261028`。
- 原切片修复：`3939562fdea5e32e640827b8bb068b61465dce60`；主线基线：`3f3ac34cbed349f4cb51c0786cc174d33a627f5c`。
- 只修改 `storage.dataUrlToBytes` 的解析与拒绝条件；不改图像尺寸、供应路由、计费、租约或恢复调度。
- 用户同步的现场样本：10/28 09:32 的 `job-c01e2f99`（2K、3:4、两参考图），另有 `imagegen-82ee53af` stored delivery RangeError。本轮将其作为调用链背景，不调用线上任务查询、恢复或重提，不把合成测试写成两笔线上任务已恢复。

## 实现

- 保留 `indexOf` / `slice`；MIME 和 Base64 均以迭代扫描校验，大 payload 不进入正则或递归。
- MIME 必须是非空的 type/subtype token；保留大小写，支持例如 `image/svg+xml`、`application/octet-stream`。不扩展参数化或百分号编码 data URL。
- Base64 允许标准字母表及正确的可选末尾填充；拒绝空正文、空 MIME、非法字符、空白、URL-safe 字母、内部/过量填充及不完整单 sextet。
- 合法的无填充 Base64 继续支持；不额外要求规范化 pad bits。
- 保留返回类型、独立 `Uint8Array` 字节及 `null` 拒绝语义；不加新的尺寸/分辨率业务上限。图像格式/像素及现有读取大小限制仍由原调用方负责。

## 调用链

- 首次交付：`generate-image` 输出处理、`persistToStorage` 调用该解码器。
- 原结果恢复：`recoverStoredDelivery → readCanvasOutput → readOwnedCanvasImage → dataUrlToBytes`。
- 验证覆盖真实完整模块的解码、原读取函数和大 PNG 字节一致性；真实路由/数据库验收使用独立 fixture，不访问生产供应商。

## 模块边界

- 职责：把现有裸 MIME、标准 Base64 data URL 解析成字节，非法输入返回 `null`。
- 接口不变：`dataUrlToBytes(url: string): {bytes: Uint8Array; contentType: string} | null`。
- 依赖保持 storage → 对象存储；解码器本身无 I/O、DB、SDK 或计费依赖。没有新增框架或迁移任务。
- 一次线性字符校验后交给 Buffer 解码，保留原来的独立字节分配；不声称零拷贝或恒定总内存。

## 已执行的集中验证

| 验证 | 已观察结果 |
| --- | --- |
| `scripts/verify-dataurl-decoding.cjs`，完整 storage/canvas 模块 transpile + VM | 41 项 PASS；同组断言在原切片版复现 26 项非法输入误接收，baseline 预期 exit 1 |
| 有效输入 | MIME 大小写、SVG、一般二进制、1–96 字节 padded/unpadded roundtrip；未变成 MIME 白名单 |
| 大图 | 1536×2048 PNG，9,454,425 字节，12,605,900 个 Base64 字符；完整像素解码及 SHA-256 相同 |
| 调用方预算 | 13 MiB 输入仍被原 12 MiB 输入预算拒绝，原输出读取预算可读取相同字节；未增加新限额 |
| `scripts/verify-dataurl-delivery.ts`，真实路由 + 独立 PostgreSQL + 真实本地存储 | 两张不同参考图，2K、3:4：14 项 PASS；父子 done、作品字节一致、一次模拟供应商请求、一次生成结算 |
| 原结果恢复 | 在独立 schema 注入“已结算但交付中断”，删除该 fixture 产物记录并保留大 inline checkpoint；真实 recover-delivery 恢复同 SHA，重复恢复幂等、另一 owner 拒绝、恢复新增供应商请求 0、全部原账务行未变 |
| `node scripts/verify-storage-s3first.cjs` | 20 项 PASS，保留远端优先、本地镜像、大小限制与存储失败行为 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0，无 stdout/stderr |

脚本使用本地供应商与一次模拟扣款（8 积分），不是线上供应商/真实用户扣款；解码 VM 外部网络 0，真实路由 fixture 外部网络尝试 0。

大图 SHA-256：`9bd44a87ba50af0b17ed9fad380eb761b86ce55f4b2ff4ceff37aee43e606744`。

### 复用命令

```powershell
node scripts/verify-dataurl-decoding.cjs --output-root <绝对独立目录>
node scripts/verify-dataurl-decoding.cjs --source-file <原storage.ts绝对路径> --baseline --output-root <另一绝对目录>
# 先准备独立的 loopback PostgreSQL；不使用已有业务库。
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:<fixture端口>/dataurl_fixture'
node --conditions react-server --import tsx scripts/verify-dataurl-delivery.ts --png <上一步fixture-1536x2048.png> --output-root <另一绝对目录>
```

baseline 验证的是原切片版的格式误接收，不把当前 Node 的合成测试称为生产 V8 栈异常的逐字复现；原切片版本身的大图正控通过。报告记录实际源码路径和 SHA。

### 保留的首次失败与独立发现

- 初始路由 fixture 的管理凭据短于 32 字符、模拟模型未声明引用保持能力，分别被真实入口拒绝；只修正测试配置。
- 模型仓库可能提前导入 storage，因此 fixture 必须在创建模型仓库之前设置存储环境，并断言实际加载值。
- 两张完全相同的测试图片触发 Windows local adapter 同 key 并发 `rename` 的 `EPERM`；原始堆栈保留在 `tests/delivery-r6/RESULT.json`。它发生在 data URL 解码之前，是另一个本地存储并发问题，本增量未修改该 adapter，也不称它已修复。最终 14 项覆盖两张**不同**参考图，未取消参考图数量断言。
- 首次账务断言把注册赠送和测试充值也计作生图操作；最终同时断言恰好一笔生成操作、一笔正数扣款、一笔对应负数 ledger，并对恢复前后全部账务行做 deep equality。
- 失败报告均保留，未靠改产品或放宽实际交付/幂等/账务结果通过。

## 回滚、整合与交付状态

- 原切片版 `storage.ts` SHA-256：`8f252be8aa8486a8bf08af149db5820a59629f20cd840974194caa3f6ff702ae`。
- 优化版 `storage.ts` SHA-256：`d4449382dec3262e062198cc3ef35f8b0cbf8fdfa515b4bb4584717ac67e4420`。
- 四制品使用原切片修复 `3939562f` 为补丁/恢复基线；回滚只在独立副本进行，恢复后仍是原切片版，不重新引入旧主线长正则。
- 最终原始命令、逐加载 hash、集中验证、副本回滚、实际 Git 整合回执保存在外部 `artifacts/VERIFICATION.txt`，不以源码验证替代上线。
- 没有执行线上两笔任务的恢复、重试或扣费。47 发布 HOLD 保持；此文档不表示已部署。

证据目录：`E:/Workspace/naumi/output/dataurl-decoder-20261028-r1`。
