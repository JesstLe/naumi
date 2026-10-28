# 重新生成进度与引用小图显示衔接

## 基线与职责

- 独立 worktree `naumi-canvas-regeneration-preview-20261028`，基线 `b6b5af3b1b2cc3d7f9519e0035623f01cb5342b4`。
- 原节点重新生成的任务状态只投影 regenerating，没有投影阶段/开始时间；节点仅显示旋转图标。新节点已有 GenerationPlaceholder，直接复用。
- 引用编辑器随节点草稿 key 重建；磁盘字节缓存不等于已解码画面缓存。原先 48px 小图读取原图，新挂载先无 src，异步鉴权及解码期间出现空白/alt 文字。

## 实现

- `canvas-client.tsx` 的 replaceNode 分支只投影阶段、开始时间、数量；在原图上方绝对定位同款进度卡。原图保持挂载，尺寸、位置、连线与供应商参数均不改。失败仍露出原图和原有重试路径；进度期间不显示去背景按钮。
- `generation-placeholder.module.css` 针对矮节点适配文字和间距，不把原节点撑成默认方形。
- 浏览器缓存只共享当前活跃、已授权且已解码的 Blob 展示租约。引用计数保证原图卸载不会撤销面板正在用的 URL；最后一份引用释放后销毁，不保存无限历史。
- `CachedImage.reuseActivePreview` 仅在引用编辑器开启。layout effect 在首帧借用同账号/epoch/工作空间的同素材画面；目标缩略图继续完整鉴权、读取和解码，准备好后接替。
- `/media` 仅质量变体视为同素材；team/enterprise 完整资源查询精确匹配。退出、换账号/空间、撤权沿原清除路径处理。冷图不显示破图和重复 alt 文本。
- 引用小图请求缩略图，下载和模型输入继续读取原图；不修改媒体权限、任务和账务模块。

## 集中验证

证据根目录：`E:/Workspace/naumi/output/canvas-regeneration-preview-20261028`。

- `node scripts/verify-canvas-regeneration-preview.mjs --source-root <before> --baseline --output-root <tests/baseline>`：真实旧 CachedImage / ImageReferenceComposer 重新挂载，在鉴权响应门闩前无已解码画面，`REPRODUCED`，预期 exit 1。不是以缺少新导出接口作复现。
- 同脚本修改态：17 项通过，exit 0。覆盖热图首帧、原显示卸载仍可引用、独立缩略图鉴权与解码接替、key 重建、换节点、冷图不串图、不显示破图 alt、空间/账号切换、退出、team 资源精确作用域、目标拒绝后不再借旧画面、focus 撤权、进度卡形状、保存阶段、未解码 Blob 禁止借用。
- `verify-canvas-regeneration-ui.cjs`：完整 Next CanvasClient 与真实点击，7 项通过。400×225、225×400、260×260、173×109 四种节点走完准备→生成→保存→完成；每阶段尺寸、坐标和真实 3 条连线不变，原图在执行期间保持挂载；失败保留原图及重试。每次点击只提交一次 fixture 任务，共 5 次，真实供应商调用和生产写入均为 0。
- UI 首轮的参考图检查曾使用空集合 every，截图复核发现该 fixture 的 canvas-add 父仅为项目锚点、不是真实引用。已改为明确 parentIds 连接，并硬断言 3 条连线和 1 张引用小图后重跑。没有放宽产品行为；最终证据为 `tests/ui-final/UI_RESULT.json`。
- 原有 `verify-canvas-image-stability.mjs` 14 项、`verify-browser-image-focus.mjs` 21 项通过，exit 0；缩放空白帧 0、项目返回追加图片请求 0、focus 追加图片下载 0；原账号/跨标签/撤权规则保持。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0，stdout/stderr 为空。真实页面与组件截图已打开检查。

## 交付与边界

- `artifacts/MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh` 保存修改态、完整差异、命令/输出/哈希和副本恢复脚本；原字节在 `before/`。副本回滚的实际退出码、恢复后的行为及 main 合并 SHA 以 VERIFICATION 为准。
- 仅热的、仍活跃的已解码素材可以无空帧交接；从未加载或已释放的冷图仍按授权结果加载，未宣称所有图片零加载。截图素材与任务 API 均为本地 fixture，不代表真实供应商出图验收。
- 本轮不发布服务器；本地验收、main 整合与上线分别记录。不接入并行编辑比例分支，不改生成参数/权限/账务，不改共享工作区的未提交内容。
