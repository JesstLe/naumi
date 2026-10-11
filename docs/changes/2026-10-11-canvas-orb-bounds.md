# 小球可移动范围扩大与本地同步

## 原因与修改

- 原orbBounds硬性预留顶部76px、底部最多136px、横向12px，尤其窄屏可用竖向范围过小。
- 四边仅保留8px间距，仍按88×112的完整球体/状态标签范围收边，不允许拖出画布viewport；不进入独立Agent侧栏，不随画布平移/缩放移动。
- 浮层z-index 24→32，高于普通画布工具栏30，避免拖到顶端后被工具栏遮住而难以拖出；仍低于侧栏/菜单/弹窗，浮层空白处保持pointer-events:none。
- 720px高画布的竖向可移动距离396px→592px，增196px（约49%）；672px高画布348px→544px。账号位置保持原归一化数据，适配新范围不清空位置。
- 保留拖动6px阈值、pointer capture、取消复位、键盘、明暗主题、真实Agent终态与富文本。本轮仅改边界函数和对应测试，不变更后端/计费。

## Git核对

- 开工fetch后任务工作树与origin/main均为0cf5e63；先补全上一轮已发布验收文档，8b8bbde推送main。
- E:/Workspace/naumi原main为21a6616，落后19次提交且clean；已fetch并merge --ff-only至8b8bbde，无冲突、不切共享分支、不重置。开发继续在独立worktree分支codex/canvas-orb-bounds。
- 开工基线8b8bbde8847940dbd68ce49dec17602b295dd4a4，发布前新机基线0cf5e63。业务提交164f9a1dfc2d8979a4b2c4e0558b9af7ad6a7311已推送任务分支和main，共享checkout快进到同SHA。

## 验收与新机发布完成

- 小球126项、富文本247项、TypeScript和正式Linux构建通过。本轮只调整前端移动边界，无新模型调用。
- 实际912×720画布，侧栏打开，四角均拖到8px边距；左上工具栏区域可再次拖出，面板不误开关，画布transform不变。方向键上移12px，刷新后位置816px/588px精确恢复。截图和browser-result.json在output/canvas-orb-bounds-20261011。
- 新机固定业务源码164f9a1dfc2d8979a4b2c4e0558b9af7ad6a7311，APP/Worker Image ID sha256:006d4fca8cbfaf132f2f27ee09f8968d4b3be68bc897518b1d76263a1161a989，实际1791692849 / v2026.10.11-122729；15项线上资源/版号检查、健康及浏览器通过。
- 用户担心旧版覆盖后，再fetch核对origin/main和开发HEAD均为164f9a1；运行镜像及/api/version commit同SHA，git merge-base --is-ancestor 0cf5e63 164f9a1退出0，确认包含上一轮富文本/主题版本，不是21a6616旧代码。
- 全程deploy.lock、完整可读DB备份/临切最新快照、env/Compose及固定0cf5e63回滚保留；数据库容器/公网代理/模型配置/元数据和采购价指纹不变，仅NAUMI_IMAGE切换。ORB_BOUNDS_RELEASE=PASS，锁已释放，临时私钥副本清理且原hash不变。旧机未连接/回传。
- 维护计数=1；新机81%/19GiB，下次构建前按>80%规则盘点清理。本次停止本任务13476验收服务，清理本机4个可重建fixture/debug产物4,628,838字节，保留脚本/截图/原hash/四件套/回滚。视频、OSS和实体手机触摸不作为本轮验收结果。
- 四件套固定在业务164f9a1，源码回滚仅对独立rehearsal执行，恢复原顶部76/底部136和层级24、原hash精确一致；当前源码/新机保留8px/层级32改动。文档跟进提交不重复发镜像。

## 接手提示词

```text
orbBounds以完整88x112浮层为尺寸，四边8px；保持归一化账号位置和拖动取消行为。
只改前端边界，不改Agent/SSE/富文本/计费。fetch main，保护其他工作树，
新机固定镜像发布持deploy.lock至浏览器边界核验，旧机不回传。
```
