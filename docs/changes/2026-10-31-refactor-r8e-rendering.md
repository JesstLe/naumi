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

集中runner首次在SSR入口遇到强制react-server条件与react-dom/server不兼容，实际首项11检查已通过；原日志保留为affected。case增加显式clientReact运行角色，仅SSR用例不继承RSC条件，未改变产品或测试断言。

## 固定候选最终记录

固定应用源码 `2c6a36f6cae75d72c2127df39265d0526df2a329`、完整生产Dockerfile同Web/Worker镜像 `sha256:e84674727d57239cd3699a73f2f4a34ab5299a0da36e243fd1df7a714e06df80`。按实际CPU诊断修正工具/视图变化对节点内容的无关传播：ArtNode保留Flow适配，ArtworkContent以默认shallow memo消费data/selected/id；Handle/Resizer各自store和权限Context仍订阅。formatDate只复用Intl格式器、不缓存用户数据，保留运行时默认时区及原字面输出。仅改2个原产品文件，其他2112个原src/services文件hash不变，未改报价/任务/钱包/UNKNOWN、功能、节点数或画质。

原/新实际DOM与真实ReactFlow：原10项→新11项，1930日期完全一致；16次无关flag，单图原16→新0、双节点实际Flow原32→新0；1000日期/时间调用只构造2个Intl。data/selected/替换callback、权限Context撤销/恢复、locked/主题更新与真实Handle连接、NodeResizer一次回调、拖拽均通过。15个受影响入口同SHA/digest全部新执行通过，subset PARTIAL/exit2，不当完整173通过；类型0、lint0/既有38warning、4类SCC0。

完整固定镜像真实双browser 54 检查通过：原登录/PG/HTTP、图片/文字冲突与共享undo/redo、原任务/报价与Worker交付、图片编辑/原图、导航/剪贴板/拼接均走实际产品；供应商仅隔离本地fixture，不是真实上游质量验收。180秒混合读取不等于持续混合生成容量；业务结果/消费以browser原始报告为准，新增定价确认弹窗0、route mock0。实际POSIX排空及自有栈清理通过。

同机R8D完整源/镜像3e90→本轮2c6a应用，package/lock字节、Node24.22.2/React19.3.0/Next15.5.28/glibc2.36实核相同；320节点（300图20文）、12张1024原图hash相同、1440×1000、CPU4倍、5Mbps/80ms，5轮交替10栈，每侧15页/150准备/300读取。无profiling对照：visualReadyMs p95 8771.72→8316.53（-5.19%）；warmVisualReadyMs p95 6932.40→5763.85（-16.86%）；labSessionInpMs p95 2792.00→1016.00（-63.61%）；interactionLatencyMs p95 1552.00→656.00（-57.73%）；prepareMs p95 22.34→20.92（-6.36%）；readMs p95 21.64→20.74（-4.19%）；rssPeakMiB p95 414.18→424.56（+2.51%）；eventLoopP95Ms p95 10.53→10.56（+0.31%）。超原10%调查阈值指标 {}，如存在继续记真实余项，不改阈值。profiling另作诊断：原tools约17.4s→新6.4s、view10.4s→4.7s；Flow节点DOM变化仍5120，不能称全部页面渲染已消除。实验室EventTiming、5冷/10暖和RSS采样均不是生产fieldINP或10万容量。

本片完成三模块同步：origin/main `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，新增待合0，普通merge结果`Already up to date.`，计数2→3→0。**候选分支超过48h仍未合main：完整退出尚缺Canvas剩余组合/持续混合容量/有效CI和最终整版验收；保留明确未完成项，不将局部通过冒充整版交付。**整体ACTIVE，未合main未部署，47 HOLD。

完整5249源码、5247原hash、字节patch、独立副本原10检查/16无关重渲染回滚、later-edit零写入、远端与CI以本轮DELIVERY/VERIFICATION为准。最后文档与测量schema前缀兼容修正进入证据源bridge，src/services与已验镜像逐hash一致；旧失败准备日志保留，不清洗为成功。首轮完整产品50项已通过，拼接选择检查在重叠节点布局未稳定时原始坐标命中其他节点，拼接POST0；验收只改为先等待首节点选中，再用实际node locator的稳定/命中检查携带Shift点击，不force、不改应用state或挪节点，原4项拼接断言保留。失败日志与独立清理继续留存。第二轮原50项再次通过，但首节点选择后的180ms dock/viewport动画使原点落入composer；最后增加实际viewport和dock位置连续稳定观察后再寻找原生可点击节点，不加产品等待/限制、不降低断言。
