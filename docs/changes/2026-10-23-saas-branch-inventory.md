# SaaS 后台发布前分支盘点

用户最新顺序：后台本地验收通过 → 整合各分支 → 发布47 → 真实账号、数据和全链路验收。当前核心页面浏览器与首批隔离回归通过，业务分支已整合至 `5a521e971eae81227a224a0d85237ffa289dcc01`；发现的新增调用图缺口、余额模块与整合回归仍在补齐，尚未发布。

## 实际整合记录

| 合并提交 | 来源及结果 |
| --- | --- |
| `3637d85a` | 自适应画框与Agent恢复/时间线等依赖。runtime冲突同时保留textOnlyContinuation工具禁用与企业权益校验，不牺牲任一门禁。 |
| `1b7090ef` | 视频控件与批量分支，新增canvas batch路由和prepared提交；后续集中补冻结scope。 |
| `3aeee35a` | 背景意图与图片参考分支。在盘点后同事已将此前WIP保存为 `d2d19165`，实际MERGE_HEAD取该新提交，未取走其未提交工作。 |
| `e1a2ca60` | 旧图片编号分支合入，保留新稳定编号/用途绑定和旧辅助组件历史；下述明确冲突决策。 |
| `b5e74d51` | 前端模型创建入口。 |
| `94e6b903` | 供应商运营面板基础，原不安全余额探测由后续专门安全修订覆盖，尚未验收为可上线。 |
| `00fb8416` | Imagen-4前端隐藏，历史配置/任务保留。 |
| `5a521e97` | 最新五轮运维保留约定；合并文档不执行服务器清理。 |

参考图冲突决策：旧 `@图片N` 随删除自动重编号，与新 `【图N】` 绑定稳定图片身份/删除墓碑的合同相反；保留较新的稳定引用和manifest，缺失引用明确阻止本次提交，不让旧重编号静默改指向。统一ImageReferenceComposer继续支持插入引用、预览、来源定位和用途。保留自适应分支明确要求的新草稿ratio=auto，已有用户保存的显式草稿仍读原值；同时保留新版不继承上一任务旧图号的提示词规则。schema同时保留reference标签和frameSourceId/framePolicy、各自验证，不能选择任一侧整块覆盖。

当前未闭环：已有video workflows原scheduler缺持久根scope、新batch prepared缺空间固定；submitCanvasImagegen的scope.project原未传给真正HTTP接受器；协作JWT身份只看成员存在未看新membership有效性。已分别交主实施与tenant_core在统一基线补齐，不能以首批helper/PG通过覆盖这些真实入口。余额由独立修订提交提供，待主实施整合及浏览器验收；最终类型/构建放在全部源码整合之后。

## 当前快照

2026-10-23 已执行 `git fetch origin`。`origin/main` 仍为 `7b1e970c84006c2fb76f8c1748e96da128e12982`。遍历全部321个本地/远端引用、288个不同tip；284个引用已为main祖先，1个引用的非merge补丁等价。其余按祖先与补丁ID筛查后逐项核对，不能仅按分支名称认定完成。

完整只读清单在忽略目录 `output/saas-preview-environment/branch-inventory.json`，生成器为同目录 `inventory-branches.cjs`。清单含每个ref、完整SHA、时间、独有非merge补丁及历史回滚标记。此清单不是合并成功或验收通过证明；正式候选构建及切流前需再次fetch比较。

## 未进入main的业务工作

| 范围 | 当前tip / 包含关系 | 当前处理 |
| --- | --- | --- |
| 本轮SaaS四个实施分支、PRD | 主实施 `6538ccf0`；企业 `5b7886dc`、平台 `934a0dc7`已选择性整合，租户 `c3984eca`仍有M04 WIP | 先完成本地验收，提交现有WIP，再归并历史；不得覆盖子任务未提交修改 |
| 背景意图/抠图路由 | `origin/codex/image-background-intent-20261022` `7ebfd88a`；本地 `codex/canvas-image-references-20261022` `aec92574`多一份企业可用性调研文档 | 候选需核对 `0dc69082`代码和已发布配置事实，不能因代码合并重放供应商验收或覆盖线上配置 |
| 视频节点控件与批量 | `origin/codex/video-node-controls-20261022` `24e6a8f3` | 新增video batch提交入口；整合后必须进入本轮创作证据覆盖及恢复审查 |
| 自适应参考画框 | `origin/codex/canvas-key-frame-long-image-20261021` `6ea9b13d` | 含11项独有非merge提交，同时涵盖下述抠图与Agent依赖，按真实图谱整合避免重复cherry-pick |
| 抠图参数标签 | `origin/codex/canvas-cutout-parameters-20261021` `f45b90aa` | 已被上述自适应画框分支包含 |
| Agent统一时间线 | `origin/codex/agent-stream-timeline-20261021` `7fb9e7cc` | 包含回复恢复、取消关键词门槛、响应中上传；已被自适应画框分支包含 |
| Agent回复恢复 | `origin/codex/agent-stream-recovery-20261021` `044ab052` | 同上，恢复路径须保留本轮冻结上下文，不能只检查UI |
| Agent取消关键词门槛 | `origin/codex/agent-remove-keyword-gate-20261021` `4c165966` | 同上 |
| 响应中添加图片 | `origin/codex/agent-chat-attachments-20261020` `6ffa8bbc` | 同上 |
| 图片序号引用 | `origin/codex/canvas-image-mentions-20261021` `24e0e793` | 与当前图片参考WIP重叠，不能覆盖同事未提交的canvas-client改动 |
| 前端模型新增入口 | `origin/codex/add-frontend-model-entry-20261021` `fcd9f7c8` | 属于新后台保留的模型管理能力，整合后验证真实入口 |
| 供应商余额/成功率 | `origin/codex/provider-health-20261021` `d06ec139` | 属于平台内部投影，整合后验证企业接口不泄露供应商资料 |
| Imagen-4下架 | `origin/codex/imagen4-unlist-20261021` `8977645f`，独有补丁 `c4bf83f4` | 保留已授权前端可见性规则，不删除历史快照 |
| 运维保留五轮 | `origin/codex/ops-retention-5rounds-20261021` `c523a0b2` | 仅AGENTS规则；合并后以最新保护范围执行，不能因该提交停容器或清数据 |

