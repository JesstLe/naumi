# A57/D39、A58：上传完整解码验证内存切片

## 基线、归属与交付状态

- GLM A27/D12 → 父 A57/D39；GLM A28 → 父 A58，沿用总账顶部映射，没有新增编号或编辑总账。
- 工具分配工作树 `C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a`，分支 `t3/upload-decode-memory`。开工干净，开工与收尾 fetch 后 HEAD/origin/main 均为 `c328f01c5a1854bce271fa53e64d324986df9329`。
- 本切片完成本地源码修复、实际 Sharp/route 集成、隔离进程量化、完整类型检查和独立副本回滚；只固定 task-only commit，交父线程串行整合。不 push、合共享 main 或建 PR。
- 本轮没有 SSH、生产 DB、容器、供应商调用、真实用户输入输出或 UNKNOWN 操作。47 发布决定与45笔手术状态保持独立，不将本地回归当作发布或全站容量验收。
- 开工空闲物理内存约9.1GiB，收尾约16.75GiB；未创建 PG/容器/服务。内存压测子进程串行启动，每个进程内完整上传并发只取1或3。

## 模块与职责、真实调用链

```text
POST /api/media/uploads complete
  → owner/pending/committed_id/expiry/parent 检查
  → 已有 asset_key 且 asset 存在：复用资产，不重新读取/解码
  → staging readManagedObject（实际有界读取与 reader finally）
  → 实际字节数、metadata格式与像素上限检查
  ├─ 无 browser previews（保持 ≤12MiB）：
  │    完整解码验证 → uploadImage 原字节
  │      → writeStoredObject → registerMediaAsset
  │        → ensureMediaVariants → makeMediaVariants
  │          → 全幅 raw 用于真正制作512/1600预览
  └─ 有 browser previews：saveCanvasOriginal
       → 原图metadata/静态格式/EXIF尺寸检查
       → 两张有界browser previews完整解码检查
       → 原字节与browser previews存储、归属/sha校验与资产事务
  → 冻结 asset_key → addArtworks → committed_id
```

`uploadImage` 会吞掉登记失败，`registerMediaAsset` 会吞掉预览失败，已有变体还可跳过下游解码。因此直接删除路由前置完整解码、把 metadata 当验证、或仅依赖“通常会生成预览”都不成立。本任务保持这些已有存储/登记行为，没有扩散修改共享 storage/media-assets。

**唯一修改归属：** `src/app/api/media/uploads/route.ts`、新增 `src/lib/upload-image-validation.ts`，以及必要窄调用方 `src/lib/media-variants.ts` 的同类像素常量引用。`image-upload-policy.ts`、`canvas-original-upload.ts`、imagegen/pixels 等 A31 既有修复仅只读参考。

## 实现与接口

- `validateUploadImageDecode(bytes: Buffer): Promise<void>`：用相同 `failOn:'error'` 和 `ORIGINAL_IMAGE_MAX_PIXELS`，执行全图 `resize(1,1, fit:'fill', kernel:'linear', fastShrinkOnLoad:false)`，没有 extract、nearest 采样或仅 metadata 快捷放行；`removeAlpha` 只作用于丢弃的验证输出。`finally` 销毁本次 Sharp 实例。
- 验证仍遍历输入图像/默认帧的解码路径并传播错误；PNG/JPEG 后半部与99%处截断、metadata 可读但 VP8 尾部缺失均继续拒绝。这里的“完整”是完成默认图像/帧解码，不是逐字节容器取证，也没有把动画语义扩展为遍历所有帧。
- 验证输出从全幅像素缓冲变成一个像素（本样本均3字节）；它不会流入存储、缩略图或作品。原始 `data.bytes`、哈希、EXIF、格式与实际512/1600变体编码完全不变。
- 实际变体制作仍有一次必要全幅 raw。未宣称原生codec工作集成为常量，WebP仍可能有较大的本地/native分配；也未改全局 Sharp cache/concurrency。
- 不新增业务限额、队列平台或并发门禁。现有 fixture 没有证明需要某个新的生产并发阈值；本次仅移除无用的全幅输出分配。
- 单向依赖为 route → validation → sharp/policy；media-variants → sharp/policy。验证 helper 没有 DB、事务、跨请求缓存或共享状态。owner、幂等、资产冻结及事务仍由原 route/storage/media-assets/saveCanvasOriginal 所有。

### 明确保留的分支语义

