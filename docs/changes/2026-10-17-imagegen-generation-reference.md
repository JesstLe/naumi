# 主线整合：生成用途沿用唯一参考画幅

## 问题与修复

将同事 7fb4ff9 合入画布视频分支后，固定整合点 54054bf 的独立增量复核发现一处新回归：mode=generate、useCase=photorealistic-natural、750×1000 reference 与 insert 各一张、ratio=auto，会在 /api/imagegen/plan 被误报为多参考歧义。旧 helper 仅允许 compositing/product-mockup/ads-marketing 使用参考画幅，把其余所有用途都当成必须保留 edit-target；这与用途目录中的生成分类不一致。

先在未修改 helper 时加入真实 plan 回归，确实复现拒绝；随后改用既有 imagegenUseCase 目录：只有 mode=edit 且非 compositing 的明确编辑用途，或有 mask 时，优先保留目标画布。所有生成分类均可沿用唯一 reference，不按上传顺序选 insert。多个参考仍拒绝歧义，显式比例/像素、单图、抠图/本地处理、旧已接受任务与原请求 fingerprint 保持既有语义。不增加 UI、API 字段或文案。

## 集中验证

- 实际 plan + generation-core/FormData 回归 68 项：原 24 项及目录全部 11 个生成分类的 reference+insert、顺序交换、模型/报价/冻结步骤比例与原始 fingerprint。外部调用 0。
- 真实 POST/Sharp/扩图矩阵 55 项、重复面板移除/命名函数/引用检查 210 项通过；全量 tsc 通过。
- 独立 256 MiB tmpfs PostgreSQL16、loopback 随机端口及模拟供应商：扩展为 24 项。真实 /api/imagegen/plan POST 验证写实摄影/界面样机/风格概念图三类均 200、3:4 冻结步骤、原始 fingerprint；预览不新增供应商调用。原 legacy 持久任务与扩图/未知受理/重入不重发仍通过，总计模拟 POST3、外部付费0。每次自建独立容器，结束按随机 fixture label 核验后删除，不使用共享或生产数据库。

整合版原先 14 项 PG/API 已通过，修复后 24 项包含该组并新增回归；不是把前轮分支结果直接算作本轮通过。初始完整业务增量复核发现上述 P2；修复复核结果另以同目录证据为准。原始日志、源码摘要、两个审查与回归证据在忽略目录 output/canvas-video-fusion-20261013/checkpoint-d/main-sync-20261017/。

## 候选与发布边界

54054bf 的普通 Linux 镜像已经构建，随后因本回归被标记为 superseded。它不是修复后的发布候选；只对以该 SHA 归档目录为 cwd、含该 SOURCE_COMMIT 和当前构建日志 CID 的本任务 Docker build client 发送 SIGINT，原会话已终止，没有停止生产或删除固定运行镜像。未完成的三界面构建不记为通过。下一固定源码包含本修复后重新构建与集中验收。

此前 e997 的 v4 发布包/回滚包/镜像归档已在103私有目录完整暂存，但不包含本次主线整合或修复。保留为原封候选参考，不用它冒充最新版。当前103仍旧UI8af8ee6/核心c05a923；没有新业务发布或回收内存。容量处理问题仍等待用户选择，答复前不停止无入口旧UI。
