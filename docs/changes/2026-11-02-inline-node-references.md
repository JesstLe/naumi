# 节点行内引用：身份、编辑与保存

## 基线与范围

- 基线 main：`2b990949421214802ae900e34f2baf6869f78443`。
- 独立分支：`codex/inline-node-references-20261102`。
- 三模块后刷新主线：`2e79509754542ce620e22be62e24721d6ae47487`，普通合并为 `e0e8a4cbafff12279da668a7523dd9b46e3e82d0`；保留同事已合入的视频五模式与多模态协议，未反合 103 独立验证线。
- 用户确认：提示词内显示缩略图与名称的行内引用；同时打通稳定身份、保存、复制和分享映射。节点 ID、历史生成结果及供应商图号协议保持。
- 延续当前决定：只合 main，不更新 103，不新增公开更新说明。

## 模块与职责

- 行内编辑器负责纯文本与引用 chip 的投影、选择、IME、剪贴板、撤销及无障碍；图片仍序列化 `【图N】`，视频仍序列化既有引用格式。
- 图片引用文档由 canvas 模块持久化：正文、稳定绑定、启用来源与隐藏来源一起保存；CAS 与 operationId 保证冲突可见和提交幂等。
- 客户端同步器保存独立的节点队列，冻结账号/工作空间/项目上下文，不把异步回复写入其他节点。
- 复制与企业分享复用已有新旧 ID 映射；分享快照包含活引用依赖及文档，不复制旧付费任务身份。

## 实现进度

- 已核实：当前图片绑定本已使用 `node:<artworkId>`，图号 tombstone 防错位；正文仍是 textarea 字符串，绑定仅在 tab 草稿。
- 已核实：空白待生成图片节点尚无原生服务端实体，保持其既有草稿生命周期，不把任意客户端 ID 当已保存作品。
- 已完成：共用图片/视频行内编辑器、原 wire 兼容、稳定身份剪贴板与失效引用；图片提示词持久化 API、650ms 合并保存、CAS/ACK 恢复及 tab-local 未保存队列。
- 原位节点 ID 和历史 `Artwork.prompt` 保持；编辑文档独立保存。复制、企业分享复用 idMap，单图副本保留无父连线和右下位置，活引用独立映射。
- 正式图片参考上传复用原64MiB/6400万像素及 browser previews，新窄入口验证父节点/项目/企业归属、确定性 operation、原图 SHA。未知 ACK 重试原文件，不创建另一份素材。
- 顶部分享、右键分享与批准选源都先排空已编辑提示词。已有项目从 desktop 返回后，以服务端已授权项目归属恢复文档，不把默认个人工作空间写成企业项目归属。
- 行内私有缩略图复用 `CachedImage` portal，授权、失效与换号撤像素沿原缓存；同标签 DOM/lease 在周围文字输入时复用。首次裸 img 破图反例已实测并修复。

## 验证与未完成项

### 已执行集中验证

- `node scripts/verify-inline-node-reference-ui.cjs MODIFIED`：22组真实React/Chromium；`PRIVATE`：8组cookie私有媒体+真实browser-image-cache；基线及副本回滚均恢复2 textarea/0 chip。
- `node scripts/verify-inline-image-prompt-client.mjs . FINAL`：12组，独立节点队列、CAS、ACK未知原operation、刷新恢复、换号栅栏、服务端项目scope、明确无数据库模式保留本地编辑。
- `node scripts/verify-inline-image-prompt-persistence.cjs`：24组，真实PG/实际cookie和route、复制/企业分享/源删除、67次autosave仅留64个紧凑回执。
- `node scripts/verify-inline-reference-upload-client.cjs`：14组；`node scripts/verify-inline-reference-upload-server.cjs`：17组实际route/PG/Sharp/private storage，原字节、21MiB、并发与越权拒绝。
- `node scripts/verify-inline-node-references-e2e.mjs FINAL`：6组完整CanvasClient/ReactFlow、真实登录/PG/上传/分享，清空session后恢复、接收者独立编辑重载、所有chip图片实际解码。此测试适配Next导航/图片框架入口，不等同于生产Next SSR或线上验收。
- `node scripts/verify-enterprise-collaboration-e2e.mjs MODIFIED`：原16组完整浏览器回归通过，含跨desktop/canvas、聊天附件、shares-only SSE和A→B→A。
- 原图片引用纯函数与实际React→原submit adapter回归通过；节点草稿55项通过；最新主线视频模式UI11项/模式选择42项/多模态协议379检查通过，供应商真实请求0。
- 全项目 `tsc --noEmit --incremental false --pretty false` 集中检查通过；最终准确命令与stdout/stderr/exit见证据目录。

### 准确保留的失败与边界

- 旧 `verify-canvas-reference-retention.cjs` 是原文抽取的局部脚手架。基线因未注入 `canvasGenerationDestination` exit1；本版因未注入 `flushImagePrompts` exit1。未删断言或改变产品凑绿，也未把此脚本计入通过。原函数输入合同另由真实React/submit adapter与完整Canvas端测覆盖，原始日志保留。
- 迭代失败保留：全Canvas脚本首次因副本覆盖坐标点击超时，第二次未等分享POST完成就读列表；分别改为真实位置写入及等实际结果。私有缩略图首次裸img破图为产品缺陷，已用既有授权cache修复；跨desktop默认scope误套企业项目已修复。
- 未保存的空白待生成节点继续原浏览器草稿生命周期；没有给 `pend-*` 伪造正式记录。跨设备/分享持久化针对已保存的原生图片节点，视频沿原节点保存合同。
- 新参考上传走App multipart，旧云直传入口保持不变；没有验证生产代理大包限制或线上容量。
- 未运行服务器更新，未更改公开说明，未发起真实供应商生成。Next生产构建留待用户重新授权的发布轮次。

## 四产物与资源

父统一封包路径：`E:/Workspace/naumi-task-evidence/inline-node-references-20261102/delivery/`，含 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，以及原始SHA清单/完整验证记录。回滚只针对独立副本，活动源码保持修改。所有测试自有PG/浏览器/回环服务逐轮清理。
