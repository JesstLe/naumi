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
