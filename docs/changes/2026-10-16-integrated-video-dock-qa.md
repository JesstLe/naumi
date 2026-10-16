# 实际整合候选7de4de5：Video Dock集中回归

## 来源与范围

root实际候选 `7de4de591acb65c9a8d1af4239b5c9193ec66ff0` 已无冲突合入同事 `004dd038869b7a1bb908101604ea750bf8401701` 的视频节点Dock。验收在独立worktree合入这个**实际整合提交**后执行，不复用原c2634fb分支测试结果。

对root当前磁盘的CanvasClient、generation-node、node-toolbar、result-dock、settings-dialog、video i18n与两份fixture/验证脚本，共8文件逐字节SHA256比较一致；`git diff 7de4de5 -- src/components/canvas/canvas-client.tsx src/components/canvas/video src/lib/i18n/video.ts`为空。既有canvas epoch、账号/项目guard与共享layout改动保留，未替换为同事旧基线。

## 集中实测

实际Next15.5.27 + React19.3.0 CanvasClient/ReactFlow，原生无头Edge；本机合成API只经14337→14336，未配置真实DB或供应商网络。复用原21组脚本，使用原已验MP4下载字节作为独立本地文件；不是假视频占位符。

```powershell
$env:VIDEO_DOCK_FIXTURE_PORT='14337'
$env:VIDEO_DOCK_NEXT_PORT='14336'
$env:NODE_OPTIONS='--max-old-space-size=2048'
node scripts/serve-canvas-video-dock-fixture.cjs
# 另一个进程：
$env:VIDEO_DOCK_FIXTURE_URL='http://127.0.0.1:14337'
$env:VIDEO_DOCK_EVIDENCE='E:/Workspace/naumi-release47-app-drain-20261016/output/dock-integrated-7de4de5'
node scripts/verify-canvas-video-dock.cjs modified
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
```

字面结果：`MODIFIED=PASS CHECKS=21 ACTUAL_CANVAS=true DESKTOP_390=PASS DRAFT_REVISION=PASS SINGLE_SUBMIT=PASS PAGEERRORS=0 PROVIDER_CALLS=0`，退出0。完整TypeScript输出为空、退出0。

覆盖：单击锚定且无自动生成、删除重复内联操作、展开/折叠草稿保持、连续保存与revision、刷新回读、position-only重基、外部config冲突不覆盖、原重命名路径、拖动共享几何、图片/文字Dock不回退、390px边界、移动更多菜单/Escape、两个video切换、显式只提交一次、停止原任务、UNKNOWN不能重发、原高级dialog共享草稿、锁定/只读、video artwork不显示图片工具、真实MP4解码与下载字节一致。

21组通过、pageerror0、外网请求0、真实供应商0。浏览器截图已打开检查；未发现需要新增业务patch的整合缺陷。本项不证明服务端授权、生产DB或真实视频供应商生成质量；最终新固定镜像仍由root构建及上线验收。

## 现场与证据

绝对证据：`E:/Workspace/naumi-release47-app-drain-20261016/output/dock-integrated-7de4de5/`，含browser-verification.json、typecheck.log、integrated-source-sha256.json、桌面/高级/390px截图与下载MP4；完整stdout在同级`dock-integrated-7de4de5.log`。

Next仅自动格式化独立worktree的tsconfig并增加fixture include；已把其原始改动副本留证后恢复原Git字节，未提交这些自动变化。原fixture CTRL-C退出，本机14336/14337监听已结束，没有停止其他服务、连接服务器或修改任何Canvas业务文件。
