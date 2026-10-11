# Agent 生命周期、纯文本会话与创作工具覆盖

## 交付边界与 Git 基线

- 本任务仅开发、隔离验收、提交与推送任务分支。**用户明确：上线全部由另一个 Agent 执行；本轮未上线、未改线上配置、未连接旧机。**
- 专属工作树 `C:\Users\13357\.codex\worktrees\naumi-orb-research\naumi`，分支 `codex/agent-lifecycle-tool-coverage`。
- 开工刷新并快进到 `origin/main` 的 `4f251af53224aef11866b5835b52daa6b8ce037c`；提交前再次 fetch，远端基线未新增提交。共享 checkout 未切分支或覆盖。
- 本轮不需要新增数据库表；发布 Agent 合入任务提交后按其流程构建与发布，保留当时最新线上基线，不从本轮测试库复制任何数据。

## 根因与实现

1. 原画布历史必须选中图片才使用数据库 loader；改为按项目读取，同项目不同图片的旧历史一起列出，始终使用真实 API，读取失败不显示为“空历史”。
2. **会话不是图片的附属物。** `anchorId` 是可选参考；未选图、空画布均可纯文本对话、保存、恢复、继续、停止、改名、删除。新会话按项目生成 `cv-` 前缀；历史旧图片前缀兼容本人项目验证，不改变历史 ID。
3. 选择/切换图片只更新下一轮参考，不清空对话；参考弹层支持移除图片转纯文本。恢复文本历史主动清理旧图片选择。项目切换和卸载仍取消当前连接。
4. 文字模型目录、工具范围、管理/批量验证、报价和执行不再无条件要求视觉能力；**实际带参考图时仍检查并只选视觉通道**，不把不支持视觉的模型当作可读图模型。
5. runtime 重启或换模型均优先读取服务端规范历史，保留 assistant 角色、完整文本和工具事件。工作台前端旧副本不覆盖已有服务端会话；工作台查询在 SQL LIMIT 前排除画布历史。
6. SSE open 时保存服务端 ID；画布独立记录 completed/stopped/failed 终态，done 前等待历史持久化。中断前未写入底座的用户消息按 canvas_turn 恢复。小球恢复停止状态不误判完成。
7. 改名/删除使用内联输入/二次确认，不依赖内置浏览器不支持的 window.prompt；异步失败显示错误，正在执行时禁止改名/删除，删除会话保留原作品。
8. 创建工具包装复用站内 API、上传与鉴权、既有原计费及原产物挂载，不新建调度器和额外扣费。补 discover 工具/schema/confirmation，新工具 scoped timeout；错误/取消不自动重试收费 POST。图生图显式 image_urls；缺图改色拒绝而非文生图，局部编辑必须用户选区。

## 生命周期验收矩阵

| 场景 | 状态与证据 |
|---|---|
| 未选图/空画布文本对话 | 隔离真实 runtime + 本地 HTTP 模型 + PostgreSQL 通过；非视觉文字模型成功，消息无图片部分 |
| 历史列表、刷新、跨节点 | 本地实际浏览器未选图列表可见3条历史，项目隔离和跨账号读取隔离通过 |
| 重启恢复、继续、改名、删除 | PostgreSQL 隔离通过；浏览器刷新后继续保留 user/assistant/user，内联改名成功；删除二次确认取消通过，真正删除在隔离 API 中通过 |
| 停止与失败恢复 | 执行受理后停止，历史 stopped 与小球 Stopped；错误/中断用户消息可恢复；已有结果保留 |
| 老图片历史 | 浏览器 Markdown 和结果卡片恢复，旧会话可移除参考继续文本，既有作品不重新生成 |
| 真工具调度、一次收费、报价确认 | runtime 实际调用 recolor_product，模拟供应商产物挂回父节点/项目；隔离账本仅一次4积分；同轮自确认被拒，下一轮确认通过 |
| 入口一致 | 工作台与画布共享 createNaumiTools；小球是画布入口与状态展示，独立调度器=0 |

## 创作目录覆盖（26项=25项执行能力+1个编排入口）

下面各可执行项均注册到工作台/画布 Agent 同一工具集，小球复用画布 Agent。登记与 adapter 测试通过不等于所有付费供应商已逐项出图。

