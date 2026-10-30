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
