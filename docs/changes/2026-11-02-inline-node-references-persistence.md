# 节点内引用：图片提示词持久化与复制／分享映射

## 基线与模块职责

- 基线：`2b990949421214802ae900e34f2baf6869f78443`，父任务独立工作树 `E:/Workspace/naumi-inline-node-references-20261102`。
- `image-prompt-schema.ts`：浏览器／服务端共用的可编辑文档合同及纯身份映射，不依赖 React、数据库或供应商。
- `image-prompt-repository.ts`：拥有图片提示词文档、revision 和 operation 回执表；事务内只复用调用方 client，不持有媒体流或新增连接池。
- `image-prompt-service.ts`：正式图片节点／实际项目／企业作用域授权，原子 CAS 与 operationId 指纹幂等；导出窄 `authorizeImagePromptNodeTx` 给原图参考上传用例复用。
- `image-prompts/route.ts`：实际登录、同站写入口、受限 JSON 和 HTTP 错误映射；GET 使用 receipt-aware creation scope，读取也核验工作空间。
- 原 `node-copy` 与 `canvas-sharing` 调用图片文档公开接口；画布复制、企业快照/副本继续拥有自己的原事务。

## 公共合同

```ts
type ImagePromptDocument = {
  version: 1;
  prompt: string;
  bindings: { key: `node:${string}`; number: number; role: ReferenceRole }[];
  activeKeys: string[];
  additionalKeys: string[]; // default [], subset of activeKeys
  hiddenReferenceIds: string[];
};
type ImagePromptState = { document: ImagePromptDocument | null; revision: number };
```

- GET `/api/canvas/image-prompts?projectKey=…&nodeId=…` 返回 `ImagePromptState`。
- POST 同路径接收 `{projectKey,nodeId,expectedRevision,operationId,document}`，返回同形。
- `authorizeImagePromptNodeTx(tx, actor, projectKey, nodeId, {write?: boolean})` 返回已核验的正式图片行，含 `group_id` / `batch_id`。调用方在借连接前初始化 `ensureImagePromptSchema()`。
- `remapImagePromptDocument(document,idMap,{preserveExternal?,detached?})` 保持图号、用途与正文不变；重映射稳定节点键。跨项目未复制来源保持显式失效，不替换成新序号。

## 本次实现与迁移

1. 原图片 `Artwork.prompt` 是历史生成记录，保持原样；新编辑正文和引用清单由独立 canvas 文档拥有。
2. 节点 ID 格式／原有图号编译与供应商请求协议保持。已删除引用绑定可继续保存为墓碑；仅 `activeKeys` 需要可访问真实图片，草稿中的失效标记不被当成生成提交强制拒绝。
3. 权限使用作品实际 group／suite-batch／旧祖先项目链及单对象和不可变 output-link 证据，不允许 `tree:artwork-id` 别名掩盖已有企业归属。写入口检查节点 locked；鉴权时对 creation context 使用隔离副本，不改动调用方目标项目。
4. 使用原 account → graph advisory lock 顺序，写入文档和幂等回执在同事务完成。一个 revision 的两次并发写只有一个成功；同 operationId 同内容返回原回执，不重写文档；异内容 409。回执只保存 revision，不重复保存整份正文；按 (email,node_id,created_at,operation_id) 索引保留最近 64 笔，每次最多删除 64 笔超窗回执。已超出回执窗口的旧请求仍携带旧 expectedRevision，返回 CAS 冲突而不是覆盖新正文。
5. 普通复制重用原 `idMap`，新文档 revision 从 1 开始；当前同项目保留未选中的真实输入。`detached:true` 仅允许单图片，保留“标题＋副本”、无父连线和 +40 位置偏移；引用改为显式 additionalKeys 继续有效。
6. 企业分享快照冻结图片文档，活引用进入依赖闭包；显式单作品分享同样带完整引用素材。批准后文档键全部映射到接收者副本，未复用作者的旧任务／operationId。文档变化影响 snapshot digest，最终复核会观察到变化。
7. schema 扩展由现有初始化完成；旧图片没有文档时返回 `{document:null,revision:0}`。旧本地草稿如何迁移与自动保存由父 `image-prompt-client`/hook负责。

## 集中验证

命令：

```powershell
node scripts/verify-inline-image-prompt-persistence.cjs
```

实际字面结果（exit 0）：

```text
INLINE_IMAGE_PROMPT_PERSISTENCE=PASS checks=24 REAL_PG=1 ACTUAL_ROUTES=1 COPY_SHARE=1 SUPPLIERS=0
INLINE_IMAGE_PROMPT_FIXTURE_CLEANUP=PASS containers=0
```

输入：一个独占 256 MiB／1 CPU PostgreSQL，随机回环端口、唯一 label、TCP `SELECT 1` 就绪；原生签名用户 cookie，真实 API 导出、原生作品和复制模块、真实企业成员/共享领域、私有本地存储。

24 组覆盖：初始空文档、保存重载、丢 ACK 后同身份恢复、指纹/CAS冲突、同 revision 并发、同名改名、删除墓碑、移除保号、无效活引用、其他账号／规范项目别名、已有 group/batch 跨企业、locked、临时 upload／无实体 pend 拒绝、原生复制、detached、跨项目失效、旧无 group 根、真实企业分享闭包、显式单作品、文档 digest 变化、源删除后副本素材可读、历史 prompt 与供应商零调用、67 次自动保存后保留 64 笔紧凑回执／旧窗 retry 409 且正文保持。

完整命令、stdout/stderr、exit、fixture ID/label：`output/inline-image-prompt-persistence/RUN.json`；逐组结果：`RESULT.json`。唯一 PG 在 finally 核对完整 ID 和 label 后停止移除，包含匿名卷，剩余实例 0。

回执压缩／有界回收追加后，父已使用同一专属脚本完整复跑 24 组通过，包含最近 64 笔恢复与旧窗 CAS 冲突；最终结果以更新后的 RUN.json / RESULT.json 为准。

源整合全项目 TypeScript 运行一次时 stdout/stderr 空、exit 0；之后的父整体构建和最终完整类型检查以父总记录为准。

## 已知边界与父验收

- 未有正式图片记录的本地 pend 继续使用原浏览器草稿；本 API 不凭陌生 nodeId 伪造图片。正式生成／上传形成节点后由父接线迁移。
- `upload:*` 是临时 File 身份，不写入服务端文档；父上传模块先保存原图并获得真实素材 ID，再在保持图号的前提下升级为 `node:*`。
- 本次验证为真实业务模块与数据库/HTTP handler，不等同于完整 Next 线上验收或容量结论。实际行内 editor、保存刷新与完整 Canvas 浏览器 E2E 由父与 UI 模块集中验收。
- 本子任务没有提交／推送、部署或公开说明；由父统一生成原/改/副本回滚产物、普通合入 main。103 与公开说明仍暂停。
