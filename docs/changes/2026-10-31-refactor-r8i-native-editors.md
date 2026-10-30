# R8I：Canvas 原生编辑会话与面板组合

## 模块与职责

基线 `f64dc88c65f1d958714d242cce2b0854029d196f`，独立分支 `codex/core-refactor-20261024`。开工普通 fetch 后 origin/main 为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，待整合主线提交 0。本模块是上次同步后的第 1/3 模块，整体目标仍 ACTIVE，未合 main、未部署，47 HOLD。

五个全屏编辑器此前分别在 Canvas 大页面维护 React ID、catalogue 清理 Effect、定位状态和 portal 回调。角色/场景/导演台/音频/时间线新增一次编辑行为需要重复修改大页面多个片段。工作区切换时清理只检查相同 id/project 是否存在；同 ID 数据仍在时不能证明会话仍属原身份；老 onClose 无条件清空当前 id。

- `canvas/native-editor-session` 唯一拥有五个**已有独立槽位**的视图会话和新建节点导航意图。bind 使用实际 CanvasDocumentScope 对象，不只字符串 key。每次重新打开具有独立 handle，旧 close/action 不改新会话。
- `use-canvas-native-editors` 只承担 React 订阅、mount 生命周期及权威 catalogue 就绪后的退休。读取失败/未就绪不是删除证据。
- `CanvasNativeEditors` 唯一组装五类已有编辑器及其输入筛选、禁用投影和动作 adapter；Canvas 只提供现有 store/actions、输入及媒体端口，节点双击/菜单仍是薄事件入口。
- 保存/CAS、上传、引用准备、渲染/结果采用、UNKNOWN 和共享 history 仍由既有 concrete actions/document 负责。本模块不增加 DB、HTTP、表、队列、任务或计费引擎。

## 公共接口、依赖方向、状态/事务归属

纯会话 owner 仅依赖 scope/kind 类型、focus 端口，既不依赖 React/DOM，也不保存节点。React hook -> owner；组合组件 -> 原编辑器 -> 原动作端口；入口只组装已有依赖。视频继续原选中节点 dock，不被假装成第六个全屏编辑器。

`open(kind,id,project?)` 保留原选择节点、清空 text/pend/multi、关闭属性面板的语义；显式创建新节点时可把意图一次性交给紧接着的目标项目。中间导航、账号/工作空间切换及 ABA 不继承。每个 handle 提供 current/assertCurrent/close；关闭不冒充供应商取消、退款或未受理，已开始动作仍由原 owner 完成与恢复。五个槽位仍各自独立，不引入新的业务互斥或执行限额。

四个旧编辑器的 sessionStorage 草稿 key 保留；timeline 原 scope.key 保留。此片没有重写、删除或冒认旧草稿的 workspace 来源，草稿缓存身份迁移不混入纯会话重构。面板 React key 绑定实际会话，用于退休旧局部状态。

## 实现与迁移状态

已删除原页面五套 state、Effect、editing-node 查询及 inline portal，移除无其他 caller 的上传/生成/渲染包装函数；被重命名等真实调用方使用的 patch adapter 保留。全屏编辑器现在纳入原键盘 shortcut layer，原视频 dock 仍不阻断。原动态加载、组件/CSS/布局/文案、输入过滤、CAS revision、shared history 行为不改。

## 验证记录

原页面实际 open/Effect/close + 原 document scope 的受控反例已执行：13 项 REPRODUCED，两个同 ID 账号/工作空间旧会话仍保留、项目 ABA 旧会话仍在、迟到 close 会清空替代面板。此结果为本地行为复现，非历史线上事故归因。

实现完成后集中执行会话/实际 React 组合/受影响原 owner 与具体编辑器回归、TypeScript、lint、架构扫描。最终命令、字面输出、退出码和副本回滚以本轮 `output/refactor-r8i-20261031/VERIFICATION.txt` 为准；当前尚未封版，不将待运行断言写成通过。已运行新会话24项和实际React组合8项、原React组合7项、全项目TypeScript exit0；具体编辑器/PG及固定完整镜像仍待集中运行。

## 未完成项与下一步

剩余 Canvas Shell/其他面板组合、持续混合生成/入队容量、ZIP 原传输 socket hang up 根因、有效远端 CI、整版 main 合并及生产验收继续。已有冻结价/钱包事务/素材权限/UNKNOWN 原身份不变。候选分支超过 48h 的原因仍为整版退出未满足，不将本片完成当整版完成。


## 集中验收发现与接线纠正

首轮同源受影响回归2 PASS / 1 FAIL / 38 NOT_RUN，失败是既有 native-actions VM 仍调用已退休页面包装函数，未提供真实 nativeEditors focus owner。fixture 改为抽取实际 hook 的 focus 端口并执行真实会话 owner；已迁出的上传/reference/output直接测试原 concrete command，真实组合另由DOM与完整镜像覆盖。保留所有原写入/共享history/CAS/reference断言。节点创建的view流程显式先保存会话/选择意图，再导航，避免将导航后的旧scope当当前；与旧记录仅视图dispatch先后不同，数据/账务/写入语义不变。一次对照因视图顺序严格字节比较失败已留存，比较仍保留实际payload/history/reference全量一致，单次目标选择/导航分别校验，不把有意变更的view顺序冒称原字节相同。

