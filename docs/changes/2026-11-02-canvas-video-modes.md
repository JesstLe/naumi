# 画布视频五模式与已配置模型能力承接

## 任务状态与基线

- 基线：`2b990949421214802ae900e34f2baf6869f78443`。
- 任务分支/worktree：`codex/canvas-video-modes-20261102` / `E:/Workspace/naumi-canvas-video-modes-20261102`。
- 本轮交付目标为代码、集中测试、普通合入 main；**不发布47，不修改线上模型配置**。main 合并、运行版本、管理员发布配置分别记录，不互相代替。
- 当前记录为实现与分层验证交接；最终集中测试计数、任务提交 SHA、main 合并 SHA、推送状态由主任务收口填写。没有引入103独立模型映射实验线增量。

## 问题与根因

1. 模式菜单只呈现当前模型的能力，用户看不到其他已配置模型可用的图生、首尾帧与参考入口。向文生节点添加素材后仍停在 text，形成“只能文生视频”的体验。
2. 已发布能力不会随源码里的新目录自动改变。早期 smoke/v2 配置与新文档支持范围存在差异，需要明确预览和发布，而非读目录时静默改配置。
3. 全能参考需要真实 image/video/audio 参数映射，不能只在 UI 放开 reference。不同精确通道的字段、角色、格式、时长和素材组合不同。
4. 只有音轨的旧 MP4 对象可能按 `video/mp4` 存储、实际解码为 `audio/mp4`。此前引用链路把存储 MIME 当素材类型，拒绝了可复用的音频；简单改一个比较仍会破坏后续签名身份检查。

## 模块、公共接口与状态归属

| 模块 | 职责与接口 | 依赖/状态归属 |
| --- | --- | --- |
| `video/mode-selection`、`VideoModeSelect`、`compact-composer` | 五种用户意图、显式模型选择、`attachVideoInputs` / `selectVideoIntent` | 读取已发布能力；只更新当前草稿，不创建生成/采购任务 |
| `video-family-multimodal` 与三个 v3 codec | `MULTIMODAL_VIDEO_FAMILIES`、精确能力声明、输入校验与 wire 编译 | 静态定义 → codec → 原 HTTP adapter；不访问 DB、凭据或账务 |
| `reference-materialization` | `authorizeVideoReferences` / `materializeVideoReferences`；真实探测与原对象身份分离 | 复用 assets/media-inspection、原所有权、原对象与签名；不重写已存媒体 |
| `video-capability-review`、管理端升级入口 | 预览、变更摘要、人工配置冲突、明确发布 | 纯升级计划 → 既有 draft/runtime 发布；版本 CAS、配置快照仍归模型配置模块 |
| 既有视频节点/任务/Worker | 提交、冻结、排队、结果与账务 | 原幂等、租约、冻结合同、归属、结算继续生效；此次不新建并行任务系统 |

## 本次实现与迁移状态

### 1. 五模式 UI

- 五个主入口始终可发现：文生视频、图生视频、首尾帧、图片参考、全能参考。图片参考/全能参考是两个界面意图，共用既有后端 `reference`，没有新增不兼容 mode。
- 当前模型支持时直接选择；只有其他已发布模型支持时显示候选模型，由用户明确点击。打开/取消不改模型、模式、提示词或素材，不自动切模型。
- Picker、上传、@引用、外部新连线共用素材承接：同模型支持时，第一张图片承接图生，额外通用图片/音视频承接 reference。两张普通图不暗中变成首尾帧，重开旧草稿不自动改写。
- 保留全部提示词与素材，非法组合明确反馈而不截断。原生 `audio-node:` / `timeline-node:` 保留 `source_audio` / `source_video` 身份。
- 浅色现有组件与中英映射保持；菜单不发生成请求，不变更报价、余额或任务状态。

详见 [视频节点模式入口与素材承接](2026-11-02-video-mode-ui.md)。

补充复审修复：同 reference 模式重选/加素材保留已有明确角色；新增 `supportsReferenceFirstFrame` 三态字段，仅 Kling v3 Omni 显式开放图生转全能时保留首帧与特征视频。普通参考图不擅自改成首帧；false/null/缺省均不推断支持。

### 2. 11个精确模型的独立 v3 协议

