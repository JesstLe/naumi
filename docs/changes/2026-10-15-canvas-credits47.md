# 47 画布积分横杠修复

## 根因与基线
- 用户指定 47.105.59.142，不连接其他站。独立 worktree/分支 `codex/canvas-credits-47-20261015`，开工及候选前刷新 origin/main=cf73820。
- 原生浏览器实际 `/api/auth/session` 返回可用 998626，画布闪电的父节点却是 `—`。不是账户没积分，也不是接口返回 0。
- 作品缓存 `loadAccountSnapshot` 有意剔除 user/余额等敏感字段；画布初始化仍把 credits 留在 null，只有完成生成或充值后的旧 refreshCredits 才赋值。不能通过给空值填 0 修复。
- 47 当前主后端 `naumi47-r2-image-main-20261015`，镜像 c952f4a407e0+独立R2挂载；原生工作台API13069、登录旁路13063保持。版本接口仍报告业务基线 f4b3df1/1791989816，不能冒充整个 main 已发布。

## 实现
- 共用 `useCanvasCredits`：本人来自已经服务端 hydrate 的认证上下文；积分变化只更新挂件，不重载/覆盖正在编辑的作品。
- 管理员只读目标单独鉴权读取，保留 no-store、真实0、目标账号匹配、有限数字校验；账号/目标切换、退出、迟到响应、同账号并发响应均有隔离。
- 生成/退款/充值原有 refreshCredits 调用保持；focus/online 自动补读，不把余额放进作品缓存。
- 为避免把 main 其他未发布业务整模块上线，从实际运行静态 chunk 生成三处精确补丁：状态接入同一个源码hook、移除旧刷新函数、移除作品effect的余额清空。其余字节保持。
- 新资源使用新内容hash文件名并更新候选manifest；原有同名immutable资源绝不覆盖。候选镜像继承当前主后端，专门代理 `/canvas` 与新chunk，不改原API/SSE/媒体/Worker/旧浏览器资源。

## 集中验证与待完成
- 精确运行chunk的14项hook回归通过：初始17、真实0、余额13、只读38、非法/403、并发次序、退出/旧回调、online恢复、目标切换、余额不为负。
- baseline原模块复现 session=17、canvas=—；不是把已失败的产品验收写为绿灯。
- 本地全量tsc退出2，仅已有 canvas-action-menu.tsx:82 的 React RefObject 可空类型不兼容；本次未改该文件，不称全量类型通过。新hook独立类型、完整JS语法和原生真实浏览器另验。
- 下一步：双/三锁内备份、精确candidate、原生浏览器真实数值/项目页/编辑器/刷新/只读账号验证、网关CAS切换及副本回退；最终结果随后补录。付费生成调用0。

## 回退与交接
- 回退只恢复本次网关配置/资源引用，不恢复旧数据库、不改积分、不删除作品、不停止在途任务。
- 本地证据 `E:/Workspace/naumi/output/canvas-credits47-20261015`；远端同名 evidence 目录。四项 MODIFIED_FILE.js/DIFF_FILE.patch/VERIFICATION.txt/ROLLBACK.sh 实际产物待最终重开验证。
- 功能迭代1/3。Git整合与发布各自记录，不把文档提交计为发布次数；原生布局/交互不改。
