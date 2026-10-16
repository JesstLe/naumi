# 视频节点选中Dock适配

## 实现范围
- 基线 c2634fb，独立 codex/canvas-video-dock-20261016，保留其他同事未提交的 canvas-action-menu。
- 视频节点单击与图片/文字一致：节点顶部操作条、锚定输入Dock；共用canvasDockLayout、测量与实时viewport跟随，不使用全屏模态框替代单击编辑。
- 顶部设置/引用展开同一Dock内原生视频参数组件，提示词/引用草稿不因展开折叠丢失；历史、重命名、复制、副本、下载、删除、属性和层级操作复用已有回调。
- Dock继续使用原报价/校验/saveVideoDraft/generateVideoDraft/receipt幂等链路；无生成动作时不发起付费任务。运行/unknown任务阻止再次提交，保留停止；只读/锁定禁止修改。节点齿轮/双击仍支持原高级模态框，并与Dock共享草稿，不破坏已有高级设置入口。
- 结果/导入视频Artwork另接VideoResultDock（提帧/裁剪/提取音频/继续创作），屏蔽图片工具与生图Dock；视频下载复用媒体代理并保留mp4文件名，不套用PNG命名。
- 节点内不再重复显示编辑/生成工具；已有播放器、结果、状态保留。坐标修订可安全更新草稿revision，但外部配置冲突不强行覆盖。
- 不改Worker、generate-image、数据库或服务器，不将本地功能写成公开已发布更新。

## 本地验收与边界
Next15.5.27/React19.3.0实际CanvasClient、ReactFlow、表单组件与原生无头Edge通过21组；包含桌面/390px、图片/文字Dock保持、切换/拖动、展开/折叠草稿、连续保存revision、坐标修订重基、外部配置冲突不覆盖、运行/unknown防重复、只读/锁定、旧高级入口共享草稿、MP4原生解码/下载字节相等。pageerror0、外网请求0、真实供应商调用0。
API为本机合成状态，不冒称真实数据库/服务端授权/供应商视频生成已验收。原版浏览器基线确认无视频Dock；独立副本回退后重新验证原行为。完整tsc/四件证据见 E:/Workspace/naumi/output/canvas-video-dock-20261016/VERIFICATION.txt。
未上线、未SSH、未持47三锁、未建候选。开工与提交前刷新main仍c2634fb；功能同步计数1/3。未把他人未提交样式/布局/工具栏去重整支覆盖进本任务。
