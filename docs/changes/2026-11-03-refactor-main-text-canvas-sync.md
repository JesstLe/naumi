# main 文本能力与 Canvas 重构 owner 整合

## 输入与边界

- 重构基线：`936fe80e4057ae76752d656e3880e3b7f25b3428`。
- main 输入：`dede39337f174da487b0067550f7770366d52dbe`。
- `canvas-client.tsx` 的 22 个冲突块保留已有拆分 owner，再将 main 正文／写作能力接入 owner；没有恢复巨型组件中的存储、生成、历史实现。
- 三个 main 纯 helper `text-content`、`text-generation-input`、`text-generation-references` 保持 main 字节；后台 owner 直接共享这些规则。
- 本模块不执行部署、数据库迁移、供应商重买或真实用户内容回放。正式 Git／四产物封装由整合负责人统一完成。

## 职责与接口

- `text-editing.ts` 负责手写正文、清空、指令和焦点基线；写入仍委托原 `text-document`，撤销仍委托原 `history`。清空立即变为 completed，不再回退旧指令；改 legacy 指令先将可见旧正文物化。
- `use-text-node-autosave.ts` 只合并 650ms 输入并捕获原 document；不持有第二份节点、事务、模型请求或计费队列。A/B/A epoch 失效后不写新身份。
- `text-task-request.ts` 将原文、要求与项目分别交给原 task；用户标题不被“文字生成”覆盖。
- `text-task.ts` 为原任务新增 prepare 与 historyEdit ports。模型调用前落库正文／引用，成功结果保存后只记一次正文 history；已知结果重试只保存，不重报价、重生成。
- `history-controller.ts` 在新 attempt 提交前执行 busy admission；已有 UNKNOWN attempt 仍先恢复原 body，不被当前 local busy 永久遮挡。
- Canvas 的 text history transaction 在建立原 document 写屏障**之前** drain autosave。同步 barrier ref 在 drain 开始即阻止新编辑；不把 autosave flush 接到屏障内的 services.flush，避免自等待。
- scene 的 `textBusyIds` 区分模型生成与结果保存；两种 busy 均阻止编辑、删除和新撤销。
- `TextCanvasNode` 与 `CanvasTextComposer` 捕获 focus session 的原 owner callbacks；正文／AI 写作分栏不创建第二条生成路径。正文直接写入、显式生成、图片输入预览和移动布局使用原 UI shell。
- `image-creation.ts`、selection 和 assistant 输入投影消费 `canvasTextContent`；completed/failed 空正文不会把旧写作要求重新当图片输入。

## 已捕获并修复的整合缺陷

### Linked-source 普通保存失败仍触发模型请求

原 prepare 只检查 CAS conflict。`source.save -> null`、`unsaved=1`、`conflicts={}` 时，服务端会读取旧 source；独立实际 callback + 实际 task oracle 原先观测 paidPosts=1。

修复：drain 后，对请求引用的实际 text nodes 逐个通过**原 document.save**等待非空 ACK，再保存 target；任一 source null 均结束本次调用。scope 在每个 ACK 后重验。

正式回归加入 `verify-canvas-text-tasks.cjs`：无 CAS 冲突的 source null 阻止 POST；source ACK 前 POST=0；结果保存失败后重试保留一次模型调用与一次 history。独立复核修后 paidPosts=0、原 sourceIds/projectKey 保持。

## 集中测试与证据层级

证据根目录：`output/pr8-main-text-sync-20261103/canvas-agent/`。

- content 12、generation input 12、text-image inputs 72：纯实际 helper。
- retained tasks 30 cases / 202 checks：实际 owner、实际 Canvas prepare 与原 BillingProvider callback；HTTP／账务 ports 为 fixture。
- editing 14、history 67 cases / 184 checks、text document 21 / 58：实际 owner 与明确 I/O ports。
- selection 84 / 332、scene 30 / 103、text-image-runs 60 / 213、image-creation 46：原整模块断言保持；新增保存期 busy 与清空不消费指令。
- autosave 12：真实 React hook / Chromium，明确持久化 ports。
- editing DOM 4：真实 React TextCanvasNode 焦点、blur、项目切换、账号切换与新焦点后编辑。
- UX PG 13：实际 text CRUD/history SQL、独立随机 PostgreSQL schema；并发同 operation、所有权、回滚、清空、删除／恢复均保留。执行后只 drop 本脚本生成 schema，再关闭 pool。

