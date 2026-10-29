# 容量审计第二棒：imagegen 图片处理管线

## 模块、基线与职责

- 分配的独立 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-d79c7561`，分支 `t3/imagegen-pipeline-optimization`。开工工作树干净；HEAD 与 fetch 后 origin/main 均为 `c63ceb1392e1918f8ed9ddfee7389ec2d677a4dd`。沿用工具已创建的 checkout，没有另建或切换 checkout。
- 收尾再次 fetch，origin/main 仍为同一完整 SHA；没有整合未知分支。本轮为一个业务切片。
- 已读本目录 AGENTS.md、协作约定、容量总账第七章末、imagegen 能力设计与参考图画幅记录。本任务只拥有 `postprocess.ts`、`pixels.ts`、`chroma.ts` 的像素切片及专属测试；`mask.ts`、`input-assets.ts` 仅调查/调用回归，没有更改。
- 不修改总 ledger 或分配 A/D 编号；没有改 X4 解析文件、X5 durable/storage、canvas 客户端、operation/attemptToken、授权、账务和 fencing。
- 本轮 47 HOLD 保持，无 SSH、部署、生产测试、DB/对象存储资源、供应商调用或已受理任务重放；45 笔手术和在线 created_at 索引仍挂账。仅本地合成输入与真实 Sharp。本任务只固定提交，不 push/merge/PR。

## sharp 调用图与执行边界（源码核对）

```text
imagegen/dispatch.runParent
  ├─ 蒙版 preserveMaskedOutside：target/mask/generated 三份各 decode
  │    → raw resize / alpha 合成 → PNG（未修改）
  └─ saveCanvasLocalEdit(mode=process)
       → processImagegenPixels
           → decodeImagegenPixels（静态格式/字节/40MP、EXIF、sRGB、RGBA）
           → 可选 chroma → 初始 alpha 检查
           → resize / flatten / PNG|WebP|JPEG → 最终实际文件 alpha 检查

generate-image route / canvas-image-tasks
  → runPostprocess → resumePostprocess → transformImage(kind=imagegen)
       → 同一 processImagegenPixels
imagegen/finish-stored-image
  → transformImage（冻结 post 参数；旧 upscale 分支未修改）
dispatch.artifacts / imagegen.stored-delivery
  → inspectImagegenPixels（读取交付或历史结果，未绕过）

input-assets.saveImagegenInput
  → decodeImagegenPixels + metadata → 原字节私有存储（未修改）