- APIB：Seedance 2.0、2.0-fast、2.0-mini、2.5；Kling v3 Omni；Wan3 standard/prime；MiniMax H3/H3-Max。
- Geek：Wan3、H3。
- 新 profile：`apib-video-v3`、`geek-wan3-v3`、`geek-h3-v3`。旧 v2 codec 和旧能力 JSON 保持，已有冻结任务继续使用原版本。
- 2026-11-02 读取11份公开供应商文档，来源和 SHA256 保存于 `wire-docs/SOURCES.json` 及新定义；不把公开支持声明当真实付费验证。
- 以精确通道能力验证角色、数量、时长、尺寸、可取得的字节与声明 MIME 格式集合，不根据模型名猜能力。无效输入在发送前报错，不裁切、不丢素材、不把普通参考图重解释为首帧。
- Seedance 2.0 使用严格小数区间 `1.8 < totalVideoSeconds < 15.2`；2.5 单独处理音/视频各30秒和纯音频参考；Kling 明确 feature 参考而不是默认 base 编辑；Wan3核对输入视频＋输出总时长；Geek H3 使用公开 `/v1/videos`、HTTPS和合计12素材约束。
- H3/Kling 保留提示词原文，追加本次真实输入编号与供应商 token 对应关系；不全局替换普通文案里的“图片1”。原声音配置、价格和冻结选项不借本次迁移改动。
- MIME 已按相应通道文档验证；视频 codec/FPS 元数据尚未全面贯穿并校验，不宣称所有编码组合兼容。

详见 [独立 v3 执行协议](2026-11-02-video-multimodal-wire.md)。

### 3. 媒体复用与材料化

- 实际解码 MIME 决定输入 kind；原存储 key/SHA/bytes/MIME/owner/public 快照决定对象身份和签名。两者分别校验，不改旧对象 MIME。
- 对真实 SHA/bytes、正且有限的音视频 duration 以及签名前对象变化严格校验；顶层与嵌套 references 使用同一流程。
- proxy签名仍保持900秒与原 Token/ownerHash 语义；已存素材不重传、不复制任务、不重新扣费。

详见 [引用材料化记录](2026-11-02-video-reference-materialization.md)。

### 4. 管理端能力更新：显式预览与原操作恢复

- GET `/api/admin/model-management?view=video-capability-upgrade` 仅预览；显示 ready/current/conflict 与模式前后变化。仅已配置精确目标进入候选，冲突模型显示“保留人工配置”。
- 仅允许原不可变 smoke 或旧不可变 v2 值升级；现有人工 `false`、`0`、空数组等不是缺省。已禁用模型、价格、凭据、工具范围与无关字段保持。
- `reviewDigest` 绑定 version、按序 publicIds 和精确 patches。POST `video-capability-upgrade` 在服务端重新核对摘要/范围，再用原 draft revision 与 published version CAS 发布；旧预览、错摘要、范围变动按冲突处理。
- 发布沿用同 operation id、请求指纹和专用操作草稿，不覆盖管理员正在编辑的完整草稿。刷新目录仅在 applied 后触发。
- 连接中断或未确认发布保留 UNKNOWN 和 pending operation；页面“核对并继续”使用原 operation，不换新编号重复发布。明确未落阶段或确定失败才清 pending。
- 升级计划记录实际 before 值；回退只逆转本次字段，升级后被再次修改的字段拒绝覆盖，保留其他后来编辑。回退配置是新发布版本，不改历史冻结快照。
- 本轮实现该入口，**未对线上执行升级**。管理入口最终复测状态见下表，由主任务收口；实现存在不等于生产配置已更新。

## 集中验证与证据层级

证据根：`E:/Workspace/naumi/output/canvas-video-modes-20261102/`。原 checkout 的旧 React18 junction 保持；主任务以显式源码副本和 React19.3.0/Next15.5.27（与当前锁文件一致） 依赖验证，依赖错误日志保留。以下为最终集中结果；首次装配/中断日志保留，最终日志使用 `final-*` 或 `admin-ui-run.txt`。

