# 图片节点原位重生成

## 目标与观察
- 选中已有图片、Dock 显示该图提示词时，主操作更新当前节点，不默认新建下游节点。
- 用户现有 Chrome 的稿定模板已观察到图片选中、原始提示词及上游素材引用；没有提交稿定收费生成。
- 基线 `87695ea3b8f8fb07e5bc0b70f880dfa5dd0badf5`（以验收记录中的 git rev-parse 为准）；独立 `codex/canvas-regenerate-node-20261028`。

## 模块与职责
- Canvas 图片版本模块拥有显示版本、历史、并发修订及选择规则。
- Imagegen 保留原有冻结请求、付费提交与持久任务；仅在结果收尾调用版本挂载。
- 作品原始生成媒体不变，节点使用独立显示快照；节点 ID、位置、大小、标题、连线与原始回执保留。
- Dock 主操作原位重生成；明确的三视图、扩图、拉线仍派生。当前节点不再被自动作为自己的编辑底图。

## 实现与迁移
- 已实现：原位目标合同、显示版本事务、历史选择、失败恢复与 UI。
- 版本选择复用 Canvas history 的操作 ID、事务和撤销/重做。
- 多张结果留在同节点历史；旧任务迟到不覆盖新版本；失败保留旧图。

## 验证与发布
- `node scripts/verify-canvas-regeneration.cjs . modified`：真实入口函数抽取执行，`MODIFIED=PASS sameNode=true nodes=1 explicitDerivation=preserved`。
- `node --conditions react-server --import tsx scripts/verify-canvas-image-versions.ts`：独立 PostgreSQL，16 项通过；覆盖多版本、修订 CAS/ABA、并发完成、锁定/删除、归属、历史与原始媒体、无新增扣费。
- `node --conditions react-server --import tsx scripts/verify-canvas-regeneration-pipeline.ts`：实际 plan→durable parent/child→本地 HTTP 供应商→存储→显示版本→兼容轮询回执→结算通过；成功 1 个计费操作、未知受理重查 0 次额外提交。模拟供应商 2 次，真实供应商 0 次。
- 用户现有 Chrome 中打开本地真实 Next Canvas：节点 2→2、连线 1→1，ID/位置/尺寸不变；等待态保留原图，历史/撤销/重做、刷新、失败保图、原任务恢复、390px 历史面板通过。共 3 次 fixture 提交，检查/恢复没有增加提交，位置写入 0。
- UI 截图检查修正了主按钮被共享 footer 固定为 36px 导致文字折行的问题；当前按钮 95px、nowrap。无参考图时收紧上传入口，提示词保留可见空间。
- `tsc --noEmit` exit 0；定向 lint exit 0（现有 Canvas Hook 警告单独保留）。浏览器 fixture 注入项目 bootstrap 导致开发态 hydration 属性警告，不作为产品运行异常或零控制台错误证明。
- 独立本地 fixture，不写生产数据库、不触发付费供应商；47 HOLD 保持。

## 数据、接口与恢复边界
- `canvasTarget={nodeId,expectedImage,expectedRevision}` 只允许 Canvas 普通图片任务；受理前校验本人、项目/企业空间、锁定与修订。已有 operationId 先复用回执，再考虑新提交校验。
- `app_artworks.canvas_image_version/canvas_image_revision` 只维护节点当前显示；原始 `image_url/prompt` 与不可变结果作品不覆盖。原始作品读取提供 `original` 选项，生成回执使用原始媒体。
- `app_canvas_image_versions` 保存初始/生成版本与操作收尾回执；history 复用 owner 事务锁、版本 CAS 与 operationId。最近版本读取始终包含原图和当前版。
- 创作素材记录使用 `storage_snapshot` 固定当次真实输入媒体，历史输出仍指向原生成文件，避免节点换图改写历史证据。
- 普通 completed-child 快速收尾对带 canvasTarget 的请求交回持久执行器，存储恢复同样执行版本挂载；浏览器恢复入口刷新原节点而非产物 ID。
- 同任务重放不重置用户后续选择；迟到/锁定结果保留历史，删除节点不复活。历史选择不新建任务、不冻结或扣除积分。

## Git 与发布
- 完成后普通 merge 整合 main；完整 commit、差异、源文件哈希及副本回滚证据见本地 `output/canvas-regenerate-node-20261028/VERIFICATION.txt`。
- 本轮不变更共享 `canvas-action-menu` 和其他 checkout 未提交内容，不发布 47，不操作生产数据库/配置/媒体。
- 本轮证据层级：源代码 + 独立 PostgreSQL + 本地 HTTP 供应商 + 实际 Chrome 组件交互；不是生产真实生图或上线验收。