```

上述 Sharp 在调用该 TypeScript 模块的应用进程中执行。`scripts/video-media-worker.mjs` 走 `video-fusion/media-engine.mjs` 的媒体操作；其并发门禁及 `video-worker-with-media.mjs` 的单媒体作业约束不是本函数的 Sharp 并发控制。这里只证明源码调用边界，不推断当前 47 的实例、负载、部署或内存。

## 证实的重复工作与实现

真实 `sharp.prototype.toBuffer` / `metadata` 观察器只记录调用并原样转交，不替换原生结果、不绑定 error listener、不补生产能力。计数单位是**已执行的编码输入解码 pipeline / 编码输出 pipeline**；metadata 是独立头部探测，raw→raw 不计编解码。不宣称该计数等同 libvips 内部缓存后的底层 codec 调用次数，也不从 clone 或像素字节数推断 RSS。

- 基线普通分支：decode 输入 → raw 编码中间 PNG → inspect 解码该 PNG → 最终处理再次解码该 PNG → inspect 解码最终文件。成功路径 4 次解码 / 2 次编码 / 3 次 metadata。
- 基线 chroma 分支还重复解码原输入：5 / 2 / 4。
- `pixels.inspectDecodedImagegenPixels` 负责已规范化 RGBA 的 alpha 事实；外部 `inspectImagegenPixels(Buffer)` 仍执行真实解码，签名/返回字段不变。
- `chroma.applyChromaToPixels` 只修改该调用独占的 decoded Buffer，接收已 schema 校验的配置。`removeChroma(Buffer, options)` 保留兼容 PNG 字节接口。边缘处理原 alpha 上限只在需要时分配，在现有 matte 循环中捕获，删除额外全图读取；原输入 Buffer 不变。
- 不缩小时直接从该 RGBA 编码：普通/chroma 均 **2 次解码 / 1 次编码 / 2 次 metadata**，其中第二次解码专门验证实际最终文件。
- **真实缩小时保留一次无损中间 PNG，复用 raw 初检，不再解码该 PNG 作初检**：普通/chroma 均 **3 / 2 / 2**。无放大场景不进入此分支。没有降低像素上限、质量、采样核或改变全局 Sharp cache/concurrency。

### 实测否决的全 raw 缩图方案

首版所有分支直接 raw resize，41 个语义用例通过，但五轮独立进程 12MP→2K 缩图的采样峰值 RSS 中位数从 **293.36 MiB 增至 383.80 MiB**。首轮完整证据保留为 `BENCHMARK-first-raw.json/.log` 与 `first-all-raw/`，不删除反例。

源码核对 Sharp 0.34.5 原生 raw 入口为 `VImage::new_from_memory`，不同于顺序 PNG decoder；本轮不以这一源码差异单独断言内部分配机制。尝试整图 extract、raw 中间结果、raw stream 的独立副本探针仍未消除该样本内存回退，保留 `RAW-RSS-PROBES.json`。最终只在实际缩小分支保留既有无损顺序输入，避免拿调用数下降换内存回退。此分支仍保留 2 次编码，不写成所有分支均单次编码。

## 公共接口、依赖与状态归属

- `processImagegenPixels(bytes, {output,chroma})`、`inspectImagegenPixels(bytes)`、`removeChroma(bytes,chroma)` 对现有调用者不变。
- 返回仍为 `bytes,mime,width,height,transparentPixels,fullyTransparentPixels,visiblePixels,totalPixels`；字段均来自实际输出，不来自请求/metadata 猜测。
- 单向依赖：postprocess → schema / pixels / chroma；chroma → pixels / schema；pixels → sharp / limits。新增两个内部像素接口不触及持久化。
- decoded RGBA 由当前调用拥有，chroma 原地消费；请求和输入字节保持不可变。账务/任务/事务/存储仍归原模块，不引入缓存、跨请求共享像素或新服务。
- 全透明拒绝、无透明像素禁止透明成功、resize 后可见主体/透明消失拒绝、JPEG 显式 flatten 背景、EXIF 旋转、sRGB、PNG/WebP/JPEG 编码参数、动画/格式/字节/40MP 限制均保留。

## 验证入口与证据层级

依赖只读 junction 指向用户指定 `t3-18c8ab7e/node_modules`；本轮实测 Node `v24.19.0`、Sharp `0.34.5`、libvips `8.17.3`、React `19.3.0`、pg `8.20.0`。没有安装/写共享依赖。执行器仅复制 SystemRoot/WINDIR/PATH/TEMP/TMP 给子进程，不加载 .env，不传 DB/storage/provider 配置。

```powershell
node output/capacity-image-pipeline-20261029/run-evidence.cjs all
```

持久化到 Git 的可复用测试入口：

```powershell
node --conditions=react-server --require=tsx/cjs scripts/verify-imagegen-pipeline.cjs baseline <原始源码副本> <证据目录>
node --conditions=react-server --require=tsx/cjs scripts/verify-imagegen-pipeline.cjs modified . <同一证据目录>
node --conditions=react-server --require=tsx/cjs scripts/verify-imagegen-pipeline-callers.ts
node scripts/benchmark-imagegen-pipeline.cjs <证据目录> <原始源码副本> .
```

- 真实像素 suite：41 场景，基线语义 233 项；修改版含 baseline SHA/全量 RGBA/编码字节/尺寸/alpha 等价对比共 409 项。27 个成功输出编码字节完全相同；14 个拒绝输出字面错误与基线一致。基线优化预算故意 exit 1，修改版 exit 0。
- 覆盖 2K 普通/chroma+edge、有界 4096×3072 缩图、PNG/WebP 透明/半透明、lossless/lossy、PNG 压缩边界、JPEG 背景、无放大、EXIF 2–8、Display-P3→sRGB、corners/border/manual chroma、soft/spill/contract/feather、原 alpha 上限、透明消失/主体消失、损坏压缩数据（metadata 仍成功）、字节/像素超限、双帧 WebP、GIF 格式拒绝。
- 调用方：真实 `transformImage(imagegen/resize)`、`localEditSchema`、蒙版→后处理、错误传播与不可变输入通过。没有替身 DB/auth/storage；该测试不是 saveCanvasLocalEdit 持久化端到端或真实 HTTP 验收。
- 既有 `verify-imagegen-postprocess.ts`、contract、intent 全通过；全项目 `tsc --noEmit --incremental false` exit 0。
- 隔离 PG、HTTP、对象存储和完整 Next 构建未执行：此切片没有更改其代码。总账既有企业 401≠404、PUBLISH_STALE_DRAFT_BASE 等失败未重跑或抹除。

## 本地量化与交付状态

最终 30 个独立进程样本（每模式/场景 5 次，次序交替，Sharp concurrency=20，默认 cache/质量不变）均输出相同编码字节。下表为中位数；min/max 和原始逐次数据在 `BENCHMARK.json`。

| 合成样本 | 基线耗时 ms | 修改耗时 ms | 基线采样峰值 RSS MiB | 修改采样峰值 RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| 2048² PNG 透明 | 280.03 | 149.04 | 153.76 | 131.39 |
| 2048² chroma + contract/feather | 795.94 | 717.50 | 180.15 | 165.24 |
| 4096×3072 → 2048×1536 PNG | 407.58 | 369.44 | 294.55 | 245.34 |

这不是性能门禁或统计显著性证明。chroma/缩图耗时区间存在重叠，5ms RSS 采样可能遗漏同步/原生瞬时峰值；另记录 `process.resourceUsage().maxRSS`（含导入/热身）。不从一次微小差异推断收益，不推导生产吞吐、60 并发或 10 万活跃容量，不复用历史 GLM 数值。

完整命令/输入/字面 stdout、stderr、退出码及原 SHA256 存于 ignored `output/capacity-image-pipeline-20261029/`：

- `MODIFIED_FILE`：三份修改源码的内容与原/现哈希，保持修改状态。
- `DIFF_FILE`：本任务完整 Git patch。
- `VERIFICATION.txt`：baseline/modified/rollback、调用方、类型、量化、边界与保护检查。
- `ROLLBACK.sh`：已由 Git Bash chmod/test -x 并执行，只接受本证据目录下带 marker 的独立副本。

回滚实测：3 份文件恢复原 SHA256，41 个场景重现原像素/错误及 4/5 次解码、2 次编码，优化预算恢复 FAIL/exit 1。脚本自身 `ROLLBACK=PASS restored=3 source_untouched=true modified_artifact_untouched=true`、exit 0。后来编辑、错误 marker、工作树目标均 exit 73，文件字节保持；工作树源码和 MODIFIED_FILE 仍为修改版。没有测试 DB、容器、端口、服务或后台 Worker 资源；所有测试子进程均退出，保留证据与依赖 junction 供父线程重现。

## 未完成项与父线程接口

1. 建议入账：`processImagegenPixels` 中间 PNG 检查及 chroma 重复 decode 的可复现冗余；关联症状为应用图片处理的额外 CPU/分配，不直接等同生产 D9/D10 的已量化成因。新 A/D 编号由父线程决定。
2. 本切片不移除实际缩图所需的顺序 PNG 源、不优化 mask 三份输入、input-assets 额外 metadata、交付/历史边界再次读取；这些需按各自数据生命周期另证，不能复用本轮数字直接计入收益。
3. 若继续研究全 raw 缩图，必须在相同像素/质量/线程设置下消除实测 RSS 回退后再替换；不全站调整并发或降低输出质量。
4. 父线程审查固定提交后串行普通 merge；47 保持 HOLD。接口无迁移、无新增 DB 字段、无状态重放要求。
