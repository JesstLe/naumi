# Geeknow Pro 实测能力元数据库补全

## 结果（2026-10-15 18:58）

- 47 元数据 `ef5c200f-52e6-4b9e-9ee3-485b2a91671c`：revision **2 → 3**。
- 操作 UUID：`c517dc1a-5895-43bf-a85e-715dd6ae1895`，版本历史恰好 1 条。
- 新增 `parameterMetadata.supplierImagegenEvidence.edit=supported` 和脱敏 `supplierImagegenObservations`。
- 来源为前轮真实参考图实测 call `5c6cfef2-6b18-4d77-80cf-ca9f2a81b59f`，不是历史 `phase=edit` 标签。记录 1 张输入、3:4/1K/n=1、实际输出 896×1200、输入/输出 SHA256、HTTP200、解码完成。
- `readImagegenDefaults` 复读为 `edit=supported`，metadataRef 自动指向 revision3。
- 人工 `parameterMetadata.imagegen`、其他能力、整体 capabilityState、目录资料、价格、active 模型配置、billing 哈希均未改变；本轮供应商调用 **0**。
- 三锁已释放，无新增候选/镜像、无入口/容器/Worker 变更。该结果不代表前轮 `9e3d946` 主动配置修复已经 APPLY/VERIFY，该步骤由统一窗口线程单独负责。

## 防复发机制

1. 新增 `imagegen-observations.ts`：实测证据要求实际参考图数量大于0、成功响应、delivered=1、解码图片尺寸/字节/哈希；单独 `phase=edit` 或 HTTP200 不通过。
2. 证据按供应商实际模型保存，不外推同供应商其他模型、其他能力、精确像素或当前健康；不把整体 verified 打开。
3. 复用元数据库 revision、operation、版本历史写入，拒绝过期 revision；同一证据幂等，冲突编号拒绝。
4. 元数据中独立实测证据只作默认值兜底，管理员显式 advanced imagegen supported/unsupported/unknown 保持优先；目录刷新保留实测证据和人工数据。
5. 元数据 schema 对 `supplierImagegenEvidence` 也校验独立能力的来源、日期与白名单参数，拒绝无来源的 supported。
6. 已发布配置继续冻结；刷新元数据库不静默改写现行通道、历史任务或价格。未来受控实测可复用 `recordImagegenEditObservation`，这不是自动扫描供应商全部模型或自动收费巡检。

## 验证

集中验证：全量 TypeScript；`verify-supplier-imagegen-observations.ts` 纯函数和隔离 PostgreSQL（实际版本写入、过期冲突、幂等、目录刷新保持、人工 negative/unknown 优先）；既有 `verify-supplier-model-metadata.ts` 和 `verify-supplier-source-import.ts`。

线上 BASELINE/APPLY/VERIFY/ROLLBACK_COPY 实际运行退出0。独立副本回滚原哈希恢复，线上继续保留修订3，未回滚业务数据库。只读验收验证 active 模型与 billing 摘要未变。

## 证据与回滚

服务器私有证据：`/opt/naumi-staging/evidence/banana-metadb-20261015-r1/{snapshot,proof}`。
本地证据：`output/banana-metadb-20261015/`：MODIFIED_FILE、DIFF_FILE、VERIFICATION.txt、ROLLBACK.sh。

`ROLLBACK.sh` 只操作独立副本，不改线上。若确需撤销线上，先核对最新 revision 和字段所有权，调用 `removeImagegenEditObservation` 生成选择性修改，再走 `saveSupplierModel` 新增版本；后续实测字段有更新时拒绝覆盖。不回灌旧库或原样覆盖其他管理员的新修改。

本轮仍在独立任务分支；开工 fetch 后 origin/main 为 c2634fb。累计本地功能模块2，未触发3模块同步门槛；合并/发布前仍刷新远端。元数据实写已完成，可复用代码/全站schema门禁提交待整合，未声称全站新镜像已运行。