- 无 previews 的 GIF/WebP 动画仍与基线一样验证默认第一帧，原动画字节不变；有 previews 的 originalImageMetadata 仍拒绝多帧，测试使用实际两帧文件而非被编码器折叠的重复帧。
- browser previews 路径仍只对原图做 metadata 检查、对两张预览完整解码，不把它描述成服务端逐像素验证了原图。大原图快速路径未被本任务改成再次完整解码。
- 已有 asset 与 committed_id 重试不重读 staging、不重新解码、不重写媒体；已有作品被删仍为410。owner/parent/大小/格式/过期错误状态保持。
- 失败释放覆盖 decoder失败、对象读取流 AbortError、multipart body AbortError、存储失败与同id重试；没有引入新的已受理任务取消/重放语义。真实 PG 并发事务隔离与跨进程幂等未由SQL fixture证明。

## A58：各上限的职责，而非机械统一

| 值 | 当前职责 | 本次处理 |
|---|---|---|
| 64,000,000 pixels | 归档原图、上传验证、同一原图的媒体变体 | route/helper/media-variants统一引用已有 `ORIGINAL_IMAGE_MAX_PIXELS`，数值不变 |
| 40,000,000 pixels | imagegen像素编辑/处理；本地编辑、3D输入和企业派生图也各有40M契约 | 不按名称强行合并不同业务；相关源码未改 |
| 64×1024×1024 pixels = 67,108,864 | Agent managed-reference 的独立metadata读取上限 | 不是上传归档契约，未降低到64M或33.5M；参考图通道保持原行为 |
| 64×1024×1024 bytes | 归档/prepare/对象读取原字节预算 | 与pixels单位不同，保持64MiB |
| 12×1024×1024 bytes | 无browser previews兼容上传阈值 | 精确边界接受，+1字节拒绝，未把它与模型reference预算因同值硬绑 |

A58在本上传切片完成职责核对与真实同类常量收敛；不代表所有模型参考/像素处理通道已统一或完成容量校准。

## 集中验证与证据层级

- 可复用测试：`scripts/verify-upload-image-memory.cjs`。先 `node scripts/verify-upload-image-memory.cjs . modified generate` 生成合成输入，再 `node scripts/verify-upload-image-memory.cjs . modified suite`。执行器先用大小写无关的 SYSTEMROOT/WINDIR/PATH/TEMP/TMP 白名单重启自身，不读取.env。
- Node v24.19.0，Sharp0.34.5，libvips8.17.3；实际调用 NextResponse、原route、body reader、canvas-original-upload、storage、media-assets、media-variants与真实Sharp。仅鉴权、SQL状态、对象存储adapter及release观察器替换为本地fixture。不是完整Next启动、真实PG事务或实际S3/R2验收。
- BASELINE/MODIFIED/ROLLBACK 各39项。逐项比较原图/thumbnail/preview SHA256、尺寸、响应与错误状态；只允许验证用raw输出字节数差异。回滚结果包括raw字节数在内与baseline完全相同。
- 覆盖64MP高压缩PNG、64MP JPEG/WebP、透明、EXIF、真实两帧GIF/WebP、AVIF、metadata可读的PNG/JPEG/WebP截断、恶意尺寸、MIME/字节不匹配、>12MiB正常原图与browser previews、12MiB精确边界、owner/parent、已有资产、已删作品、并发完整上传和同id重试、读取/写入/请求body失败释放。
- 同id并发仅验证实际route在SQL fixture中的稳定资产/作品身份，未把它升级为真实Postgres并发验收。
- 初次完整tsc使用旧共享依赖，因缺少Three.js及旧React类型退出2；初次通配依赖映射也解析失败（原始日志保留）。最终本地临时tsconfig只将React/Three类型解析到已有完整依赖的只读路径，不改共享依赖、不改源码或删类型检查。完整tsc退出0；原配置与临时配置根文件集合完全一致：**2105个**。测试Sharp原生二进制与完整依赖目录同文件SHA一致：`afc813593f255968ddae8f1d66557e0f96484bb374606e4eb2267a7dbc7cb25a`。

## 隔离进程实测

每组3轮，全新进程；同一进程中1或3个完整complete上传，合计36进程。进程内每2ms采样RSS；下表是**采样峰值RSS中位数**，包含实际route/Sharp、fixture与运行时，不是生产上限或严格高水位。所有原图8000×8000，原始哈希见 `INPUTS.json`。未将64MP×4的244.14MiB理论raw输出直接当作RSS。

