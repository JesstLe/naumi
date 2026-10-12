# 画布历史选择与相邻操作排查（2026-10-12）

## 本轮确认及修复

- 底部 Dock「从历史选择」仅接受 HTTP 图片，过滤掉现行 local 媒体 `/media/...`：统一采用持久化图片 URL 判断，保留 HTTP/HTTPS，排除未完成作品和工作流装饰/缺失素材占位。
- 历史复制尚未完成即关闭弹窗且吞掉异常：失败保留选择器，显示简短重试提示；提交中显示当前作品加载状态，同步防重复点击。超过首批60条的历史可继续加载。浅色样式、关闭标签及 Escape 保持。
- 空白画布导入历史作品：刷新结果确认后，再打开新项目并选中节点；现有项目复制不切换其他项目。复制过程中用户切换项目，不抢焦点或把撤销记录放入新项目。
- 节点复制重复提交、复制/单图下载/项目与选中项ZIP失败无提示：复制按源节点防重入，失败释放；下载显示简短错误。服务端创建成功但刷新结果暂不可见时，提示刷新，不诱导重试创建第二份。
- 管理后台「重做」/工具跳转/源图预览、作品转模板与生图模板原图载入仍只认远程URL：支持现行 local 媒体，管理员鉴权及跨账号复制隔离保持。不将该UI判断用作网络请求或文件访问授权规则。
- 当前 `/works` 单张收藏未检查非2xx；批量收藏吞掉失败却显示全部成功：单张失败回滚并提示，按作品防重入；批量仅保存成功项、提示部分失败，重试只提交未收藏项。
- 旧 `DashboardClient` 无当前路由引用，其修改已撤回，未把旧组件当成现行工作台页面验收。

## Git、协作与迭代状态

- 独立分支：`codex/canvas-history-picker-20261012`；未发布服务器、未合入main。
- 开工基线：`b1d10c21bcfc36ecbbfcc0bda6200b890b4a2a2f`。
- 首次保存任务提交后普通合入最新 `origin/main=d0692fe8cc23713aaf499e03efd6439aec74728d`，无冲突；其中已包含上一轮生成并发和视觉审核修复，以及同事小球状态功能。本轮未另行改动这些模块的业务语义。
- 按模块计数：前两轮+本轮历史选择到3，刷新main并归零；之后相关媒体入口/操作反馈排查作为下一模块，当前计数1。构建前再次fetch确认远端main仍为d0692fe。
- 只提交本任务文件。共享 E盘checkout及他人工作区未重置、未自动stash。

## 集中验收

命令均从独立worktree运行；详细原始输出与四个交付材料在忽略目录 `output/canvas-history-picker-20261012`。

1. 原始浏览器复现：`node scripts/verify-canvas-history-picker-browser.mjs --baseline` → `BASELINE_HISTORY=CONFIRMED LOCAL_MEDIA=FILTERED_OUT HTTP_HISTORY=VISIBLE`。
2. 修改后真实 Next/Edge 页面：`node scripts/verify-canvas-history-picker-browser.mjs`。验证60条后加载、local及远程图片、失败保留/重试、提交禁用、现有项目落点、关闭/Escape、空白画布新项目、现行作品库收藏失败/部分成功/仅失败项重试、模板local原图实际进入参考槽。最终 `HISTORY_BROWSER=PASS ... PROVIDER_CALLS=0`，页面异常0。
3. `node scripts/verify-canvas-media-actions.mjs`：运行源码中的实际处理函数，复制防重/失败释放、下载错误可见；空白项目初始化、切换项目不抢焦点、创建成功后刷新缺失不重建、只读保持。
4. `node scripts/verify-local-media-ui.mjs`：local/HTTP/HTTPS支持；拒绝javascript/data/blob/非media路径作为持久化图片；实际后台跳转函数保留gen/src/view。
5. `node scripts/verify-works-favorites.mjs`：实际收藏处理函数检查单张失败回滚、批量部分成功、重试仅失败项、防重复提交。对原始源码单独验证HTTP失败仍假成功，回滚副本恢复同一原行为。
6. `NAUMI_VERIFY_ISOLATED_DB=1`及本机专有PostgreSQL fixture运行 `node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-local-media-api.ts`：真实add/import路由与数据库持久化，复制为新节点且保留parent/x/y/原图，跨账号404，管理员导入local模板，非管理员403、非法URL400、账本不变、上游调用0。原始API副本验证local模板导入400。
7. 类型检查、7个改动文件lint、diff检查，以及继承的生成并发合约/节点锁回归均通过；隔离 `.next-history-build` 正式构建exit0。源代码回滚副本恢复原始SHA256和原来历史/收藏/复制/模板行为，实际任务分支保持修改；命令与字面输出见同目录 `delivery/VERIFICATION.txt`。

初次扩展浏览器脚本误访问旧组件所在的历史路由、随后选择未展开的菜单按钮及错误模板参数；已按现行路由/真实点击/`template`参数纠正，未用强制点击绕过遮挡。首次回滚脚本从嵌套目录被Git父仓库识别而没有应用；改为显式独立Git副本，并用逐文件哈希与原始行为验证，原失败日志保留。

浏览器API被受控fixture替代；数据库为独立本机容器和随机schema。这些是开发回归证据，不等于线上账号/真实付费供应商或服务器发布验收。

## 回滚与剩余事项

- 四个材料：`delivery/MODIFIED_FILE.zip`、`delivery/DIFF_FILE.diff`、`delivery/VERIFICATION.txt`、`delivery/ROLLBACK.sh`；原始/修改后SHA256在`hashes.json`。
- 回滚脚本只接收带 `.naumi-history-rollback-fixture` 标记的源代码副本，先反向patch检查再应用；实际分支保持修改，不回灌数据库或删除业务数据。
- 待统一发布agent按约定刷新同事分支/主线、合并候选、持部署锁并进行线上定向验收。未宣称所有画布问题均已排除。
- 未扩展到工作流导入、支付、全部20余工具或账号切换全链路；现有意图明确的解析/缓存fallback不一律改成报错。
