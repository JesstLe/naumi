# R8E：实测驱动的 Canvas 渲染隔离

## 基线与本轮目标

基线 `533588c6073c82702ccba8cb5760d86b8ef603dc`，完整5247原hash/tar保存在 `output/refactor-r8e-20261031`。R8D五轮中页面/暖页/全交互分布存在超原建议10%的退化，整体未退出；本轮不改节点数量、图片质量、业务限额、报价、付费任务或接口语义。

## 实际诊断

复用原完整镜像与真实320节点PG/登录/HTTP，浏览器新增显式诊断模式，采样工具切换、视图切换和平移的CDP CPU以及实际DOM变更。该模式带profiling开销，只定位热路径，不给低噪声性能报告代验。

原16次hand/move切换约17.4秒、节点DOM变更5120；16次小地图/网格切换约10.4秒、节点DOM变更0，但仍有大量隐藏重渲染。CPU原始chunk实际取回，对应热点为 `utils.formatDate` 的逐次 `toLocaleDateString` ICU构建：工具阶段约3.9秒、视图阶段约2.15秒；CanvasImage/缓存URL归一化也随无关节点渲染执行。平移阶段节点DOM变更0。

## 职责与接口

- `ArtNode`作为ReactFlow交互适配，仅传内容真正消费的data/selected/id给memoized ArtworkContent；Flow全局draggable/connectable等标志仍由原wrapper/Handle/Resizer订阅，不为这些标志重新构建图片内容。Context权限/locale与内容自身状态不由memo拦住。
- 原共享`formatDate`复用两个Intl formatter，不缓存用户输入或已格式化内容；保留Invalid Date字面值。通过本地日期/时间组件对照，在默认时区变化时重新建立formatter，保留原默认时区语义。
- 原TextNode焦点会话、document/history、图片读取权限与缓存不改变归属。真实ReactFlow的Handle、NodeResizer和拖拽通过其原store与callback更新，不依赖父内容重算；完整产品/媒体链仍独立集中验收。

下一步：原/新完整输出和重渲染反例、实际控件/图片缓存/历史与时区边界集中验收，固定同依赖镜像性能对照；再按实测决定剩余Shell/订阅职责。整体ACTIVE，未合main未部署，47 HOLD。

## 本轮集中验证记录（持续更新）

- 原/新真实React DOM：原10项/新11项，1930日期输出逐字一致；新1000次格式化仅2次Intl构造。16次无关Flow标志变化：单节点内容原16次→新0次；真实ReactFlow双节点原32次→新0次。data、selected、新callback、权限Context撤销/恢复、主题和locked均更新；真实Handle连接、NodeResizer一次回调、拖拽均通过。
- 夹具准备失败保留：esbuild resolveDir缺失、Next公共环境默认值缺失造成process未定义、真实Handle DOM定位误用type属性。它们不记为产品缺陷或成功验收；原始FAILURE/PAGE_DIAGNOSTIC保留。基线只使用本轮完整5247文件树。
- 验收接入现有refactor case catalog，新增render-isolation、既有node-renderers、既有scene-reconciliation；不建第二套框架。完整fixed源码将集中运行受影响入口，subset继续标PARTIAL，不冒充全量core。
- 性能runner新增显式baseline manifest/source输入，要求完整生产镜像与相同package/lock字节；保留原4478模式。同条件R8D→R8E五轮对照消除前轮82锁差异，profiling诊断和无profiling性能采样分开。
- 完整镜像、真实产品浏览器、五轮指标和独立副本回滚尚待本轮执行，不以夹具通过代替。

模块公共接口不变：ArtNode仍接受原NodeProps；formatDate原输入/输出与默认本地时区语义不变。data/selection/context归原scene/domain与权限owner，内容层只消费稳定输入；没有自定义不完整比较器、用户数据缓存、业务限额或参数降级。
