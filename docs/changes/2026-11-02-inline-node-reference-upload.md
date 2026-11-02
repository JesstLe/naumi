# 行内图片引用：原图持久上传

## 模块与职责

把图片编辑器的临时 File 转为既有 `app_artworks` 与私有媒体对象，供引用文档使用真实节点身份。不是生成任务，不调用供应商，不写积分或重放任务。

## 接口、依赖与事务

- 客户端 `uploadCanvasPromptReference(file, {parentId, projectKey, workspace, ownerScope, isCurrent, request?})` 返回 `{id, image, title}`。
- `POST /api/canvas/image-reference-upload` 接收 multipart：`image/title/operationId/projectKey/parentId` 及浏览器 `thumbnail/preview`。
- 沿用 `prepareImageUploads(..., {preserveOriginal:true})`、`uploadFormData`、`saveCanvasOriginal`、`addArtworksTx`，保留 64 MiB / 6400 万像素原图职责，不改为视频上传的 20 MiB 图片限额。
- `uploadFormData` 仅增加可选第六参数 `{headers, request}`。原调用兼容；已捕获的认证、workspace、project 不在异步准备后重新推导。所有发送前执行 owner/context fence。
- 新路由使用原生登录、同站检查、`withCreationRoute`，复用图片提示词模块的规范项目与父节点授权，不修改旧上传路由。
- 复用 `app_canvas_local_edits` 操作台账，指纹包含上传命名空间、owner、scope、project、parent、title、原文件 SHA256/字节数/实际格式与尺寸。先短事务预留固定作品身份，释放连接后保存原图，最终短事务再次核对父节点与项目，创建作品并登记不可变归属。
- 同 operation 不同内容返回 409；原作品已删除返回 410，不恢复已删除内容。ACK 未知时重试原 operation。存储 I/O 不持有数据库事务连接。

## 客户端行为

- 显示用 File 留在当前对象生命周期；持久层使用真实作品 ID。
- owner/workspace/project/parent 和原文件内容生成稳定操作编号，支持网络中断后重选同文件恢复；sessionStorage 仅保存不透明操作编号，不保存原文件或认证头。
- 同 File 同作用域并发复用一个 Promise；成功回执先保存，再检查当前页面，避免已提交回执因切页被遗失。
- 不降原图质量；浏览器预览由原有逻辑生成。

## 验证

`node scripts/verify-inline-reference-upload-client.cjs`

```text
INLINE_REFERENCE_UPLOAD_CLIENT=PASS checks=14 original_bytes=preserved large21MiB=accepted unknown_ack=same_operation suppliers=0 network=0
```

Exit 0。实际 helper 与 transport；浏览器解码、认证及 HTTP/XHR 端口为明确 fixture。

TypeScript 使用项目编译选项、实际传递依赖核对本模块四个改动源码，`UPLOAD_CHANGED_SOURCE_ERRORS=0`、exit 0；该结果不是全项目 tsc，通过项未替代父完整检查。

`node scripts/verify-inline-reference-upload-server.cjs`

```text
INLINE_REFERENCE_UPLOAD_SERVER=PASS checks=17 REAL_PG=1 ACTUAL_ROUTE=1 ORIGINAL_HASH=PRESERVED DUPLICATE_ROWS=0 SUPPLIERS=0
INLINE_REFERENCE_UPLOAD_FIXTURE_CLEANUP=PASS containers=0
```

Exit 0。实际 route、原生签名 cookie／身份解析、真实原生数据库 writer、共享规范节点授权、Sharp 与私有本地对象存储。每轮仅一个自有 256 MiB / 1 CPU PostgreSQL，随机回环端口、唯一 label、真实 `SELECT 1` 就绪，并按完整容器 ID 核对 label 后在 finally 停止删除。

17 项覆盖：未登录、跨站、正常持久上传／原始 SHA、重试一个作品、四并发一个 ID、同 operation 改标题／改文件冲突、跨 owner、项目别名及企业 B 父节点、locked、删除后重试不复活、非法图片、21 MiB 原文件逐字节一致、缺大图预览拒绝、正式素材归属。未调用真实供应商，也没有生成或积分写入。

测试首次使用仅 `tsx/cjs` 时，Node 24 动态 import 进入原生 TS stripping，导致 `@/lib` 解析失败，未执行业务。脚手架改为子进程 `--no-experimental-strip-types --import tsx --conditions=react-server` 后完成；该次 fixture 同样清理。不是产品功能失败。

输出 `output/inline-reference-upload/SERVER_RESULT.json` 与 `server.stdout.txt` 已重开，记录原图 SHA256 为 `336234ea6efa2f8d42aed83b18dd74fce5b8979eff48cc7044f9d93b70af4908`。保留本地媒体作为证据；无运行 PG 或任务。

基线只读检查：

```text
node scripts/verify-inline-reference-upload-client.cjs C:/Users/13357/.t3/worktrees/naumi/codex-capacity-audit-wave2-20261029
INLINE_REFERENCE_UPLOAD_BASELINE=MISSING_HELPER
exit=42
```

新 helper 不存在是准确基线；副本回滚与父集成验证由父任务统一封包。

## 边界与下一步

- 新上传路由走 App multipart；没有切换云直传。原云直传与其他上传入口保持原状。
- 只接受已保存、已授权的真实父图片节点；`pend-*` 临时占位不是服务端作品。
- 原图已存但最终登记失败时，同 operation 保持原对象身份供重试；没有新增后台清理服务。
- 完整图片引用 UI、文档保存/复制/分享、实际浏览器联调及主线交付由父任务集中完成；103 和公开更新说明继续暂停。
