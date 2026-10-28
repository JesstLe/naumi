# 画布缩放与项目封面显示稳定性

## 调研与基线

- 独立分支 `codex/canvas-image-stability-20261028`；基线 `294beac9862f9877d763afd12d29ca83a544adfd`。
- 47 公网 `/api/version` 本轮只读返回 `e2217c983fe74f4829f2cacb3f69305428af0b11 / 1793098906`。相关 CanvasImage/CachedImage 源码与基线一致；不是缓存完全没上线。
- IndexedDB 按账号、素材、变体和版本保存图片字节，128 MiB / 400 项 / 7 天；重新展示依然需要授权元数据。此缓存不等于已解码图片/DOM 生命周期缓存。
- CachedImage 在 src 变化时立即清空 resolved，并在 effect cleanup 中 revoke 原 Blob URL，随后才重新授权/读 IDB。缩略/预览/原图切换因此出现空帧，即使命中磁盘缓存。
- CanvasImage 离开可见范围即传入 undefined，已加载图也会卸载；原有只升不降质量策略不能防止这类清空。
- 全部项目分支被条件渲染卸载，封面使用 cdnUrl 原图且无 lazy；重新进入会再取缓存、重新解码。

## 模块与实现

- CachedImage 拥有显示租约和解码交接；缓存层继续负责字节、授权和版本。新增 imageIdentity 只表达同一素材的质量变体，不跳过新变体的鉴权；不同素材、账号、撤权不复用旧画面。
- CanvasImage 保留已经加载的离屏画面，未加载离屏节点仍取消/不占下载槽；离屏不升级画质，慢速升级不盖白色超时蒙层。原图检查、错误重试和原有质量策略保留。
- ProjectBrowserSurface 只在访问后保留 DOM，离开时隐藏；按账号/工作空间重建。ProjectCover 使用懒加载缩略图，原始媒体地址及下载不变。
- 不修改任务、积分、生成、连线、数据库、供应商或服务器配置。47 发布 HOLD 保持。

## 集中验证

证据根目录：`E:/Workspace/naumi/output/canvas-image-stability-20261028-r1`。

- `verify-canvas-image-stability.mjs --source-root <before> --baseline`：原三文件字节真实复现，exit 1（预期）。缩放 29 个空白帧；项目页返回新增图片下载 0 但图片未解码、DOM 已重建。不是用缺少新接口作为失败条件。
- 同脚本修改态：React 19.3.0、真实 React Flow、IndexedDB、HTTP 和浏览器 decode，14 项通过，exit 0。升级清晰度、加速 20 秒超时门闩、往返、离屏、反复缩放、源切换、隐藏封面撤权、换账号、decode 门闩、卸载中的异步回执、原生队列、Blob 全释放均通过；缩放空白帧 0，返回项目 DOM 复用，媒体/元数据新增请求均 0。
- `verify-browser-image-focus.mjs`：原有缓存/聚焦/权限回归 21 项通过（包含真实 15 秒超时、401/403、断网、跨标签及 storage logout、70 素材批次、超大图路径）。
- `verify-canvas-image-navigation-ui.cjs`：完整 Next CanvasClient、本地 API fixture、真实点击项目菜单→全部项目→进入项目→返回，5 项通过。真实封面为授权缩略图，往返同一个已解码 DOM，390px 无横向溢出，页面错误/供应商调用 0。截图已打开检查。
- `verify-canvas-media-loading.ts` 与 `verify-canvas-image-content.ts` 通过；正确主线依赖下 `tsc --noEmit --incremental false` exit 0。
- 首轮复用了共享目录的过期 React 18/Next 14 依赖，类型报错含缺失 three 等；已将本任务依赖 junction 改到现有主线 React 19/Next 15 依赖，并重跑上述核心/缓存/类型验收，不改共享依赖。
- 首次完整 UI 脚本误点收起菜单里的按钮；修正为用户实际打开项目菜单再点击，并接入真实 `/api/account` fixture 数据后通过。未为测试修改产品行为或放宽断言。

## 证据范围与交接

- 本次是本地产品组件与完整 Next 页面验收，不是生产浏览器体验已更新。47 未发布，在线版本仍以只读 `LIVE_VERSION.json` 为准。
- 首次打开、从未加载的图片或缓存被容量/期限淘汰后仍需加载；权限校验仍保留。超过 300 节点/1000 连线的原有 React Flow 虚拟化策略不在本次调整范围，卸载后再进入的首帧不扩大宣称零加载。
- 副本回滚、完整命令/输出/哈希、Git 整合结果以证据目录 `VERIFICATION.txt` 为最终记录。新副本/测试账号数据未变，未触发生成、积分或供应商请求。
