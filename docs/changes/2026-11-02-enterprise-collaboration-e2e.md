# 企业协作：真实浏览器闭环与全量未读

## 固定基线与所有权

- 父固定提交：`e8ff9d67bffb4ac7ed3ade3c68db9257b7d724ee`。本任务使用工具分配的 `t3-8de52942` / `t3/collaboration-browser-e2e`，开工 clean，已 fetch origin main，但没有把远端主线合入这个固定父基线。
- 没有再委派、改父总文档、push、共享 main、PR、SSH 或发布。父 `conversationTx` 锁顺序、uploads 完成校验、events 订阅者快照修复及 canvas-sharing 领域均保留。
- 复用匹配的只读依赖 junction：Node 24.19.0、React/ReactDOM 19.3.0、Next 15.5.27。没有读取真实账号或 `.env`，没有安装/改写共享依赖。

## 模块与职责

### 通讯合同与未读

- `CollaborationBootstrap` 新增 **optional** `unreadTotal`、`membersNextCursor`、`conversationsNextCursor`；`CollaborationConversationPage` 新增 optional `unreadTotal`。原字段与分页排序不变；旧消费者忽略新增字段即可。
- 服务端聚合限定当前真实授权企业、actor 的 `left_seq IS NULL` membership；消息要求 `seq > greatest(joined_seq, read_seq)`、非本人、未撤回。利用已有 actor-membership / conversation-seq 索引，跳过 `last_seq` 已读的会话，不加载每个会话及附件，不扫描所有租户。
- 新增 `GET /api/collaboration/conversations/:id?enterpriseId`，复用真实入口鉴权、企业 scope 及原 `conversationTx`；返回 `{conversation, unreadTotal}`。成员已退出/无权访问的 ID 返回 `conversation:null`，不会泄露该会话的标题、正文或参与者。非法 ID 仍为 400，非法企业/身份仍由原授权返回错误。
- 精确新增 GET 入口放在允许修改的 conversations API，不改 `http.ts`、events 或共享模块。成员撤销后原先的 `conversationTx` 安全锁与 fresh READ COMMITTED membership 读取仍是唯一权威。
- client 在 SSE 带 `conversationId` 时只读取该 ID，合并陌生末页会话并同步全量未读；reset/无 ID 的目录失效仍按已加载页修复。无需无限 bootstrap 或每次事件枚举全部会话。页脚和入口角标均使用 `unreadTotal`；无新增字段的旧 bootstrap 使用旧分页适配。
- 新 bootstrap 游标避免初始化时机械重复读取首屏。聚合返回值采用请求序列 fence，账号/企业原 generation fence 不变。
- 实际服务 direct 的 `title` 是空串；界面现在从当前成员目录解析对方姓名，目录暂缺时使用参与者身份，覆盖列表/搜索/头部/转发，不改服务端 direct 唯一性规则。

### 原生画布窄接线

- 原版 `/canvas?project=...` 原先不消费结果项目参数，只有 desktop 的 `initialProject` 有效。现合并两入口，等待当前账号的原生数据实际读取后消费 key；针对新批准副本失效 warm account cache，再读取真实项目/节点，避免 A→B→A 的旧项目快照提前消费 pending key。
- 项目深链清掉旧节点选择；文字 node 深链写入 `selectedTextId` 而不是图片的 `selectedId`。
- 审批选择包括 `selectedPendId`。存在尚未持久化的选中节点时，“选择所选节点”禁用；不把无效 selection 悄悄降级为整个画布。用户主动清除选择后仍可明确批准整个持久项目。
- 实际文字生成联调复现：切换项目后请求并未取消，但返回被 project epoch 丢弃，原项目不保存结果。只修 `generateTextNode` 的客户端归属：已接受工作按账号/工作空间单调 epoch 完成原项目原生保存，不按当前可见项目丢弃；传入原 `persistTextNode` 的 `isCurrent`，A→B→A 的旧续体仍零写入。没有改供应商、计费、任务服务或引入额外执行器。

公共依赖仍为 UI → HTTP → 通讯/共享原用例 → 企业身份/原 business pool/原私有存储。测试控制器只有就绪检查使用短命 PG Client；产品没有新建 pool、扩池或改变事务归属。

## 固定构建测试产物与真实层级