| 层级/命令 | 已观察阶段结果 | 不包含的验收 |
| --- | --- | --- |
| `node --import tsx scripts/verify-video-mode-selection.ts` | `PASS CHECKS=42 AUTO_MODEL_SWITCH=0 INPUT_LOSS=0` | App/上游执行 |
| `node scripts/verify-video-mode-ui.cjs --baseline` / 同命令无 baseline | 原问题 `REPRODUCED CHECKS=3`；修复 `PASS CHECKS=11 DESKTOP=1366 MOBILE=390` | 用户浏览器/线上目录；此为实际 React 组件本地 fixture |
| `node --conditions react-server --import tsx scripts/verify-video-multimodal-v3.ts` | `PASS MODELS=11 CHECKS=379 LOCAL_POSTS=11 POLLS=22 RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=4` | 已含通道 MIME 与首帧角色回归；返回 body 是传输 fixture，非解码出片验收 |
| `node scripts/verify-video-multimodal-materialization.cjs`，baseline/modified分别指定输出目录 | `REPRODUCED CHECKS=2` / `PASS CHECKS=16 REAL_MEDIA_DECODE=1 REUPLOADS=0 NETWORK=0` | DB/对象存储为 fixture；本机 FFmpeg/FFprobe 为真实解码 |
| `node --conditions react-server --import tsx scripts/verify-video-family-capability-upgrade.ts` | `PASS assertions=66`；原字段回退、同事字段保持、后改冲突 | DB/网络发布 |
| `node --conditions react-server --import tsx scripts/verify-video-node-capability-publication.ts` | `publication-locked.txt`: `PASS models=32 old_rows=33 old_version_immutable=true new_profiles=3 catalog_expanded=true version_CAS=true rollback_new_version=true` | 生产发布或真实供应商 |
| `node --conditions react-server --import tsx scripts/verify-video-capability-upgrade-route.ts` | `final-verify-video-capability-upgrade-route.txt`: `PASS CHECKS=15 MODELS=32 ROUTER_ACTIVATIONS=1 CAS=PASS REPLAY=PASS V2_ROLLBACK=PASS` | 隔离真实PG/实际handler与发布runtime；Router为fixture |
| `node --conditions react-server --import tsx scripts/verify-video-modes-application.ts E:/Workspace/naumi/output/canvas-video-modes-20261102/application-final` | `final-application.txt` / `application-final/RESULT.json`: 五模式真实本地 App/PG/Worker/存储/账务通过 | 供应商模拟；不是生产或真实上游质量验收 |

应用层五例分别为 text、single-image、first-last、image-reference、all-reference。每例覆盖创建节点→提交→重复提交同task→冻结真实引用信息→Worker处理→作品存储→结果落节点与媒体SHA；每task结算操作settled、预占清零、恰好一笔消费账本；异主节点/媒体读取404，再次tick不追加创建或账务变化。模拟供应商创建5次、素材读取8次、真实供应商调用0。

```text
VIDEO_MODES_APPLICATION=PASS CASES=5 REAL_APP_DB_WORKER_STORAGE_BILLING=PASS REPLAY=IDEMPOTENT REFERENCES=AUTHORIZED RESULT=NODE MEDIA_HASH=PASS CROSS_ACCOUNT=404 SIMULATED_CREATES=5 REAL_SUPPLIER_CALLS=0
```

全量 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit0、无诊断；本任务产品文件定向 Next lint exit0、无warnings/errors。之前误用依赖donor的类型日志及测试装配失败记录保留；最终以 locked-test 源码与锁文件版本为准。

补充回归：旧能力 `VIDEO_NODE_CAPABILITY_OPTIONS=PASS models=32 modes=92 wire_cases=912 cases=1254 passed=1254 failed=0 assertions=8251`；原33型号profile802断言、新安装preset886断言全部exit0。旧独立research JSON从保留的原视频工作树只读复制（apib `82cce899f84de9ec3005394d57fa32bb0db31cb27b8dfdb80926fee9262fa916`，geek `156bd3814c913314053f84983c6a2852271b83fff7e80089c365bc2986ae3fcc`），没有用被测输出重建期望。

后台真实React组件：`node scripts/verify-video-capability-upgrade-ui.cjs` exit0，`VIDEO_CAPABILITY_UPGRADE_UI=PASS CHECKS=7 SCENARIOS=2 UNKNOWN_MODAL=RECOVERABLE DISCONNECT_RELOAD=SAME_OPERATION CATALOG_REFRESH=ONCE REAL_API_CALLS=0 SUPPLIER_CALLS=0`。覆盖预览、人工冲突保留、unknown/断网关闭modal、页面重载后原operation恢复与目录单次刷新。

## 收口栏

- 本轮完整实现与集中验证已完成；最终命令、输入、字面输出及退出码保存在证据根 `VERIFICATION.txt`。
- Git 按普通 merge 合入 main 并普通 push；最终提交及远端包含证明由证据根 `GIT_RECEIPT.json` 与 `VERIFICATION.txt` 记录，不将合并当上线。
- 整任务交付包：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`。原字段/文件 SHA 与 copy-only hash-guard 回退记录集中保存在证据根；脚本不用于生产或共享checkout，不回灌数据库或媒体。
- 部署：本轮不发布47；未修改线上配置，无真实供应商费用调用。实际供应商出片、生产目录启用和 codec/FPS 全组合验收未计入本轮通过。