| 创作项 | Agent 工具 |
|---|---|
| 竞品工作台 | `list_competitor_items`, `import_competitor_image`, `analyze_competitor`, `replicate_competitor`, `edit_competitor` |
| AI 生图 | `generate_image` |
| 视频工作台 | `generate_video`, `get_video_task`, `list_video_models`, `extend_video`, `edit_video` |
| 一键套图 | `generate_suite` |
| Agent 任务 | Agent 编排入口，不递归调用自己 |
| A+ 详情页 | `generate_aplus`, `review_aplus_source`, `continue_aplus_generation` |
| 模切线转 3D | `generate_packaging_3d` |
| 爆款复刻 | `replicate_hot` |
| 图裂变 | `generate_variations` |
| 产品精修 | `retouch_product` |
| AI 抠图 | `cutout_image` |
| 抠头像 | `cutout_avatar` |
| 产品换色 | `recolor_product` |
| AI 变清晰 | `upscale_image` |
| 局部改图 | `inpaint_image` |
| 风格转换 | `transfer_style` |
| AI 融图 | `fuse_images` |
| 去水印 | `remove_watermark` |
| 服装上身 | `try_on_clothing` |
| 服装提取 | `extract_garment` |
| 3D 服装图 | `generate_garment_3d` |
| 服装去皱 | `dewrinkle_clothing` |
| 标题生成 | `generate_titles` |
| 印花提取 | `extract_print` |
| 侵权检测 | `check_image_ip` |
| 印刷图 | `prepare_print_file` |

## 验收层级与证据

证据目录：`C:\Users\13357\.codex\worktrees\naumi-orb-research\naumi\output\agent-lifecycle-tool-coverage-20261011`。

- `lifecycle-test.log`：真实本地 PostgreSQL、原 runtime/计费/历史/工具代码；文字/图像供应商为本地 fixture，外部付费调用0。
- `coverage-test.log` / `tool-coverage.json`：26项登记、25项可执行映射、40次 HTTP adapter 调用；新增13通用工具双入口、竞品选区/版本、标题、裂变融合、POST不重试、取消/空产物/缺参考图拦截通过。并未逐一实测所有旧工具或25个真实供应商。
- `browser-acceptance.txt` / `browser-model.log`：本地 IAB 实际点击、Enter发送、刷新恢复继续、内联改名、停止、移除图参考、旧产物卡片；模型仅本地 fixture。`text-chat.png` / `project-history.png` / `history-restored.png` 为浅色截图。
- 类型检查通过；本机 Next 14.2.35 生产构建成功（93静态页面）；保留原 img 性能提示，不改无关组件。模型 scope/batch、富文本247项、小球126项回归通过。
- `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`：原始 SHA256、当前修改包与补丁、命令/输入/输出/退出码、独立副本回滚。源码回滚演练，不是线上回滚。当前源码保持新功能。

## 仍需发布 Agent / 上游验收

- **本轮未上线**。发布 Agent 刷新 origin/main、选择性合入本任务分支，集中验收后负责发布。不得把当前分支直接当作正在运行版本。
- 各实际供应商模型、视频供应商、ComfyUI/外部工具依赖等按现有配置决定可用性。视频/OSS不在本轮已通过范围；25项上游实际出图需发布 Agent 按真实配置另验收，不以 fixture 冒充。
- 历史现有列表50条、项目艺术品扫描1000条、runtime轨迹400事件上限仍保留；未做无限分页。断开连接按既有语义中止，不是脱离连接永久后台运行器。
- 旧工具所有超时闭包未全改，本輪新增包装使用 scoped signal；真实手机触摸未验收。

## 发布 Agent 可复用接手提示词

```text
仅接手 codex/agent-lifecycle-tool-coverage 的已提交代码；先刷新 origin/main，确认当前运行基线不倒退，再整合并集中验收。
阅读 docs/changes/2026-10-11-agent-lifecycle-tool-coverage.md。
重点验证：未选图可文本对话；刷新后的项目历史恢复/继续/停止/改名/删除；旧图片历史及产物；图片可移除/切换而不新建会话；非视觉模型纯文本可用但携图拒绝；25项工具均进入三个入口同一runtime。
按真实配置核验供应商，不把40次adapter fixture 当作25项真实供应商已成功；收费调用先核报价、一次账本与已有产物，不重复提交。
本任务开发者未部署；上线由你执行，保留数据库/媒体/管理员配置，按最新部署约定与锁核验固定版本和回滚。不要复制本轮测试库到线上。
```