入口：`scripts/verify-enterprise-collaboration-e2e.mjs`；浏览器、服务、route manifest、装配分别为同名前缀的 `.browser.mjs`、`.server.ts`、`.routes.ts`、`.entry.tsx`。

- esbuild 固定打包实际完整 CanvasClient、ReactFlow、AuthProvider、FeatureAccessProvider、BillingProvider、CollaborationProvider、DesktopShell/Home。`browser-build.json` 记录全部输入模块与输出 SHA256。不是原来的灰色 Canvas fixture，也不是仅重跑 mock29。
- Next 的 Link/navigation/dynamic/Image 仅在此测试构建适配到 History API/原生图片/Suspense；这证明实际 React19 组件与真实 HTTP 模块闭环，**不是完整 Next SSR/生产构建验收**。
- 实际 scrypt 口令登录 route 签发 HttpOnly HMAC `nv_user`，实际 session hydration、真实普通员工/企业 grant、消息/在线/SSE/共享/Canvas persistence/media routes；没有替换 auth、collaboration、canvas-sharing、原生 repository 或 private storage。
- 与当前切片无关的模型目录/视频目录/配置/报价端口有显式固定测试响应。仅两个用户显式发起的文字生成用可释放的本地 supplier 响应，身份检查、客户端状态与原生保存仍真实；没有外网模型调用。浏览器与服务 outbound fence 均记录外部访问为 0，真实 ledger 新增 0。
- 每次至多一个自有 `postgres:16-alpine`，256 MiB / 1 CPU，随机回环 TCP 端口、唯一 `naumi.fixture` label；真实 `SELECT 1` 后启动服务。临时媒体位于当轮 `media/`，端口不用固定线上配置。
- 两个独立 browser context；finally 关闭 contexts、browser、HTTP sockets、SSE、DB pools、子进程，并按完整容器 ID + label 删除本轮 PG/volume。回执记录 sockets=0、subscriptions=0、remaining=0。

## 集中验收

```powershell
node scripts/verify-enterprise-collaboration-e2e.mjs BASELINE <父版本独立副本>
node scripts/verify-enterprise-collaboration-e2e.mjs MODIFIED
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node scripts/verify-enterprise-collaboration-integration.mjs E2E_REGRESSION
node scripts/verify-enterprise-collaboration-server.cjs
python scripts/verify-enterprise-collaboration-e2e.artifacts.py
```

基线是父真实代码，不是人为删除功能：56 会话中末页既有消息的角标为 0；末页新消息经真实 SSE 后仍不出现在 UI。字面结果 `COLLABORATION_E2E_BASELINE=REPRODUCED unread_total_missing=1 last_page_event_lost=1 full_canvas=1 suppliers=0`。exit0 只表示缺陷重现。

修改版 16 个浏览器组覆盖：

1. React19/完整原生 CanvasClient/真实登录/实际 PG 节点。
2. 56 会话、末页既有和实时消息全量未读、直接打开。
3. read/本人/撤回/退出/重新加入历史下限。
4. 浏览器实际 request 断言：单次消息 event 无 bootstrap、无会话目录分页，只读指定 ID。
5. 普通员工私聊姓名、Markdown、原始 HTML/XSS 不渲染。
6. context 真断网、presence TTL 到期、重新连网恢复持久离线消息。
7. 实际群创建/消息、非群主普通员工改成员 403。
8. 真 ZIP、0-based 块、暂停/换项目/desktop 草稿、原 upload ID 续传、浏览器实际下载 SHA256。
9. PNG 截图粘贴、实际嗅探 MIME、私有下载 SHA256。
10. 真实 Canvas 选中节点和视口在聊天 Backspace/Delete/收起收信时保持。
11. 实际右键作品卡与整流程卡；无新消息的 shares-only SSE 刷新卡和申请。
12. 未保存 pending 节点不会静默授权整画布。
13. 作者只选自己的持久项目批准，接收者打开独立 CanvasClient、原生编辑、刷新恢复、原作者内容不变。
14. 真实签名 A→B→A 登录与延迟消息响应的旧 generation 隔离。
15. 本地明确 supplier port 的文字生成在离开项目后继续完成并保存原项目。
16. 同一实际生成链在 A→B→A 后拦住旧续体，不写入接收者或旧账号结果。

字面结果：`COLLABORATION_E2E=PASS checks=16 full_canvas=1 real_auth=1 real_pg=1 suppliers=0`，exit0；pageerror=0、external=0、ledger=0、copies=1。

