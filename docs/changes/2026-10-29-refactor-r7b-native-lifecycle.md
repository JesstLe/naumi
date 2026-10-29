# R7B：原生节点生命周期与工作流文档

基线 `03a5614005c755d281a31ce52effc242fbcb886f`，主线固定 `43d469498c111223408238c505c5febf76482a78`（25 提交）。独立目录/分支保持不变，整体重构目标 ACTIVE。完整原始字节直接来自已封版 R7A MODIFIED_FILE.tar，避免 Git archive 换行归一化与实际回滚字节不一致。

## 本次职责

- 六种已有原生节点（video/director/character/scene/audio/timeline）的共同记录字段、删除/visibility 传播由有限、类型化的 native-node-records / native-node-lifecycle / native-document-lifecycle 承担，不是插件注册平台，没有复制任务、计费或历史引擎。
- 共享服务只拥有共同生命周期；各 kind payload、引用验证、渲染/任务受理、版本 CAS 仍在原 repository/service。表名是固定内部 adapter，不从请求拼接。
- copy/delete/project-delete/history 返回同一事务读取的实际 native receipt；恢复/重试返回当前 revision/deletedAt，而不是浏览器猜 revision+1 或用旧快照覆盖新编辑。owner→graph 锁顺序保留，scope 检查在同一连接执行。
- history 的单种新增和混合新增界面转换收敛到纯函数，按所有 kind 的实际 ID 检查；audio-only undo 不应把仍含 timeline 的项目误置为空白。
- workflow fill 的原 before/after pixel pair 和原 operation 在既有 app_canvas_workflow_asset_ops 上提交；像素准备/上传不持 DB 事务，最终重新检查 live lock、placeholder、scope 与原回执。每次准备独占随机媒体 key；输家只删自己的 key；提交 acknowledgement 不明保留可能已发布字节。
- workflow-document 拥有账号/工作空间 manifests 读取状态、原补图续接、已知 ID 同步，React hook 仅订阅。读取失败不变空成功；旧读取不覆盖本地刚接受 manifest，补图/撤销只换像素字段，保留当前标题、位置和连线。

## 主线相邻整合

企业站点 policy/专用成员/历史/健康和协作模块随本切片整合；五处冲突按既有 pool/schema/access/context/HTTP owner 迁移，不把 db.ts/creation-context.ts 旧单体装回来。新增 db/connection 只导出原 platform pool，避免两个 pool singleton。站点管理员、岗位 workflow_permissions、历史归属与读取授权保留在对应 owner。原 1/2/3 stages 和 rejected hunks 留在 output/refactor-r7b-20261029。

## 验证与未完成

当前是实现中，首次完整 tsc 抓出三项异构集合类型关联问题，正在按真实类型修正，未降低 ts/lint 规则。完整模块完成后集中执行真实 handler/PG、客户端、原有 history/native-kind/企业站点回归；固定源码、构建与四产物以随后 VERIFICATION/DELIVERY 为准。

整体完整镜像/应用级浏览器、性能/INP/容量及有效远端 required CI/最终退出仍待；R6Z MEDIA_STATE_WRITE_FAILED 根因仍 OPEN。六种 hook 本身账号/workspace 读取与 epoch 生命周期的进一步统一仍需验证，不能只凭本轮 typed adapter 宣称所有 native store 作用域已经闭合。47 HOLD、不发布、不合 main。
