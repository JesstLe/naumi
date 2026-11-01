# R9J：首页工作台会话恢复与观察 owner

## 模块与职责

基线为3fa0f2e8的5350文件完整原始字节快照。本轮落实R9I确认的组件内应用编排，不按文件行数机械拆分，不创建第二套Agent或任务引擎。

`src/lib/agent/workbench-session.ts`拥有账号scope/generation、历史安装、运行观察cursor/phase、观察失败与ready撤回，以及用户显式停止原session后的状态投影。`WorkbenchClient`提供当前权限/登录输入、认证transport、原session引用与React投影端口；不再拥有观察循环、恢复身份或失败阶段算法。

## 公共接口、依赖及状态归属

- factory不依赖React、Next、PG或供应商；只经明确context端口读取原有HTTP和投影视图。
- `activateAccount/deactivateAccount/ownsAccount`保留每次账号挂载的scope身份；generation由owner唯一持有，发送、附件、插话沿同一scope读取，不建立第二个账号缓存。
- `load/readinessLost/cancel`仅恢复或脱离观察；取消观察不取消服务器任务，不重放PUT/POST。
- `stop`只响应用户显式停止，沿原session调用既有DELETE；原观察存在时保留unavailable/settled分层，已有显式SSE的abort仍走原回调。
- UI事件、附件上传、会话列表与重命名/删除仍有具体适配。本轮未把全部发送SSE编排迁入owner，后续沿同一身份继续迁移，不把它宣告为首页全部职责已收口。

## 必须保持

保留installed/previousUnavailable区分、账号A→B→A和StrictMode隔离、ready变化不是账号切换、异步授权/响应/JSON后逐步身份核对、React延后setter的current guard、1200ms真实观察间隔及abort监听清理。错误的历史目标不成为无关已显示会话的发送阻断；已安装任务的未知状态不改成已完成或未受理。

## 验证资产与迁移状态

沿用实际React19、Chromium、真实定时器和loopback HTTP的既有`verify-workbench-recovery.cjs`及`verify-workbench-mutation-ownership.cjs`。只修改实际owner解析、诊断快照与既有runner输出端口，原业务断言保留；原版使用完整冻结基线的真实组件，新版加载实际模块，不以stub替代owner。

两个既有完整浏览器模块加入统一core目录，继续由同源退出码放行；当前新目录为218项，新增不代表已执行。原216/运行/浏览器结果仍归旧绑定源，当前3fa远端作业保持独立，不重启、不覆盖。

本轮原新集中执行：实际恢复39场景、变更/附件34场景，原版与新版各73项全部通过；新版实际加载应用owner。恢复PUT/POST0，显式fixture发送/保存与原账号/session合同保持，真实供应商0。全项目非增量tsc exit0，最终实际编译输入5093个加4配置绑定（保留lint前5094输入记录；Next lint生成引用移除了旧.next-theme-matrix/types/routes.d.ts，已按新实际输入重做非增量检查）；两个产品文件定向lint exit0。完整源码绑定、副本回滚及最终提交以最终交付记录为准。实际命令、失败和最终交付以`output/refactor-r9j-20261101`的VERIFICATION/DELIVERY为准。