### 父复核提交的最终整合

- 本切片先固定为 `f87ca3240aa43ba12663e56a7a4ba2ce60d2541f`；随后按父新指令普通 merge `21e7f1b6c45be390ee5229e69cea4f41d99cd867`，整合业务固定 `ef530dfb1ee67d620d0afa10bd1e00bee21e8741`。没有冲突，没有覆盖父树。
- 在此整合固定版本重跑完整浏览器 16 组，仍为上述 PASS，pageerror=0；完整 `tsc --noEmit --incremental false --pretty false` exit0，字面输出为空。随后只封包和更新此交接，不修改产品逻辑。
- 父的 canonical tenant/suite/parent evidence、数值 max_tokens、timeline 历史来源及隐藏历史作品修复保持原样；本轮没有重复父共享12/23后端矩阵。
- 本切片合并前额外集中回归：父真实双方 HTTP integration 10/10；通讯原20组通过（其共享 external-port fixture 层级保留，不当成新增真实共享证据）。对应完整日志随 VERIFICATION 打包索引。

脚手架修正记录保留在 `*-attempt-*`：初次点击项目标题文字不是封面按钮、Canvas Agent 和聊天同名发送按钮需 scoped locator、审批 Link 导航后等待项目网格、文字生成按钮实际名为“文字生成”、Locale 类型 `zh`。这些失败不是靠产品 mock 绕过；真实 project 参数/异步账号消费顺序/生成项目归属缺陷另按上文产品修复记录。账号切换瞬间旧请求 401、旧 SSE cursor 400 属于真实鉴权拒绝，未写成所有 HTTP 均 200。

## 四产物与回滚

`output/enterprise-collaboration-e2e/delivery/`：

- `MODIFIED_FILE.zip`：本任务明确路径修改版；源文件保持修改版。
- `DIFF_FILE.patch`：相对父固定提交的完整任务差异，并在新副本实际 apply 后全 SHA256 核对。
- `VERIFICATION.txt`：分支/修改字段/四条绝对路径、baseline→modified→copyrollback 的完整命令、输入、原样 stdout/stderr/exit、各文件 SHA256、集中回归与重开结果。
- `ROLLBACK.sh`：可执行 Bash，调用本任务恢复器。只接收 delivery/copies 内带标记的独立副本；所有目标修改 hash、所有原件 hash、归一化路径/符号链接检查完成后才写第一字节。源树、later-edit、原件被改全部拒绝，exit73/zero writes。

副本回滚仅恢复源码、重现原两个缺口；不恢复数据库或媒体、不重放付费请求。原3项父修复仍是固定父基线的一部分。

实际封包结果：`ARTIFACTS=PASS TARGETS=15 COPY_ROLLBACK=RESTORED LATER_EDIT_EXIT=73 ZERO_WRITES=YES SOURCE_MODIFIED=YES REOPEN=PASS`。8 个已有产品文件恢复父基线、7 个新增脚本/文档在副本删除；原件 archive 被改、最后一个目标 later-edit 和原工作树三类拒绝均 exit73，整个副本 SHA 清单保持不变。补丁在全新目录实际 apply 后与修改版逐文件 SHA 一致。

## 截图及未完成事项

当前真实截图位于 `output/enterprise-collaboration-e2e/MODIFIED/`：`author-approved-canvas-chat.png`、`desktop-chat-upload.png`、`recipient-independent-canvas-reloaded.png`。已实际打开检查；图片中的 PG 账号/素材是本轮隔离合成数据。实际下载还保存 `downloaded-design.zip` 和 `downloaded-screenshot.png`；两端 SHA256 数值写入 `browser-result.json` 并收录 VERIFICATION。

- 刷新后上传 File 字节及恢复列表/重新选同文件续传本轮未实现；本轮证明同应用生命周期草稿/上传暂停/跨路由续传，正文草稿刷新沿原实现保留，不把原 mock29 的结论扩大为本轮新增证明。没有无用户动作的自动文件上传。
- 完整 Next 生产构建、父固定候选整合、真实供应商、站点代理/持久媒体挂载和发布验收交由父任务；这里不冒充上线或 10 万用户容量通过。
- 测试导航适配不是 Next App Router 的 SSR/hydration 验收；父固定生产构建仍须覆盖实际两入口。
