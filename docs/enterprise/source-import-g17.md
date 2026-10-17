# G17 正式来源迁入与核对

## 使用目的

G16 已授权读取正式库中的来源，本模块补齐从已审核导出包到正式工作流来源库的迁入。产品仍为18482原UI；本模块是部署/资料管理员工具，不把数据库凭据或导入权限交给普通员工浏览器。

## 输入与流程

1. 使用与目标版本匹配的运行包和受保护配置，显式选择工作流企业UUID。目标源文件目录必须与交付目录、其他企业目录分离。
2. `source-storage-init --enterprise UUID` 只建立空专用目录及安装/企业标记，不接管已有非空目录。
3. 受保护输入清单列出 commandId、enterpriseId、原因、confirmedTarget=true，以及1–50项绝对 payloadFile/blobRoot。沿用 enterprise-source-import-v1；不同表使用明确且不同的sourceHash，同键不同内容作为冲突，不猜测拆表键。
4. `source-plan --admin ... --input ...` 只读核对：目标安装/库/企业、原始JSON字节哈希、表/行/链接/文件数量、文件SHA与字节、现存批次和人工确认/映射/转需求数量、所需新文件及容量。不输出原表姓名、提示词、配置秘密或原文。
5. `source-import --preview-hash HASH` 重新预检。全部来源文件可验证后，以不覆盖方式落入专用文件目录；全部源表记录在同一数据库事务提交，并写原有导入审计及整次命令回执。
6. 完成后由G16原UI授权读取。人员/父关系/状态和转需求仍走原人工确认流程。

## 必须保持的约束

- 不修改源JSON、原ZIP、原附件或本机持久数据库。不导入原库的账号、人员映射、父确认、订单、验收或绩效。
- 同源重放保留目标已确认关系/映射和业务记录；已停用批次保持停用。不更新已有sourceHash的内容。
- commandId全局幂等，输入与previewHash绑定；错误企业、越界路径、符号链接、源/目标重叠、同键异内容、坏文件、旧预览均拒绝。
- 文件名仅取校验后的内容SHA；临时文件经hash验证后原子独占安装，不覆盖现存文件。已存在文件必须重新验证；磁盘余量不足先停止。
- 文件系统与DB不构成跨资源事务。失败/崩溃可能留下已校验但尚未引用的文件，保留以便幂等重试，不自动删除。数据库记录与整次回执原子提交；结果未知时使用同一commandId重试，不产生新命令猜测补偿。
- 回滚仅恢复程序；源资料采用新增与幂等，不删除已被员工使用的数据，不还原数据库。

## 验收

独立PostgreSQL及文件目录集中验证：两表原子导入、重放、停用保留、目标人工状态保留、重名源键冲突、JSON/附件变化、目标目录归属、跨企业拒绝、审计故障DB回滚、文件故障重试及原UI接口可读。真实364行/292附件包只做只读检查或拷贝到明确的隔离验收目录，原库继续0真实映射/0真实需求。

## 状态

代码与独立验收已实现，最终固定版本、回归和副本回滚以本轮 VERIFICATION.txt 为准。真实公司站点、目标企业配置和人员对应表仍需明确资料；隔离导入验收不代表公司已投产。

## 操作接口与部署位置

```powershell
# 先填写已有 runtime.json 中的 importRoots；不在此处粘贴凭据。
node services/enterprise-workflow/dist/runtime.mjs source-storage-init --config CONFIG_FILE --enterprise WORKFLOW_ENTERPRISE_UUID
node services/enterprise-workflow/dist/runtime.mjs source-plan --config CONFIG_FILE --admin ADMIN_FILE --input SOURCE_INPUT_FILE
# 审阅前一步 RUNTIME_RESULT 的企业、来源哈希、数量及现存状态后使用原 planHash。
node services/enterprise-workflow/dist/runtime.mjs source-import --config CONFIG_FILE --admin ADMIN_FILE --input SOURCE_INPUT_FILE --preview-hash PLAN_HASH
```

SOURCE_INPUT_FILE 示例为 services/enterprise-workflow/source-import.example.json；填入真实UUID与绝对路径后使用受保护权限保存。输入为既有导出器的JSON与内容哈希文件目录，不是直接上传Excel/ZIP；原导出器与原ZIP独立保留，不从 sourceHash 字符串推断ZIP已经校验。

读写工作流DB使用现有独立管理连接文件；API继续使用最小权限账号。本工具只允许已经通过运行时数据库安装/版本/企业校验的工作流库，拒绝Naumi业务库。库结构仍为12，没有改动旧迁移或增加客户分叉。

文件导入任务使用目标目录读写挂载，运行API使用同目录只读挂载；文件默认0600、目录0700，任务与运行API采用同一受控UID，不自动放宽全局权限。原始包只读挂载。初始化拒绝未知非空目录；不自动把本机旧目录改为正式目录。

总JSON上限64MiB、总源行50000、独立文件5000/10GiB，单文件沿用1GiB上限。顺序流式复制，至少保留64MiB磁盘余量，容量阈值是基础门槛而不是4核8GiB整站容量验收。

## 重放、失败与修复

`runtime-source-import`整次回执仅追加写入既有 import_audit，以commandId作主键、整包源键摘要作source_hash；每个实际源表仍有独立 import 审计。回执记录明确原因、数据库执行主体、首次计划/结果与指纹，不创建员工账号。重放返回首次结果及replayed=true，不假称重新统计当前状态。

同命令并发只提交一次。已完成命令重放时再次核对源/目标原文及文件；目标文件丢失不报虚假成功，可用新commandId重新预检后补齐原字节。目标文件已存在但损坏时停止，不覆盖；单独核对存储后处理。文件复制失败会撤销本次数据库事务；已验证但未引用文件及崩溃残留临时文件保持，不运行通用垃圾清理。

测试故障注入在最后整包审计处失败，两张新源表全部回滚；已校验原子落盘文件保持，原previewHash重试成功。已有父确认v2、显式人员绑定、独立需求与停用状态保留。真实导出包仅迁入独立验收库，验证364行/292附件/129链接原字段一致，随后清理本轮测试库与专用临时副本；原本机库未迁移。

首次真实行核对发现PostgreSQL JSONB键序与输入JSON键序不同，修正测试为结构规范化哈希比较；字段和值仍逐行全量核对，不改变源文件或数据库原文。