| 格式 | 并发完整上传 | 基线RSS MiB | 修复RSS MiB | 基线耗时中位ms | 修复耗时中位ms |
|---|---:|---:|---:|---:|---:|
| PNG | 1 | 644.28 | 474.32 | 565.06 | 700.49 |
| PNG | 3 | 1459.06 | 1118.99 | 1548.45 | 1482.90 |
| JPEG | 1 | 523.34 | 360.71 | 385.26 | 314.02 |
| JPEG | 3 | 1154.03 | 815.88 | 689.66 | 583.87 |
| WEBP | 1 | 845.27 | 605.35 | 1383.76 | 1585.09 |
| WEBP | 3 | 1630.69 | 1557.23 | 3392.56 | 3647.94 |

- 六组RSS中位数降低，但WebP并发3的分布重叠：基线1561.24–1962.86MiB，修复1517.63–1610.77MiB；第一轮修复值高于该轮基线。不能说每一轮都降，更不能用这些数据承诺任意生产并发。
- PNG单并发与WebP验证存在CPU/时间代价；实际耗时如表，未以“全部加速”包装内存优化。
- 测试记录的实际raw输出总量（验证+既有变体）64MP PNG/WebP每请求从512,000,000降至256,000,003 bytes，JPEG从384,000,000降至192,000,003。下游有用raw仍保留。
- 备选 `stats()` 已在初步真实Sharp探针否决：64MP PNG验证RSS采样峰值约492,224,512 bytes，高于原raw方案342,302,720 bytes，还额外计算直方图/清晰度；未采用它冒充廉价验证。

## 三阶段与回滚：准确命令、输入、literal结果

下列OUTPUT是完整日志末行；每一条逐项输出、stderr、exit与36进程内存原始输出均完整保存于 `VERIFICATION.txt` / `COMMANDS.json`，没有将聚合执行器初次TSC失败抹成成功。

### BASELINE

```text
COMMAND="D:\\DEV\\NodeJS\\node.exe" "scripts/verify-upload-image-memory.cjs" "output/capacity-upload-memory-20261029/baseline-source" "baseline" "suite"
INPUT=Synthetic fixtures in INPUTS.json; no stdin
OUTPUT=SUITE=PASS MODE=baseline CASES=39 NATIVE_QUEUE=0 NATIVE_PROCESS=0 NETWORK=0
EXIT=0
```

### MODIFIED

```text
COMMAND="D:\\DEV\\NodeJS\\node.exe" "scripts/verify-upload-image-memory.cjs" "." "modified" "suite"
INPUT=Synthetic fixtures in INPUTS.json; no stdin
OUTPUT=SUITE=PASS MODE=modified CASES=39 NATIVE_QUEUE=0 NATIVE_PROCESS=0 NETWORK=0
EXIT=0
```

### ROLLBACK_GUARD

```text
COMMAND="D:/DEV/Git/bin/bash.exe" "C:\\Users\\13357\\.t3\\worktrees\\naumi\\t3-16406d6a\\output\\capacity-upload-memory-20261029\\ROLLBACK.sh" "C:\\Users\\13357\\.t3\\worktrees\\naumi\\t3-16406d6a\\output\\capacity-upload-memory-20261029\\rollback-drift"
INPUT=Synthetic fixtures in INPUTS.json; no stdin
OUTPUT=ROLLBACK_GUARD=REJECT WRITES=0 TARGET_HASH src/lib/media-variants.ts
EXIT=23
```

### ROLLBACK_APPLY

```text
COMMAND="D:/DEV/Git/bin/bash.exe" "C:\\Users\\13357\\.t3\\worktrees\\naumi\\t3-16406d6a\\output\\capacity-upload-memory-20261029\\ROLLBACK.sh" "C:\\Users\\13357\\.t3\\worktrees\\naumi\\t3-16406d6a\\output\\capacity-upload-memory-20261029\\rollback-source"
INPUT=Synthetic fixtures in INPUTS.json; no stdin
OUTPUT=ROLLBACK=PASS FILES=3 ORIGINAL_HASHES=RESTORED NEW_HELPER=ABSENT
EXIT=0
```

### ROLLBACK

