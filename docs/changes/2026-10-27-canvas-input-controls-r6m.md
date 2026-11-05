# R6M：Canvas 输入命令与视图工具

基线`844e59df0ddb0c08854bbfefaaa4c6ab2fae407c`；独立工作树`E:/Workspace/naumi-refactor-20261024`；原4573文件hash及归档在`output/refactor-r6m-20261027/`。

## 实施

- `keyboard-command.ts`只决定输入归属、是否阻止默认行为及typed命令；不访问DOM、React、数据库、收费任务或document writer。
- `useCanvasKeyboard`只持一个capture监听器，每次事件读取最新状态及命令adapter，避免依赖数组遗漏导致同ID新数据仍读旧闭包。
- `useCanvasViewControls`拥有主工具、minimap/snap、Canvas主题与缩放输入/菜单/实时HUD及wheel生命周期；键盘与工具条共用同一工具选择和视图API。原移动/缩放实时Dock几何和ReactFlow本体保留在组合层。
- 缩放草稿在输入聚焦时不被实时视口更新覆盖；Escape、项目/账号上下文变化关闭瞬态菜单。只保留原本地主题键，不新增确认或业务上限。
- `view-toolbar.tsx`与`tool-buttons.tsx`负责真实控件；暗色硬编码hover/分隔线改为现有Canvas浅色兼容token。剪贴板与快捷键共享原input-target判定，不复制第二套输入规则。
- 原节点删除、历史、复制、创建、生成、报价及账务仍通过原adapter/owner执行；UNKNOWN不重提与原operation不变。

## 集中验收

固定被测源码：`8c21b6a75b97e07292d3c6a184850231591216f0`。后续仅文档提交与该源码分层绑定，不冒用文档 SHA 作为被测应用。

| 边界 | 实际结果 |
| --- | --- |
| 完整原源码行为 | 21 检查、3925 组事件矩阵，原复制 `STALE`、缩放草稿 `OVERWRITTEN`、Escape 菜单 `OPEN`、监听重挂 `YES`，exit 0；这是复现旧行为，不代表旧缺陷正常 |
| 新版实际 decision + Canvas adapter + React/Edge | 3948 检查、同 3925 组事件矩阵；复制 `CURRENT`、草稿 `RETAINED`、Escape `CLOSED`、监听重挂 `NO`，exit 0 |
| UI 字节合同 | 2 组原工具条 HTML 一致；仅归一化本轮明确替换的 3 个浅色兼容 token |
| 结构 | Canvas 6524→6083 行；162 个非目标原函数声明保持，4 个 helper 正文原样迁移；3 个原函数改绑、2 个旧 handler 被新 owner 取代；其余原 src/services 1852 文件 hash 保持 |
| 依赖 | 语法静态/全部、类型擦除后静态/全部 SCC 均为 0；纯 keyboard decision 不访问 DOM/React/账务；只有一个 capture keydown owner |
| 相邻 | 原交互 34 组/92 检查、edge 真实命令/连线编译器、palette 15、项目投影 42/18 场景/7 HTML、runner 12/74 均通过 |
| 类型和规范 | 完整项目 `tsc --noEmit` exit 0；本模块 lint exit 0、0 error，Canvas 原有 8 warning 留账 |
| 固定源码 core | 33/33，failed=0、notRun=0，exit 0；新输入矩阵静态入口已接入原 required runner |
| 完整 Linux 包 | 原生产 Dockerfile、完整 Web/Worker/媒体包构建与包内 hash 检查通过；本轮镜像见下文 |
| 同固定镜像运行 | 实际登录/PG/报价/Worker/交付账务/Canvas CAS/工作台/FFmpeg/排空，125 检查通过；原价 6/current 17、UNKNOWN 不重放，Worker 排空 exit 0 |
| 真实产品双浏览器 | 21 组检查，包含共用的 11 组本轮控件交互；实际 Flow、原生 HTTP、真实 PG，无 route mock；视图交互前后作品/文字/任务/账本精确相同，供应调用 0；其后两图两笔 12 积分，确认弹窗 0、页面异常 0；持续 182.207643 秒、16 轮混合读取 |

镜像：`sha256:311d60ccb94b5fea48e7860db61ea5368be37000118fe86b74b7ad33a2682162`；源码摘要：`4f0784c121cfb1c306f89720f17e39365b6f07882f49fde2799987f13b4e6180`。这是本轮新建且实际运行的完整候选，不是复用上轮镜像，不是生产验收或 10 万用户容量结论。

### 原始失败与未关闭事项

- baseline 准备先后缺少原 markup 端口、无 Tailwind 的 backdrop 不可见、fixture 错误每 render 重建 busy ref；只修验证准备，三次原失败日志保留。成功 baseline 使用原函数/原 JSX 和稳定输入端口。
- palette 旧脚本仍假设节点 renderer 内联，已读取真实 renderer owner，不削弱原断言；旧失败保留。
- Windows 冷 Next dev 页面失败后，在同一停止源码副本上补充 CDP 异常位置再观察，仍失败；两轮均 exit 1、无业务 POST。后者记录 `layout.js:117` Supabase `GoTrueClient` 的 eval 解析异常。取回文件的 194 段 eval 在 Node 严格解析及同版 Edge `new Function` 均通过，**首次页面解析失败的根因仍未关闭**，没有把重新运行当作修复。本轮产品验收采用上述新固定 Linux 生产包，两种环境结果分别记录。
- 初次 PG 就绪检查早于容器启动完成，未开始 UI 测试；原输出保留，后续实际就绪才执行。
- 计划清理上轮已完成的自有缓存时，删除命令在执行前被工具拒绝；未删路径、未换壳绕行。构建前实有约 39 GiB 余量且原构建器继续检查至少 10 GiB，完整构建实际通过；未把未执行清理记成完成。

## 交付与后续

原 4573 文件归档/摘要、真实命令及字面输出、最终四产物、补丁应用、独立副本精确恢复及恢复后旧行为，统一记录在 `output/refactor-r6m-20261027/VERIFICATION.txt` 与 `DELIVERY.json`；最终提交和远端匹配以封存证据为准。工作树保留新版；独立副本回滚不撤销本轮开发成果。

本轮是 main 同步后的第 1 个模块。下一个闭合职责是 Canvas 剪贴板的选择序列化、原媒体引用与复制/粘贴会话，继续复用现有 document/history owner，不新增复制副本或收费执行框架。Canvas 仍为 6083 行组合层，剩余输入/上传与外围会话、完整重构版本整合及开发态解析债务继续；整体 active，不合 main、不部署、不接管发布现场。
