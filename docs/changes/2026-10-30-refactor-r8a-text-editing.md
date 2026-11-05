# R8A：Canvas 文字手动编辑归属

## 基线与职责

独立E:/Workspace/naumi-refactor-20261024，原SHA3e341760f5f884e4673da26c3f03bbff8aad7e8f，完整5219文件原始hash/tar及只读副本在output/refactor-r8a-20261030。开工刷新main仍e2f56255，无新提交；本片完成后同步计数2/3。整体重构ACTIVE，未合main未部署，47 HOLD。

手动内容编辑/失焦提交/重命名/尺寸/适高与展开视图归text-editing owner，React hook只订阅/触发fit。文档、每节点串行队列、base/CAS、UNKNOWN原请求/冲突与重试继续text-document，历史仍history-controller。没有新的DB表、保存队列、计费或任务能力。

## 初始实现与实际反例

页面147行分散规则收拢为窄命令；普通函数轨迹8组（类型/失焦/空焦点/改名/尺寸/import/只读锁定缺失）旧新保存和编译操作一致。旧实际函数复现5组反例、新15断言通过：左上缩放撤销丢坐标、手动resize被fit覆盖、同长度换行不fit、旧闭包blur覆盖后到引用、未改动焦点覆盖remote内容。新增私有text-size历史action编译为既有position+text-patch两操作，HTTP schema与DB不改，保持一条共享undo与同事务原子性。

TextCanvasNode捕获focus时的id、draft与回调；导航后的blur只完成原文档编辑，账号/workspace失效则不写；新focus仍可正常编辑。fit签名使用真实content/prompt，不再仅长度；手动resize设置新的fit基线，import/锁定保留。展开只属于原view。完整tsc初始通过。

## 验证与下一步

实际React DOM/原节点/真实hook时序、真实PG原子resize历史、定向批次与同镜像完整产品仍待集中执行。当前报告不等于已上线修复，旧R7Y全160/runtime177和R7Z21/44不自动改标为本片通过。四产物、副本5219hash/旧行为回滚/later-edit零写入与远端状态以本片DELIVERY为准。

### 模块集中验证

实际textarea/React DOM：原组件4项预期复现、新节点+hook4项通过；focus时captured id/draft/callback保证跨项目blur仅提交原节点，跨账号blur0保存/0历史，新focus仍可编辑。首次fixture误传不完整settings造成fontSize异常的旧/新失败均保留，改为组件原默认settings，不改产品或断言。

真实隔离PG17检查通过：原editor/document/history→原handler→PG，左上尺寸与坐标一次undo/redo、其它tab新内容保留、位置冲突整笔回滚（尺寸无部分写）、lost ACK重复原operation/body读canonical均通过；消费/供应商0。原history67/184、text-document21/58、完整类型/lint37warnings、包含新增模块的四SCC0。所有schema/连接/fixture HTTP和本模块PG容器已清理。

上述模块命令运行时尚未commit，记录HEAD仅为父提交而非完整脏树版本；后续固定源码sourceIdentity将严格绑定，不能把当前模块log中的父SHA当已固定验收。

## 最终固定候选

固定应用/验证源码 `eb2c5a9b614f711645a42bb2ba23842468bb0a7b`。内容、失焦提交、改名、尺寸、适高和展开状态归 `text-editing`；原 `text-document` 保存队列与 `history` 冲突/事务仍是唯一归属。实际 textarea 捕获焦点时的 id/draft/callback，跨项目 blur 提交原文档，跨账号不写入。

8 条正常命令/保存/历史轨迹 EXACT；5 个旧编辑反例及两类 DOM 重绑定问题闭环。真实隔离 PG 编辑 17 检查覆盖位置+尺寸一次原子 undo/redo、远端内容保留、冲突整笔回滚和 lost ACK 原 operation/body 续查。26 个受影响入口均 PASS（subset 为 PARTIAL/exit 2，不是当前 164 项全量通过）。固定完整 Web/Worker 同镜像实际产品 browser 50 检查通过，其中新增文字编辑 6 项；无新增文字编辑任务/消费/供应商调用。类型检查、lint（37 个既有 warning）通过，四类 SCC 均为 0。

Canvas 页面 4713→4586 行；2105 个原 src/services 文件中 2102 个 hash 保持，另有 2 个新编辑 owner 文件。完整 5226 文件包、5219 原始文件 hash 的独立副本回滚、later-edit 零写入及远端状态以本片 DELIVERY/VERIFICATION 为准。

整体重构 ACTIVE；同步后模块计数 2/3。未合 main、未部署，47 HOLD。历史 R7Y 全 160/runtime 177 仍只归历史固定源码；当前本片不冒充完整 164 验收，冷 DDL/历史 dev 根因、性能容量、有效 CI 与最终整版验收仍待。

完整镜像实际 Next/ReactFlow、原 handler/PG/Worker、两登录 browser：50 检查 = 原 44 + 手动文字 6。真实 textarea 输入、共享 undo/redo、展开不落持久尺寸、同长度换行适高、刷新恢复与原图/任务/引用/7 笔 42 积分/供应商统计保持通过。Worker POSIX 排空 exit 0，finally 已删除自有容器、网络与 PG tmpfs。

最终只补四份文档，其余逐 hash 与固定验证源码一致。原 5219 文件完整 hash、旧函数 8 检查/5 反例和原 DOM 4 检查复现，以及字节 diff/later-edit 零写入，须由 package 实跑后记录在 ROLLBACK_RESULT/VERIFICATION/DELIVERY。

<span style="color:red">长分支超过 48 小时仍未合 main：这是用户指定的独立整版重构线，整体仍 ACTIVE。剩余 Canvas 职责、完整版本/容量/有效 CI 尚未完成，本片通过不表示整版已验收或已合主线。持续普通整合 main，最终完成整版门槛后普通合并。</span>