```text
COMMAND="D:\\DEV\\NodeJS\\node.exe" "scripts/verify-upload-image-memory.cjs" "output/capacity-upload-memory-20261029/rollback-source" "rollback" "suite"
INPUT=Synthetic fixtures in INPUTS.json; no stdin
OUTPUT=SUITE=PASS MODE=rollback CASES=39 NATIVE_QUEUE=0 NATIVE_PROCESS=0 NETWORK=0
EXIT=0
```

### TSC_COMPLETE_DEPS

```text
COMMAND="D:\\DEV\\NodeJS\\node.exe" "C:/Users/13357/.t3/worktrees/naumi/t3-18c8ab7e/node_modules/typescript/bin/tsc" "--project" "output/capacity-upload-memory-20261029/tsconfig.complete-deps.json" "--noEmit" "--incremental" "false"
INPUT=Full original tsconfig source set; read-only React/Three type mappings; no stdin
OUTPUT=(empty stdout/stderr)
EXIT=0
```

副本回滚先一次性检查全部源快照、目标、hash与新文件原始缺席状态，再写任何目标。故意修改清单最后的media-variants后，guard退出23且三个目标hash全部不变。正常独立副本恢复2个旧源码、移除新增helper，重跑39项后恢复原raw行为；当前工作树和MODIFIED_FILE均保持修复。

## 四产物与原hash

- MODIFIED_FILE: `C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a/output/capacity-upload-memory-20261029/MODIFIED_FILE.ts`
- DIFF_FILE: `C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a/output/capacity-upload-memory-20261029/DIFF_FILE.patch`
- VERIFICATION: `C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a/output/capacity-upload-memory-20261029/VERIFICATION.txt`
- ROLLBACK: `C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a/output/capacity-upload-memory-20261029/ROLLBACK.sh`

- route原SHA256：`0b09ec85fa0ce26cb3baa6d05595bb27834d58b179322c1e9a1f7a4865680770`；修复SHA256：`a3faa74b1669a519006f540a3f13fbc51b79734b74c4ea149bdb923a0d182a40`。
- 三源码逐文件原/改hash：`C:/Users/13357/.t3/worktrees/naumi/t3-16406d6a/output/capacity-upload-memory-20261029/SOURCE_MANIFEST.json`；原始基线源码快照与独立副本在同一证据目录，输出目录不纳入任务提交。
- ROLLBACK.sh已实际执行且Git Bash `test -x`退出0。四产物生成后重开内容/hash检查；回滚只允许证据目录中的明确rollback-*副本，拒绝当前源码目录。

## 未完成项与父线程下一步

父线程按固定task-only提交串行整合，并在实际目标环境验证完整Next鉴权、真实PG/存储、进程级并发与峰值资源。该切片没有改变发布门禁，也没有关闭整个容量审计、A58其他用途上限、跨进程幂等或生产容量。当前工作树无fixture进程/服务/DB/container待清理，保留输入/日志/四产物供父核对。

## 父线程集中验收（2026-10-29）

父从main`956b7238`普通合入固定`6ad2fb38`，生产源码未再修改。复测使用原脚本断言，只将root/output指向父证据目录；生成同一组合成文件。BASELINE和MODIFIED各39项exit0，除`validationBytes`之外所有记录逐项相同：原图、thumbnail、preview的SHA、尺寸、状态与错误行为保持。

父另跑四个独立Node进程，PNG/WebP各取3个64MP完整上传并发：原每组raw输出总量1,536,000,000bytes，修改768,000,009bytes。PNG采样RSS原1,562,398,720、改1,212,997,632bytes；WebP原1,977,360,384、改1,681,522,688bytes。这是本轮各一次的采样，不是36轮重测、严格峰值或生产阈值；PNG本轮耗时反而增加，不宣称全场景提速。单次无用验证输出从256,000,000降至3bytes，实际制作变体的全幅raw仍保留。

父完整`tsc --noEmit --incremental false`使用既有匹配依赖，exit0、stdout/stderr空；没有修改共享依赖或缩减检查根集。原/改/修改副本/回滚精确结果、恢复2原文件/移除新增文件、全量later-edit guard以及重新打开证据位于`output/capacity-audit-wave2-20261029/upload-parent/`。四产物包含本切片五文件，源码与修改快照保持修复。

原输入数据/解码验证/SQL fixture层级不变；未增加真实PG并发、HTTP、完整Next、真实对象存储或生产验收声明。A57源码内存缺口闭环；A58只完成同一原图职责内常量收敛，不把各业务上限强行统一。A4媒体并发及其他运行配置另行独立复核，不混入本上传切片。