受影响回归不成功时未继续拼接绿结果，首次PG及包装错误日志和自有清理保留。固定完整应用镜像e508的构建PASS只归该源；后续验收接线会另记source bridge，最终src/services必须和被验镜像逐哈希一致。


## 最终组合审阅

5d684199的41个受影响入口全部新执行PASS，subset仍PARTIAL/exit2（完整catalog183，非整版全绿）；同固定完整镜像产品92项通过，新编辑器18项/6次原POST、CAS/history及空白新项目导航意图通过。原图库选择/31图ZIP/7笔42积分fixture保持。最后源码自审发现多个独立面板同时打开时，应保留原portal叠放顺序character→timeline→audio→scene→director，而非开发时书写顺序。最终组件已恢复原顺序，DOM新增同时打开的真实顺序断言；此为真实组合语义，不增加单面板业务限制。最终source将重新固定，集中回归/镜像以本轮sealed证据为准，不拿5d结果拼接为最终源码绿。


### 实际portal行为纠正与最终验证范围

baseline DOM新增并发面板顺序检查实际exit1：原多个独立createPortal的DOM叠放按**打开先后**，而不是JSX书写顺序。不得以静态源码顺序替代实际React行为。组合组件最终保留每个面板独立keyed portal，close/reopen后正确在最上层；没有加入“只许一个面板”的业务限额。baseline夹具也按实际原JSX位置提取，但验收以真实DOM打开/关闭/重开顺序为准。原失败日志保留。

最终只修新呈现组合及其baseline verifier，原动作/文档/HTTP/账务代码未变。2a0053a5的41受影响入口（含五种具体真实应用/PG/WebGL/FFmpeg）与92完整产品已通过；最终source重新执行19个直接受影响入口和同固定完整镜像92产品检查。两层source与逐文件哈希分别登记，不把旧41冒充最终源码的新41，避免为纯portal修正第三次重复整套底层应用矩阵。


## 本片最终交付状态



固定应用源码 `c146956e66f3bef0442a60cc38ceeb893abb8a93`，完整生产Dockerfile同Web/Worker镜像 `sha256:85a6a68afb93c074c6a7e7aa90733b0e5492c2d658fdb207cd29716d343332e1`。角色、场景、导演台、音频、时间线五套编辑器ID/清理Effect/portal与回调从Canvas大页面迁到纯native-editor-session owner、React订阅hook与CanvasNativeEditors组合。只改1个既有产品文件+3个新职责文件，其他2123原src/services哈希保持；Canvas4337行并非验收目标。保存/CAS、上传、引用、渲染/采用、原operation/UNKNOWN、钱包及共享history仍归原具体owner，不建第二套任务或保存系统。

实际原页面13项规则/原React8项复现；新会话25项/实际React9项通过。账号/工作空间同ID旧面板退休，项目ABA与旧open/save/close不污染新会话；failed/not-ready目录不当删除证据。原五独立槽位、输入筛选、旧草稿key、具体动态组件/CSS/文案保留。原多个portal的真实DOM按打开先后叠放，不是JSX书写顺序；最终保留独立keyed portals，关闭重开也保持原行为。新建节点意图先登记再导航，只能交给紧接着的目标项目，不穿越账号/workspace或中间导航。

`2a0053a5`的41受影响入口/五具体应用、PG/WebGL/FFmpeg及92完整产品通过归原source。最终源码重新执行19个直接受影响入口全部PASS、0fail/0notRun/0reuse，subset PARTIAL/exit2（catalog183，不是全183执行），并重新构建完整固定镜像、实际双browser92项通过。前后仅新面板组合、其baseline verifier与模块文档变化；原动作/文档/HTTP/账务哈希相同，CONCRETE_OWNER_SOURCE_BRIDGE明确分开，不把旧41拼成当前19之外的新通过。类型exit0、lint38既有warning、四类SCC0；2条release fixture反向边与1条dist生成未解析边单列。

本轮18个完整产品新检查：五类真实菜单创建/面板、角色/场景/导演保存关闭与CAS/shared undo，音频/时间线不变关闭不增编辑，创建同ID undo/redo与刷新，空白新项目创建后正确打开。原POST6次，新增supplier/consume0；原图/文字/jobs/7笔42积分fixture保持。原31图ZIP逐字节完整。上游为隔离fixture，不是真实供应商/私有R2/10万容量证明；180秒混合读不是持续混合生成容量。POSIX drain exit0、自有PG/容器/网络清理PASS。

原5271rawSHA、完整源码/字节patch/副本原13+8行为回滚与later-edit零写入，以本轮DELIVERY/VERIFICATION为准。包装不存在case ID、旧native-actions fixture缺新focus端口、原比较包含有意调整的view顺序、portal顺序错误假设等原始失败日志全部保留。没有回退业务断言或把UNKNOWN变成未受理。R8H原ZIP socket hang up根因仍OPEN，不因复验成功关闭。整体ACTIVE，未合main未部署，47 HOLD；同步后第1/3模块。**🔴 分支超过48h原因仍为整体退出未完成：剩余Canvas Shell/组合、持续混合生成/入队容量、有效CI、最终main整合及生产验收。**
