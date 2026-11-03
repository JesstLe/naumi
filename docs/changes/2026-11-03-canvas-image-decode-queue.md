# Canvas 图片解码并发

## 模块与职责

基线 `dfdec4f8` 已有图片读取阶段硬期限和离屏引用回收。本模块补齐另一个独立资源：缓存命中后的候选图解码。字节下载六槽不限制缓存命中同时执行的 `Image.decode()`。

- 新 `image-decode-queue.ts` 复用现有 `MediaLoadQueue/acquireMediaSlot`，单独4个Canvas候选解码槽；不是占用字节下载槽，不限制已显示的帧。
- `acquireCanvasImageDecodeSlot(signal)` 只返回本调用方拥有的释放函数，排队30秒有界；取消或超时的迟到票据及时释放。
- `CachedImage` 仅在 `networkQueue==='canvas'` 使用它，拿到票据后才创建候选Image和设置src。活跃decode仍是独立20秒期限；排队不扣除活跃预算。
- 成功、错误、取消和超时均在finally归还槽。非Canvas图片保持原有行为，引用计数/共享Blob/同身份旧帧/权限清图保持。
- 不改变图片质量、原始字节、节点、供应商、报价、任务ID或自动重试。Timeout/Abort仍不当作坏缓存再次下载；真正坏缓存至多单次原有repair。

## 验证

真实React/CachedImage、Edge、实际PNG解码，HTTP/auth为显式fixture。计时和解码完成gate用于测并发与取消，不把它称为GPU/RSS测试。

- 基线12项：5个反例、7个正控，预期exit1。
- 修改版最终16项通过：热缓存并发、非Canvas不受影响、排队卸载、活跃取消/超时、两个预算独立、共享素材取消、坏缓存repair、账号清除、自然尺寸、旧帧和权限拒绝。
- 原图片期限17、离屏驻留13、缓存效率13及全量类型检查通过；最终整合验收继续核对源码哈希。

新增实际覆盖票据交接取消/重复释放、排队升级超时保旧帧、data URL取消后两队列恢复。另实际复现CanvasImage独立20秒timer在健康排队时提前弹失败，最终移除此重复墙钟，沿用CachedImage各阶段硬期限与最终onError；不是取消超时。该组合反例exit1、最终相同场景通过。

证据根 `output/browser-stability-goal-20261103/`，定向结果在 `decode-baseline-final`、`decode-modified-final`、`decode-regressions`。四产物和真实副本回退由父任务最终登记。

## 交付边界

本模块只证明应用发起的Canvas候选解码并发有界；浏览器内部图像处理、显示纹理、非Canvas图片和总进程内存不由此全覆盖。固定生产构建/线上发布不是本地模块验收的同义词。当前持续目标仍active，认证/节点初始化和懒面板恢复另行完成，不把本模块完成当整体完成。