第一批失败记录仍保留在 `batch1`：老 VM harness 缺新 autosave/task ports；老 DOM label 未跟随正文名称。适配只补新依赖 ports 和标签，原身份／事务／ABA 断言保持。`batch2` 保留修后原结果。旧“AI 指令 draft 回退正文”被显式替换为新合同的零图片 POST，并保留 legacy idle prompt-only 兼容。

## 已确认 terminal receipt 与 UNKNOWN 的边界

`billing/client-response.ts` 新增 `isTerminalBillingFailure` 纯函数，提取原 BillingProvider 的既有四条件：terminal 为 true、status 为 failed、operationId 与本次 `tool-${id}` 一致、chargedCredits 为非负安全整数。BillingProvider 与 text-task 共享同一个函数；text-task 仅使用原 retained submission.operationId（或已明确 request.operationId），不从错误文案猜身份。

没有把 TEXT_OUTPUT_IMAGE／REFUSED／LIMIT／EMPTY 裸码502变为已知拒绝。正式 owner/Billing fixture 覆盖四裸码、foreign identity、negative charge 均保持 UNKNOWN 原 body／operation／price；同 ID 且 charge=0/3 的已确认终态才允许**下一次显式点击**使用新正文、新 ID，不自动提交。whole BillingProvider 原24项回归通过。

## 完整 Next 浏览器验收状态

完整 5,668 文件、87,035,608 字节源码副本在 `E:/Workspace/naumi-text-ui-fullnext-20261103`；依赖为 node_modules junction，`.next` 留在副本内。没有设置原树 NEXT_DIST_DIR，也未修改原树 tsconfig。

原 17 项 UX oracle 第一轮到第 7 项通过后停在明确 TEXT_OUTPUT_LIMIT(502)与 retained UNKNOWN 合同分歧：fixture 以无 terminal／identity 的 502 作为可重开任务，旧 task 正确保留原 body；本次不将四个 TEXT_OUTPUT_* 裸码一概认定未受理。失败原证据留在 `ui-full-next-1/ERROR.json`，原期望未移除。后续以既有 identity-bound terminal 合同修订“失败后显式新编辑生成”的 HTTP fixture（原错误仍可见）；这不是断言真实 TEXT_OUTPUT_LIMIT 一定 terminal，裸502真实 UNKNOWN 合同由正式 task/Billing 回归单独保留。

第二轮原17项业务断言全部 PASS，exit0，PAGEERRORS=0、真实供应商调用0。包含生成失败后正文保留／编辑、结果后新焦点撤销、AI结果撤销、未ACK退出保护、锁／移动／新增、390px布局、关联文字ACK前零模型POST和正文保存失败阻止模型调用。`ui-full-next-2/MODIFIED.json` 保存完整HTTP轨迹。桌面正文和390px图片预览截图已实际打开检查；浅色布局与关键控件均在视口内。

Next fixture 的15283监听进程按已验证父子PID51984/52508停止，`NEXT_CLEANUP.json` listenersAfter=0。UX PG本次随机schema `text_node_ux_6aca0b3d07864e43b51dad7b8cab04b3` 的 to_regnamespace 查询返回null，`PG_SCHEMA_CLEANUP.json` exit0。没有停止共用PG容器。

## 当前未完成项

- 本模块产品与回归已 freeze；原始失败尝试未删，最终PASS与旧失败分开存放。
- 整树最终 types/lint、四产物 baseline/modified/rollback 与远端提交，由 root 统一记录；子模块通过不代表整次重构、合并或发布完成。