## 其他引用与未提交现场

- `codex/supplier-parameter-review-20261020` 的三项补丁为供应商参数与多轮讨论文档，作为资料审查，不把提案当成已实现供应商改造。
- `codex/admin-model-mvp` / `codex/local-sync-20261020` 有两项历史文档/验收素材补丁；`3bb3c6ff`含表格、大量调研输出和浏览器日志，需先检查内容及必要性，不因整合业务功能把全部内部资料发布到用户更新目录。
- `codex/apimart-sales-reference` 是独立API销售站（25项独有补丁），原任务明确独立品牌与站点，不能把独立站部署/域名/ICP操作当作Naumi47后台发布动作。后续记录代码归档或不合入理由，不隐去该分支。
- 所有 `rollback-compat` / `bi-model-before-*` 引用保留为历史回滚材料，不把降级UI和旧功能开关合进当前业务候选；本轮SaaS回滚仍须单独满足新membership/媒体边界。
- `r2-canvas-103-20261013/naumi` 的 `codex/canvas-image-references-20261022` 在盘点时含7个已修改源文件及新增参考选择组件、契约、验证脚本/文档，尚未提交。只记录，不重置、不自动stash、不替同事提交或取走半成品。候选冻结前重新核对提交状态。
- 共享 `E:/workspace/naumi` 保持原分支；本轮没有切分支、提交共享checkout或操作他人未提交文件。

## 整合与发布待办

1. 本轮SaaS源码冻结，M01–M07验收证据齐全，设计QA关闭P0/P1/P2。
2. 再次刷新各ref，按完整提交/依赖审查上述业务分支，解决重叠改动，生成实际合并SHA清单。
3. 将新增视频/Agent等入口加入创作证据覆盖；集中完成类型、构建和受影响业务回归。
4. 47只读刷新真实基线、未完成发布状态、所有实例、任务/会话及资源；合格候选固定commit/Image ID，准备可读备份和理解新权限的回滚版本。
5. 按三锁蓝绿完成旁路、整站切流、排空停止及真实验收，不能只切管理后台路径或保留多版本长期运行。
6. 发布状态和本地代码完成分别记录；本记录当前没有完成任何服务器发布。

## 2026-10-23 最新整合收口

SaaS源代码与九组集中回归冻结于`467ad6ce5aa61428bc1c0a22e16ec17d02c07f3b`。上文曾列出的工作流根scope、batch prepared空间、真正HTTP项目头和JWT membership有效性缺口均已补齐并有对应PG/真实进程恢复证据，不能再把旧盘点中的WIP当作当前状态。根任务浏览器补齐A11/A12后，本机设计和交互验收通过。

`dd1a2ed3`完整合并供应商视频分支`ea7e4ab9b220072b42eaee328eb752ff7b32755d`，包括六个协议profile、私有参考素材短期能力URL、同镜像combined Worker与隔离媒体运行时及独立视频配置发布工具。冲突仅在normal policy授权清单和lifecycle入口，保留SaaS及video-family两套入口；SaaS切流失败仍必须preserve-written，不能自动切回不理解新权限的旧程序。此合并自动包含供应商调研报告，不再重复cherry-pick文档。

应用由原GPT-6.1 Sol high负责人做合并后专项回归，根任务负责ops、最终Linux构建和47发布。供应商线程先完成其单独授权的视频发布；本任务未连接47、未拿部署锁、未创建候选。其资源复核指出47不能容纳最终Web3GiB＋Worker1GiB＋主机1GiB预算，正收口Web2GiB方案；SaaS后继发布适配尚需整合其最终资源门槛，不以NAS历史3GiB硬编码直接发布。上线前以其真实最终commit/Image/config/canonical和排空凭证刷新基线。
