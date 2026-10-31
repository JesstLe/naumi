# R8R：Canvas 选择目录与菜单/属性投影分责

## 调研与职责

基线 `4e9c1bb45b5bfdb00674b8656fd8cb936a12e818`，独立工作树 `E:/Workspace/naumi-refactor-20261024`；完整5312个原raw hashes及源码副本保存在 `output/refactor-r8r-20261031`。上一轮R8Q已有真实源码/验证/推送进展，本轮继续实际产品重构。

页面的focus、右键context、属性目标以及selection controller的kind map都投影同一份节点目录。重复的是节点身份、项目和显示规格规则，不是所有JSX；菜单动作、DOM、具体编辑器仍留在原展示/业务owner。

## 实现与公共接口

新增纯 `canvas/selection-projection.ts`，目录kind规则归入既有布局无关的 `selection.ts` 并复用 `CANVAS_NATIVE_NODE_KINDS`。控制器不反向依赖属性/尺寸投影；不引入React/Next/网络/DB依赖、缓存、全局状态或第二份作品图：

- `selection.canvasSelectableNodeKinds(catalogue)`：供原selection controller在选择命令时读取kind map，原公开catalogue类型在controller路径保留类型转出。
- `canvasSelectionTargets(nodes,selection)`：投影当前focus；保留原独立selectedId、selectedTextId、selectedPendId，不强制合为互斥目标。
- `canvasContextTargets(nodes,id)`：投影右键所指节点，不假定它等于focus。
- `canvasSelectionProperties(targets)`：集中原属性身份、标题、kind、内容、显示尺寸、原图尺寸与图片可编辑性。

页面仅在原数组/项目/选中ID变化时memoize投影，实际节点对象引用保持；context仅在菜单打开时读取。selection状态、scope epoch、copy navigation/延迟Flow投影、节点锁/权限、文档与preferences/history保存仍归既有owner。

## 明确保留的差异

- focus video过滤deleted，context video原来不增加该过滤；其他native保留原项目匹配。
- focus text按原selectedTextId查找，context text匹配项目；不在纯重构中悄悄增加过滤或改变历史语义。
- 属性身份顺序text/art/video/director/character/scene/audio/timeline；显示尺寸顺序text/video/director/character/scene/timeline/audio/art。保留这些原有独立优先级，包括合成的同ID冲突输入。
- kind map保留art→六种native→text的原last-wins顺序；节点lookup保持原first-match。
- 原右键菜单分支、按钮、禁用条件、失败任务过滤、裁剪/替换/保存回调不改；没有任何供应商、任务、冻结报价、钱包或UNKNOWN规则改动。

## 验证与迁移状态

本模块完成后集中运行原/新实际页面表达式/回调、目录投影与真实React属性面板对照，以及原selection DOM生命周期和受影响回归；结果待实际执行后更新，不提前填通过数。

全项目退出仍OPEN，R8P历史整版135/1/57不跨source代验本片，未合main、未部署，47 HOLD；不重启上一轮因主机提交内存耗尽而中止的完整GUI测试。下一步仍需最终整版、有效CI、容量与main整合验收。

## 集中验证结果

固定应用/定向验收源码 `a944440e67dc19b0137eedfa3961dfb1bf5f7d31`。原页面表达式、完整context menu IIFE、真实NodePropertiesPanel/ContextMenu组件React SSR、原/新kind map共84组场景；原328检查、修改333检查，全部focus/context/属性、完整HTML和动作参数trace EXACT。数据覆盖各节点种类、跨项目/删除差异、独立focus IDs、合成同ID冲突优先级、只读/未就绪/忙状态、批量、失败task、英中文及空workspace；输入冻结，节点对象身份保持。动作/feature/useMemo求值为明确端口，不冒认真实权限/PG或完整Next。

18个受影响入口同source全部新执行通过，0FAIL/0NOT_RUN/0reuse；原runner输出subset PARTIAL/exit2，catalog197不是全197已执行。实际selection React DOM30检查、原native editors/preferences/overlay/render isolation与项目导航、场景/排列、主图片57组、local edit23组、native actions12组和原native documents68组均保留；没有真实供应商或付费POST。

完整类型exit0，5088实际compiler/config/dependency输入raw哈希前后一致；lintexit0，原warning保留。既有架构分析器的语法/编译后静态/含动态四类SCC均0，两个release fixture lib→app边与一个dist生成未解析边单列，不用SCC当运行时全部解耦证明。167个其他原Canvas命名函数正文、完整菜单视图/动作正文、selection controller除kind投影外的完整生命周期正文，在归一化换行后逐项EXACT。controller不导入属性尺寸projection。

仅改3个既有产品文件，新增1个纯投影文件；其他2133个原src/services raw SHA保持。main刷新仍e2f56255，模块计数1→2/3；未合回main、未部署，47 HOLD。原始5312raw SHA副本回滚、完整源码/字节patch和later-edit零写入，以本片VERIFICATION/MANIFEST/ROLLBACK_RESULT为准。

验证夹具的四次准备失败原样保留：缺上传动作端口、缺text readiness等视图端口、缺clipboard方法、把esbuild虚拟stdin当物理文件。已补齐实际菜单调用清单的明确端口，仅排除虚拟入口的文件哈希，所有真实源文件继续核对；没有改产品或放宽原菜单/属性断言来通过。

本片不宣称Canvas所有组合已退出：另发现助手文字结果刷新仍在页面读取快照、筛ID/项目并补默认字段（见CANVAS_SHELL_REVIEW_NEXT.json），后续按既有text-document归属审查；其他薄HTTP/DOM组装不机械搬走。完整候选、持续容量、有效CI与最终main验收仍OPEN；本片未建新镜像，未运行原runtime177或产品browser92。
