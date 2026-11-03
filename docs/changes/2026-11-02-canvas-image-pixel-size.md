# 画布选中图片右上角像素尺寸

## 模块与职责

用户确认在选中图片的右上角增加纯数值尺寸显示。固定实现基线为main `ca63c76fa0f8c87ae404ad500ca65f71b064e62e`。本次仅属于Canvas节点展示：`image-pixel-size.tsx`是无I/O纯组件，`ArtNode`负责传入已经存在的原图尺寸及选中状态。图片、元数据、任务及账务归属不变。

## 本次实现

- 标题栏右侧显示 `宽 × 高`，例如`1024 × 1536`；沿用浅色/暗色画布语义色和等宽数字，文件名可截断，尺寸不换行，不增加标语或说明段落。
- 仅选中且已有图片时显示，未选中、生成占位、视频和缺失素材不显示；合法原图宽高尚未就绪时不猜测、不用画布显示大小代替。
- 优先复用作品的`intrinsicWidth/intrinsicHeight`；缺少时复用当前图片现有`onLoad`已读取的`naturalSize`。切换图片时不使用上一张图的naturalSize。
- 普通节点拖拽缩放和画布缩放不改变原图像素；原图实际被裁剪、替换或生成新版本时跟随现有元数据更新。
- 没有新增fetch、原图下载、解码、metadata API、数据库写入或轮询；既有媒体预览选择、`onDimensions`和`onResizeEnd`处理保持原样。右上角标签不拦截鼠标操作。
- 不恢复用户已关闭的A/B说明弹条；C/D/E/F提示不变。

## 验证与证据层级

集中测试入口：`scripts/verify-canvas-pixel-size.cjs`，使用实际组件/ArtNode函数、React与Chromium，外部媒体和ReactFlow为明确本地fixture。覆盖选中/未选中、原图元数据、预览尺寸、已加载原图回退、切图、拖拽/画布缩放、长标题和版本、窄节点、非法尺寸与无额外网络。

原版→修改版→独立副本回滚的命令、输入、字面输出及退出码、截图与四产物保存在`output/canvas-pixel-size-20261102/`。发布/最终集中验收结果在后续增量补充；不将本地渲染称为已经上线。


## 最终验证与103上线（2026-11-02）

- 实现提交`e62605ab`，固定构建main `cc830f931a9c0d32810cd8d16764b71c54254fc8`，BUILD_VERSION `1793582472`；北京时间09:38完成103更新。Web/Worker同镜像 `sha256:b78f4fc745c31ac8106bff50cf8f7f78e97916801396333dfd2b91e82facc7e1`。本轮main包含此前已完成的缓存/连接修复，发布未退回旧分支或覆盖主线。
- 原版21项中9通过、12未满足新增标签合同（exit1）；修改版与独立修改副本21/21（exit0）；copy-only回滚恢复2原文件、移除3新增（exit0），再次21项恢复9通过和相同12项失败（exit1）。later-edit末项文档及source-root guard均exit73/WRITES0。
- 实际React19.3.0＋Chromium，真实ArtNode/组件/项目CSS：原图metadata、预览不冒充原图、已有naturalSize回退、切图、拖动、锁定只读、长标题/版本及120px全部标记均通过。NaN/Infinity/-Infinity额外3项均不显示。
- 原版与修改版完整请求清单一致：各7个GET（页面/CSS/JS＋4次既有图片加载）；新增请求0，metadata请求0。选中/调整节点宽高不新增加载或尺寸回写。这个结论是该组件交互fixture的实测，不夸大为整站性能压测。
- 全项目tsc stdout/stderr空，exit0；生产构建134.87秒、exit0。network-none真实镜像首页/Canvas/37资源、版本/公开说明、Worker/media通过。
- 线上新镜像中的实际编译标签函数20项通过：5组合法尺寸、14组缺失/非法尺寸与ArtNode接线。直接读取实际静态chunk运行，没有用重新编译的源码替代；这层是实际制品验收，不冒充生产浏览器拖动。
- Nginx新版静态507个文件逐HTTP/hash通过；3975旧文件原样保留，总3996个。原认证/DB健康、对应公开更新说明真实通过。
- 原4笔任务payload/snapshot、账务、供应商和模型117前后proof完全一致；原3笔成功仍各6积分，旧失败0积分/supplier UNKNOWN保留。本次新生成0、新扣款0，未回灌数据库/媒体。47及其他站点未操作。
- canonical revision255、activeDirect103ReleaseId=release103-pixel-size-20261102、COMPLETE；旧Web/Worker exited、restart=no，双锁实际非阻塞acquire/release验证FREE。

### 产物与保留边界

- 本地实际组件截图：`output/canvas-pixel-size-20261102/modified/LIGHT_SELECTED.png`，已打开检查数值位于右上角。样例原图941×1672，截图中的ReactFlow/图片传输为fixture。
- 源码四产物：`output/canvas-pixel-size-20261102/MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。原改hash与逐条命令/输入/字面stdout/stderr/exit齐全；归档为实施提交快照，本节为后续发布增量，不反写旧包。
- 发布汇总：`output/release103-pixel-size-20261102/VERIFICATION.txt`、`remote-evidence/FINAL_ACCEPTANCE.json`及`FINAL_STATUS.json`，均重开。
- 首次测试fixture空id导致既有`startsWith`防线报错，修正脚手架后按同一矩阵跑原/改/回滚，原失败日志保留；Browserslist旧数据库提示原样记录，最终pageerrors0。
- 标签显示原图像素，不表示拖动画布节点会重采样图片；已打开的旧页面需刷新到新版本。没有新增数据库列、API、原图下载或服务器解码。
