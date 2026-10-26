# R6F：系统设置与用量/会员详情职责分离

基线`c0eac863d5f086565156832bbc709e8813d5f04d`，4487原字节哈希/完整归档。独立重构工作区，本轮是main同步后第3模块；收尾普通整合main，不把重构分支合入main、不部署。

## 实施与边界

- 系统设置3331行同时包含供应配置/支付/站点内容、用量排名/详情及已迁走的用户表/流水/作品面板。旧SETTINGS_MOVED早已把users/ledger/artworks转到现有admin center；用户表创建/分页/额度inline/口令等旧控制只用于这些不可达平行面板。本轮删除它们，不删除现有管理中心或API能力。
- 真正可达usage页的查询、加载、错误、排名/图表归`usage/usage-panel.tsx`；会员选中状态、请求有效性、备注/禁用原动作与作品/账务抽屉归`use-member-detail.ts`/`member-detail.tsx`。纯作品链接和现有DTO独立，不回指系统配置。
- 系统配置鉴权、原cookie/Bearer、密码和密钥提交、支付/品牌/内容/原账号积分兼容入口不改；配置页不再在auth通过时顺带加载完整用户/账本payload。访问usage才由其owner读取。
- 关闭/换用户/退出usage/unmount/token变化使旧读失效；abort只是减少工作，序号/owner检查保证晚回响应不能复活抽屉或覆盖新选择。后台已提交POST不取消/重发，跨owner旧响应不回写新页面。
- 旧用量请求顺序反转时旧range不再覆新range；失败保留当前已读数据并显示错误，显式刷新可重试。没有新业务限额、二次定价确认或通用状态平台。

## 验收与后续

完整React/真实HTTP回归将覆盖配置、兼容路由、usage周期、原详情/备注/封禁/作品跳转、关闭和乱序响应、页面离开、读取失败、两种原鉴权header，并明确Next导航/session/非目标子面板为fixture边界。原API权限/账务相邻、核心同SHA、全项目类型/结构集中执行；未执行不标PASS。

四产物、副本回滚、原4487hash、patch复放、Git/远端及本轮第三模块main普通同步以`output/refactor-r6f-20261027/DELIVERY.json`为准。整体active，剩余配置面板更细owner/测试资产与长时混合负载、依赖及最终整合继续。


## 实际阶段验证与失败保真

完整旧树浏览器27检查实际复现：配置页额外读取用户payload、关闭后迟到响应重开抽屉、A/B响应倒序覆盖、离开用量页后抽屉仍出现。新版31检查、7组原config/usage/detail HTML快照完全相同，以上四项关闭，另含token变更不接旧详情、两种原Bearer/cookie链、备注/禁用原payload、失败刷新保留旧数据及显式重试。session/Next导航、非目标子面板/图片是明确fixture端口，目标完整React与HTTP真实执行；不是完整Next/线上验收。

- 最初两个baseline尝试只在harness准备失败：esbuild fixture缺resolveDir，随后依赖读取process.env缺浏览器define；原日志保留，未为fixture失败改产品。
- 首次modified的失败刷新断言错误地期待离开/重进后仍是365天；原导航明确回tab=usage且无days，应为30天，仅修期望。原失败保留。新增token换届反例后最终旧/新将集中执行固定SHA。
- 全项目tsc空输出exit0；lint初两条把数字generation ref误当DOM ref的cleanup警告，改为稳定失效回调，最终无warning/error。真实隔离PG原admin-access入口已PASS，包括密码门禁/旧cookie/轮换/受保护API和返回地址。
- 旧local-media verifier消费者迁到实际member-artwork owner，初次未剥export导致VM语法错误；只修旧harness的导出消除，现原本地/远端作品链接断言全部通过，不把跳过helper当通过。

最终同SHA core25/完整浏览器、main普通同步、结构/四产物/回滚与清理以DELIVERY为准。原设置16个保留声明精确不变；导航别名/迁移规则原字节相同；auth probe仅删除无关loadUsers和旧bonus state，原配置回填/保存/加密/支付/积分兼容保持。


## 固定源码封版记录

固定清洁merge源码`8f3bc5bf3571cfc2e5af1b36a0c49bbe099c6d81`，两个parent为实现`a663d40f085d487a899801b667aaa8e7a1125da5`与main`cde64c6aedd75c5197ee2ae17e7bac8759fb8bed`；upstream只增加既有发布记录文档，无产品冲突。原整合main为a1a56371，本次第三模块普通同步完成，累计归零；没有把重构分支合入main或开启发布。

- core25/25 PASS、failed0/not-run0、exit0；全文件digest=`62eac4d5565be69830dc99dcf5f6928860ffa38af3f2bba42f6a520612e88fe4`。其中新增admin-usage为实际目标编译/原链接/退休分支静态24检查，不冒充浏览器。
- 最终完整旧浏览器28／新版31检查，7组HTML完全相同，关闭/成员倒序/离开/token旧响应不回写，配置页用户读取1→0；同body原备注/封禁/站点名更新、用量period/错误重试和原权限负例保持。
- 原admin-access PG、local-media UI、tsc/lint通过；runner12类66检查；emitted静态/全字面导入环均0。系统设置3331→1971行，16个保留函数精确文本相同，导航兼容策略原字节保持。
- 此后只更新本文及台账，最终SHA与被测mergeSHA分层登记；全部产品/服务/验证脚本字节一致。四产物/4487hash独立回滚和原28行为恢复、patch复放、远端及cleanup以DELIVERY为准。

整体active。本模块只收敛用量/会员详情与退休平行面板；剩余配置输入职责/测试资产、长时混合生成负载、依赖及最终完整版本整合不记完成。R6E曾被工具拒绝删除的三个Pythonfixture目录不由本轮重试清理。
