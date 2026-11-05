# main 紧凑图片 Dock 与重构展示 owner 整合

## 输入与边界

- 本阶段基线：`4d1eb60a`（上阶段文字模块已封存）。
- 新 main 输入：`ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`；实际增量为 `dede3933..ca00b1f1` 的12条路径。
- 普通 merge 保留重构已有 owner；Canvas 四块冲突保留 owner 架构，再移植紧凑展示合同。没有恢复 main 中的单体几何、测量、图片／空白图片 JSX。
- 本轮只调整图片展示、屏幕坐标布局及回归接线。文字 document/autosave/history fence、付费输入／ID、UNKNOWN、原结果恢复菜单与提交 callbacks 保持。
- 原 `output/pr8-main-text-sync-20261103` 证据未覆盖。本轮证据独立位于 `output/pr8-main-compact-dock-sync-20261103`。

## 模块归属与实现

### Overlay geometry 与真实测量

`dock-layout.ts` 保留 main 图片专用纯几何：normal宽度上限620／高度上限360；expanded目标420／上限480，宽屏优先图片侧方。600至620的可变侧宽遵循画布可用空间；狭窄／短视口以有边界的面板降级，不移动节点。

`use-canvas-overlay-layout.ts` 是唯一展示协调 owner：

1. Canvas 只提供静态图片或pending图片的 `compactImage` 显式输入；文字／视频不opt-in。
2. render 与 live viewport 通过同一 `projectOverlay` 纯入口。live 同步 left、top、**width**、allowed maxHeight及expanded height，不等React rerender才修右缘。
3. `dockNaturalHeight` 由header/footer与body子元素自然高度、margin、padding求和，避免上次裁切／展开后的offsetHeight进入循环反馈。子元素、header与footer都订阅ResizeObserver。
4. 原active、document context、当前DOM ref与cleanup guards保留；失效observer不提交新metrics。
5. anchor最小平移不再为compact图片预留旧stackedSafeTop；仍不变zoom、不写节点／历史。
6. 先前pixel title的allowed-height反馈修复保持；非compact路径、text展开和实际标题边界保留。

### 图片展示 owner

`image-composer.tsx` 继续统一已有图片和空白图片。Shell／引用显式compact；优化与版本图标移入header，引用卡48px横排，无引用时上传入口不占开头空行，body独占普通纵向滚动。

`image-generation-controls.tsx` 保持model、ratio／resolution、quality／quote、count主操作；mode进入既有更多参数菜单，style／mark／focus作为受控secondary展示内容从image composer传入。全部数值、权限与回调仍来自原Canvas owner，没有新增task、计费或持久化状态。

原主工具栏仅压缩展示：rename／assistant图标保留accessible name；背景／视角／文案／图中文字／标注／替换进入原更多菜单。原锁、readOnly与已受理任务恢复入口保持。

## 集中模块验证

- `verify-canvas-compact-dock-layout.ts`：553 checks PASS，normal／expanded上限、自然高度收敛、四边与标题／工具栏碰撞。
- `verify-canvas-pixel-dock-wiring.cjs`：9 checks PASS，实际owner render/live；zoom0.5/1/2；pure-pan width620→600→620。
- 原dock collision：2625 cases PASS。
- 原geometry/performance：2640 cases PASS，2490 legacy逐值相同，150 narrow预期合同保持。
- 实际pixel-size React DOM：21 checks PASS。
- 实际overlay hook React DOM／ResizeObserver：13 checks、31 traces PASS，含context replacement、retired observer、标题及扩展／收起稳定。
- 实际Canvas bindings / React SSR：58 cases、94 checks CAPTURE PASS，model与quantity报价输入保留。本次展示意图发生改变，不将新HTML称作旧HTML逐字相等。

原SSR harness缺少早前已引入的promptSync／media expansion等实际ports，首轮ReferenceError保留；只补明确ports，原58场景／price断言未删。定向owner及harness lint exit0。

## 完整 Next 浏览器证据

候选使用已记录完整源副本 `E:/Workspace/naumi-text-ui-fullnext-20261103`；全量更新5669文件／87099156字节，node_modules为junction，`.next`仅在副本。基线从本阶段5687成员fulltar独立解到 `E:/Workspace/naumi-compact-baseline-fullnext-20261103`，仅叠加同一oracle脚本。

首轮compact在初次Next编译期间报告Invalid token与layout chunk timeout；完整错误保留 `canvas-agent/ui1/compact`。未改产品绕过。之后采用仓库runner既有预热：完整读取所有page scripts、逐个vm.Script语法验证，再开启新浏览器。候选原pixel18、文字17首轮全部通过，PAGEERRORS=0。

基线六场景真实读取旧820px宽、112px editor，REPRODUCED exit1；候选compact24带该基线报告验证实际面积至少缩小20%。另以原oracle新可选 `--viewport 240x900` 验证极窄高视口的页面边界／Generate实际命中及可达；默认六场景不变，未移除断言。最终同源集中结果：compact24、240极窄4、原pixel18、原text17、原zoom ownership14全部PASS，exit0，PAGEERRORS=0，supplier calls=0。

桌面无引用默认面积比0.6804878048780488（缩小31.95%）；2引用比0.7629711751662971（缩小23.70%），1440×900与1920×948均达到原20%门槛。普通态实际620×198（0引用）／620×222（2引用）；展开、收起、长文body滚动及原图／viewport不变均由原断言验证。

### 极窄视口发现的原生focus滚动

240×900首轮真实失败：dock／toolbar全局x=-2；footer205px高但submitHit=true。基线4d与候选同根：stage自身rect.x=0、width240，浏览器focus却将 `overflow-hidden` stage的原生scrollLeft推进10，导致纯几何left8在屏幕变为-2。`origin-probe`保留两组完整祖先矩形与scrollLeft，没有归咎纯几何或放宽bounds。

修复仅将Canvas自身stage改为 `overflow-clip`，使其不再成为原生focus滚动容器。未修改viewport、zoom、node坐标或付费逻辑。修后240两refs场景均由native Tab到达Generate，真实click actionability trial通过（不dispatch付费请求），stage.scrollLeft=0。实际鼠标wheel仍由ReactFlow平移；Ctrl/Meta zoom、内部prompt／Agent原生滚动、portal与project重绑由原zoom14回归证明。

桌面2引用compact截图与240键盘聚焦submit截图已实际打开检查。候选和基线Next父子进程经精确port／command／parent-child核验后停止，15283／15284监听均为0，见 `canvas-agent/NEXT_CLEANUP.json`。

## 未完成项

- 本模块产品及回归正式冻结；最终hash、字面commands/results、UI源码桥与清理回执均已封存到本阶段canvas-agent。
- 整树types、正式catalogue、四产物副本rollback及Git提交由root统一完成。模块PASS不等于main合并、生产发布或整次重构完成。
