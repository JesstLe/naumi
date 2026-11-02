# 视频节点模式入口与素材承接

## 模块与职责
- 基线 `2b990949421214802ae900e34f2baf6869f78443`，唯一任务 worktree `E:/Workspace/naumi-canvas-video-modes-20261102`。
- `video/mode-selection` 负责界面意图映射、基于已发布目录的候选模型筛选，以及显式素材接入后的同模型模式承接。
- `VideoModeSelect` 复用 Naumi `SelectMenu` 和 `CanvasActionPanel`；展示、键盘和明确模型选择由组件负责，生成提交/报价/持久任务仍由既有父组件负责。
- 原 `reference` 同时服务图片参考和全能参考；二者仅是界面意图，不新增 wire mode，不修改节点/任务 schema，不推断模型名称含义。

## 本次实现
1. 五项主模式始终可发现：文生视频、图生视频、首尾帧、图片参考、全能参考；原有编辑/续写/运动控制/口型同步及可选帧模式按实际目录补充。
2. 当前模型支持时直接选择。只有其他已发布模型支持时，进入匹配模型选择面板；必须明确点击模型才改变草稿，打开/取消不改变 model、mode、prompt 或引用。整个目录都未配置的模式保持不可用，不伪造能力。
3. 向文生节点添加一张图片时，在原模型确实支持的情况下切换图生视频；多张通用图片或混合媒体按原模型已声明能力承接为 reference。不会把两张普通参考图暗中解释成首尾帧，不自动替换模型。
4. `single_image` 添加额外素材后可承接为同模型 reference；合法已声明的单帧＋音频组合保留原模式。超出数量/种类能力时保留全部素材，既有服务端同款 validator 阻止无效提交。
5. Picker、上传、@引用及编辑器打开时的外部连线共用承接逻辑；只有新增引用触发。重开旧草稿不自动改写。
6. 切换模式不移除图片、视频、音频或截断提示词。选择图片参考时若已有视频/音频，明确反馈并保留原状态。
7. `audio-node:` 与 `timeline-node:` 保留各自 `source_audio` / `source_video` 角色；角色控件不再允许选这两类原生绑定不支持的角色。
8. 新增交互和错误文本提供中英映射；模型名称和用户提示词不翻译。

## 公共接口与状态归属
- 纯 helper：`availableVideoIntents` / `supportsVideoIntent` / `videoIntentModels` / `videoIntentMode` / `currentVideoIntent` / `attachVideoInputs` / `selectVideoIntent`。
- 输入是已有 config、OrderedInput 和已发布 ResolvedVideoCapability；返回新对象，不修改源数组或目录。依赖单向流向现有 client-settings/contract，未引入持久状态或独立总线。
- 图片/全能 reference 显示偏好仅在当前节点和模型下保留，实际含视频/音频时展示全能参考；实际请求仍由真实输入与既有校验控制。
- 组件完全不发起生成/采购请求，不改不可变模型版本、报价、operationId、lease/CAS 或用户余额。

## 集中验证
使用 root 准备的 `E:/Workspace/naumi/output/canvas-video-modes-20261102/test-source`（React 19.3 / Next 15.5.28）；原任务 checkout 的共享旧依赖没有修改。源文件在原 worktree 编辑，仅显式路径同步到验证副本。

```text
node --import tsx scripts/verify-video-mode-selection.ts
VIDEO_MODE_SELECTION=PASS CHECKS=36 AUTO_MODEL_SWITCH=0 INPUT_LOSS=0 SUPPLIER_CALLS=0
exit 0

node scripts/verify-video-mode-ui.cjs --baseline
VIDEO_MODE_UI=REPRODUCED CHECKS=3 CURRENT_MODEL_HIDES_MODES=1 IMAGE_ATTACH_STAYS_TEXT=1 API_SUBMISSIONS=0 SUPPLIER_CALLS=0
exit 0

node scripts/verify-video-mode-ui.cjs
VIDEO_MODE_UI=PASS CHECKS=11 DESKTOP=1366 MOBILE=390 AUTO_MODEL_SWITCH=0 INPUT_LOSS=0 API_SUBMISSIONS=0 SUPPLIER_CALLS=0
exit 0
```

UI runner 加载实际 React 组件、模式 helper、normalizer；目录及素材是本地控制夹具。自有无头 Edge 通过拦截 HTML 运行，不启动监听服务、不使用用户浏览器、不访问 App/供应商 API。验证显式模型确认、取消、素材保留、首尾帧、混合媒体、原生音频角色、外部连线、只读、键盘以及390px无横向溢出。

定向 Next lint exit 0、无警告或错误。全量 `tsc --noEmit --incremental false` exit 2，Buffer/BodyInit 等诊断发生在本切片之外；日志 `ui/typecheck.txt` 保留，主线程负责基线对照与整体结论，不把本切片无诊断称为全项目类型检查通过。

首次 runner 的入口文件放在 shared output，esbuild 向上解析到旧 React，造成双 React hook 错误；后显式 alias 到验证副本的 React/ReactDOM，保留失败日志。第二次 fixture 未把 choices 传给实际 native-audio preview，导致测试素材不可用；修正 fixture 装配，未放宽产品校验。

截图实际生成并逐张打开：`output/canvas-video-modes-20261102/ui/video-mode-menu-desktop.png`、`video-mode-omni-desktop.png`、`video-mode-menu-mobile.png`。这是实际组件的本地渲染，不是生产目录或收费视频验收。

## 待完成与交接
- 主线程统一集中类型/lint、主线整合、能力配置升级、供应协议与持久执行验收。
- 本子任务不提交、不连接服务器、不发布、不执行真实供应商调用；47 发布决定及103隔离线遵循主线程最新指令。

## 最终主任务收口
- helper新增首帧角色保留回归，最终42项通过；真实组件桌面1366/移动390的11项通过。
- exact package-lock依赖副本 locked-test 全量tsc exit0；之前错误donor诊断不是最终结果。
- 同reference模式重选/添加保留明确角色；图生转reference仅在目录显式supportsReferenceFirstFrame=true且有视频时保留首帧，不按模型名猜。
- 完整App/配置/协议/主线及回退证据见 `2026-11-02-canvas-video-modes.md` 与任务证据根 VERIFICATION.txt。本轮不发布47。
