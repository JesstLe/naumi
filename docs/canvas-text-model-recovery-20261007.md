# 文字节点默认模型恢复（2026-10-07）

## 线上结果

- 生产应用镜像保持 `d5a80fa5db86bad28c0a5472119ca9a6218bfbb4`，没有重启应用或改动 NAS。
- 通过既有 `/api/admin/bi/model-config` 草稿、验证和 Router 发布链路，将模型配置版本 **1 → 2**，发布状态 `applied`，Router 摘要已核对。
- 公开模型仍为 `gpt6Astra`；实际模型仍为 `hy4-preview`。
- 该公开模型改为可见，目标恢复为已经配置的 `platform-agent:7c1e5ed7132de672`。它使用文字节点接入配置中心之前的 `AGENT_BASE_URL` / `AGENT_API_KEY` 通道。
- 图片模型、供应商记录、真实上游模型记录、用途绑定、用户价格、计费版本 1 均保持不变；`STORAGE_DRIVER=s3`。

## 排查证据

1. `/api/models?feature=canvas.text-generate` 返回默认 `gpt6Astra`，但 `models=[]`。
2. `/api/text-models` 同样为空。所有文字公开模型在配置版本 1 中都是 `visible=false`。
3. 旧白名单写真实模型 ID，假名映射写 `公开ID=真实ID`；导入代码却按假名匹配真实 ID 白名单，导致全隐藏。
4. 另外，默认文字模型被导入到图片主通道的供应商账户。其真实供应商目录没有 `hy4-preview`，直接只改可见性仍会使用错误账户。
5. 原 Agent 通道目录实际返回 169 个模型，其中包含 `hy4-preview`；此次只做模型目录查询，没有提交收费生成。

## 实现

- `scripts/repair-canvas-text-model.mjs`：在生产容器内使用服务端已有管理认证，通过正式后台接口发布，不直接修改不可变版本。检查并保存原版本及摘要，保护未发布草稿和明确禁用的功能；恢复参数仅允许指定已经配置的 Agent 通道，真实模型 ID 必须一致。
- `src/lib/model-config/bootstrap.ts`：后续首次导入同时兼容真实 ID / 公开 ID 白名单；默认文字模型与 Agent 模型相同时，保留原 Agent 账户和端点。这一导入修复已在本地验证，当前线上通过配置版本修复，无需为一次性导入逻辑重新启动应用；代码随后续镜像发布进入生产。
- `scripts/verify-text-model-recovery.mjs`：复现空目录/拒绝执行，验证恢复后的模型目录、实际执行解析、重复恢复、禁用保护、内部视觉模型隐藏、原 Agent 账户保留与副本回滚。

## 操作

在维护窗口需要重复检查时，使用已安装到现行容器中的脚本：

```bash
docker exec -e NAUMI_TEXT_RECOVERY_UPSTREAM=platform-agent:7c1e5ed7132de672 \
  naumi-app-1 node scripts/repair-canvas-text-model.mjs --verify
```

恢复脚本的检查、发布模式分别为 `--inspect`、`--apply`。发布失败/待核对时，保存原操作 ID 并在现有后台恢复该发布；不要创建新发布掩盖未知结果。不要在管理员还有未发布草稿时直接覆盖。

生产回滚使用后台版本回滚流程，而非覆盖旧版本记录：

```bash
docker exec naumi-app-1 node scripts/repair-canvas-text-model.mjs --rollback 1
```

注意：回滚到版本 1 会恢复原隐藏目录及旧文字供应商目标，文字节点再次不可选择该模型。此次只在另一份副本上演练回滚，没有把线上恢复配置撤销。

## 验收

- 本地基线、修改和副本回滚测试通过（退出码 0）；测试只调用 fake credential reader，没有访问收费模型接口。
- 模型批量配置回归通过。
- 使用已有隔离 PostgreSQL 验证模型配置、事务回滚、版本保留、权限/凭据隔离，通过。
- 线上两个画布文字功能目录均包含原默认模型，`/api/text-models` 默认相同。
- 生产浏览器打开已有文字节点：默认 `gpt6Astra`，菜单包含 `gpt6Astra`；未修改文字内容，未点击生成。
- 线上健康 200、数据库健康、非管理员模型管理 API 404；Router 确认与数据库发布一致。
- 真实收费生成未测试，因此不把上游文本生成成功当作本轮已验证结果。

## 备份与证据

生产备份：`/opt/naumi/backups/text-model-recovery-20261007-163015`（数据库自定义格式备份、配置、Compose、SHA256）。

证据目录：`E:\Workspace\naumi\output\text-model-recovery-20261007`。原配置摘要 `e095a70baccd3ce4e67c9664e60e25f7f1763b98b7ca7279117a5fbeb25b6578`；新配置摘要 `354ad66ad5714d816d8eef1852a7264385b3976a1569e1844b81b920ce0ed2a5`。

用户下一步：刷新当前画布页面，再打开文字节点。前端内存中旧的空模型列表会在刷新后重新读取。

## 末尾连通性复核

恢复发布、Router 回执、目录查询、凭据一致性和生产浏览器菜单验收均已成功。但本轮结束前再次请求公网 `/api/health` 和 `/api/text-models` 出现超时（curl 退出 28、HTTP 000），后续有界 SSH 检查同样超时（退出 255）。没有据此重启服务器或撤销已确认的配置发布。最新实时健康状态待连通后复核，不能把较早的 HTTP 200 当作末尾实时可达证明。
