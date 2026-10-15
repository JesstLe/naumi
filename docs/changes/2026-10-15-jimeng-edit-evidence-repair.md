# 即梦参考图编辑被新图像计划校验误拦

## 现象与根因

用户在画布选择即梦5.0 Pro、普通/标准、自适应1K、1张参考图，提示词“换成猫”，页面报“所选模型没有已核实支持本次参数的通道”。

103实际模型配置v111中，local-jimeng-50-pro已有edit=true，但全模型verified=false，且没有capabilities.imagegen.edit。旧目录仍展示该模型支持编辑，新plan经publishedImagegenCapabilities将编辑解释为unknown，simulateModel排除原因精确为IMAGEGEN_EDIT_UNSUPPORTED。此时模型目录和计划校验的历史能力表示不一致。

2026-10-12接入记录已保存两台单参考图换色、2048×2048结果核验通过；未把1.5k、4k、10参考图和其他参数扩大为实测。本次仅在该确切即梦来源补录这项编辑证据。没有把全模型verified改为true，没有将未知蒙版/透明/其他原生参数放行，没有换模型、修改费用或参数映射。

## 修复与验收

独立codex/jimeng-edit-capability-20261015基于当时main7fae36c。repair-jimeng-edit-evidence-policy只作用于公开jimeng-image-5.0-pro→local-jimeng-50-pro→reverse-hub这个已发布来源；来源变化或管理员已有unsupported/unknown维护时保留当前值并停止，不覆盖其他配置。

本地实际simulateModel复现旧配置编辑排除，补录后唯一即梦来源可用；显式管理员否定、未知mask、价格、映射及原始对象保持。修改副本反向删除证据后恢复原配置和原排除，修改副本保留。

103持Naumi和Hub两把部署锁，读取精确v111/digest，完整pg_dump及网关/身份密码/计费/其他草稿指纹备份；使用现有模型repo/runtime的saveDraft+publish正常版本流程，以独立codex actor保存草稿，不覆盖管理员草稿。v112 publication实际applied；同模型/计费版本下的执行投影前后完全相同，修改只有capabilities.imagegen.edit。

真实账号已有私有图片解码后，planImagegen通过，仍即梦5.0 Pro、1个编辑步骤、6积分。再经公网Nginx路径POST /api/imagegen/plan，实际HTTP200、modelVersion112、billingVersion8、totalCredits6、唯一eligible来源local-jimeng-50-pro。全程未调用收费供应商、未创建生图任务。未把计划通过等同于本次已实际生成猫图。

最终身份/密码/角色与账户到期字段哈希、全部计费版本、其他操作者草稿和网关逐字节保持；原core CID持续运行，无App/Worker重启或切流，公开软件版仍8af8ee6/1791975598。两把部署锁已释放。

## 产物与回滚

证据根E:/Workspace/naumi/output/jimeng-plan-diagnosis-20261015。MODIFIED_FILE.json保留补录副本，DIFF_FILE.patch只体现该证据字段，VERIFICATION.txt记录命令/输入/字面输出/退出状态，ROLLBACK.sh在另一份本地修改副本上恢复原始SHA和原排除；线上v112保持修复。

线上备份位于/opt/naumi-staging/evidence/jimeng-edit-evidence-20261015。恢复线上配置须用正常模型restore流程、目标v111及expectedVersion112；如出现后续版本则重新核对，不直接SQL覆盖版本或回灌数据库。本次只实测独立副本回滚，没有主动把已修复线上重新置坏。

维护helper首次执行依次遇到standalone未保留server-only、zod、next/server入口包装；配置发布前终止，锁正常释放。最终将纯JS依赖打入bundle，并将next/server映射为同版本实际traced NextResponse/NextRequest导出，保留生产实现；之后BASELINE/APPLY/VERIFY/ROLLBACK_CHECK完整成功，不将前面失败当成发布成功。
