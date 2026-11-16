# 画布"作品已保存或状态已变化"横幅频发修复（2026-11-16）

## 模块与职责
- `src/lib/canvas/artwork-document.ts`：作品图读取/合并的归属地。id 级读取的缺席处理改判定。
- `src/components/canvas/canvas-client.tsx`：视频/导演结果补拉 effect 跳过已确认缺席的作品 id。

## 公共接口、依赖方向
- bind 返回新增 `absent(id):boolean`（读 Bucket.absent 活状态，无陈旧性问题）。

## 调研结论（为什么"老有这个提示条"）
- 横幅（canvas-client:2650）由 `canvasArtworkDocument.error` 驱动；id 级 merge 只要有一个请求 id 未出现在权威读取结果里，artwork-document 就抛"作品已保存或状态已变化，画布尚未同步完整…"并置 error。
- 缺席的正当来源：作品被删除/回收（服务端查询 `deleted_at IS NULL` 过滤）、本地已删（applyRead 跳过 `state.deleted`）、视频节点 `lastResultId/displayResultId`、导演 outputs、视觉引用指向已删作品。
- 复发引擎：`videoResultLoads` effect 以"不在当前 works 里"为条件补拉这些 id，仅 15s/条节流——已删结果永远不在 works 里 → 每 15s 重查一次 → 横幅反复出现。该严格校验由 10-24 读取集中化重构（93dc86c8）引入，把"缺席"误判为"同步不完整"。

## 本次实现与迁移状态
- 权威缺席=读取结果而非错误：移除 103 行严格抛错；请求 id 命中→清缺席记录，未命中→记入 `Bucket.absent`；全量读取返回的作品同样清缺席（回收站恢复后自愈）。
- 补拉 effect 过滤 `absent(id)`，已删结果不再每 15s 重查。
- 真失败路径不变：HTTP 失败（"作品同步失败"）、响应与请求不匹配、超时/网络（"作品读取失败"）仍置 error 弹横幅，"重试同步作品"按钮语义不变。
- 依赖该抛错的下游自有校验保留：如改字落地 `fresh.some(id)` 判缺后报"改字结果加载失败"，行为不变。

## 验证命令、结果及证据层级
- `tsc --noEmit`：两个改动文件 0 错误（仓库 90 条基线噪声均在未触碰文件）。
- `next lint`：无新增问题类；canvas-client:1065 既有 exhaustive-deps 警告信息多列 `canvasArtworkDocument`（该 effect 依赖数组本就刻意省略 mergeWorks 等引用型闭包，absent 为活状态读取器，无陈旧风险）。
- 证据层级：静态检查通过；横幅为本地状态驱动，修复后可在真实画布删除一个视频结果验证横幅不再复现（发布后验收）。

## 未完成项与下一步
- 47 按现行决定暂缓发布；下次发布随 main 带上。
