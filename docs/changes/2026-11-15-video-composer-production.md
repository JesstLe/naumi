# 视频草稿恢复：固定生产包与完整创作回归

## 模块与职责

基线main `5396a864dd52ca7cf5251375b3e2913dc4ea9db9`。上一片的草稿恢复已通过development和实际Dialog，本片构建该固定主线的完整Dockerfile生产程序，并在不可变包内验收。不修改产品src、Next版本身份、部署控制器或生产配置。

## 公共接口、依赖与状态归属

沿用原production-package→owned Storyboard session→Windows Edge驱动。新增显式`--production-draft-recovery`只在原host UI驱动接入实际Canvas检查，桥接不写React/DOM，不替换成功HTTP。原文件RPC只读fixture快照并控制独立Worker；本检查前后project节点/任务/账务/供应商数量必须相同。

新helper读取原认证GET，使用原视频描述和时长控件编辑、整页重载、离开/返回、第二个浏览器上下文、恢复基线；记录准确commit与原配置/输入/revision，恢复日志不能被误当服务器保存。预览/报价HTTP不是任务写入；真实节点写入及生成入口单列拒绝，DB快照另核对。独立上下文不继承tab-local草稿。

## 实现与验收状态

新包只从5396a864的git archive构建，不把本工作树验证bundle替换进产品实现；fixture bundle只编排原生产Web/独立Worker/native sandbox。新增host驱动保留既有Workbench4、Canvas读取/故障恢复2、Storyboard10与三媒体输入等价21；默认不带新flag的路径仍37项。

完整固定构建、镜像/Worker源哈希、LinuxWorker、旧包反证、新包源/独立副本、回滚及精确exit以 E:/Workspace/naumi/output/video-composer-production-20261115/VERIFICATION.txt 为准。实际旧包be535f6e与新包分别验收，不把旧包baseline预期丢失称为修复通过。

## 未完成项与下一步

该结果仍是本机固定生产包与隔离PG/本地供应商fixture，不是站点上线、真实供应商或跨BUILD_ID零刷新。开发盘高占用已盘点，构建context在C盘；没有prune、卷/媒体/业务数据删除。103实际启用Binding/env-only清单与审查迁移、真实授权上游、站点公网/全业务collector/蓝绿保持未完成。47 HOLD、103隔离线保持；生产写入/付费/部署0，总目标ACTIVE。

## 最终固定包与旧包/副本结果

固定5396a864 / 1794711127，镜像sha256:4ecf0de4ee635d3bcee4f5bbc9db5726b18745ea3b5dfca29874cadfc9e0d880，Next15.5.28 / BUILD_ID=3eF_b5v-zBwCrlw_-e7Md。完整Dockerfile构建exit0；578个tracked Worker源输入与固定git archive逐一匹配，Worker SHA=b764149c9db190c54216fba963520f6667bf82250162db937cae890e19573e29。node_modules输入不是git归档项，不将其计为tracked核对；原完整构建的依赖闭包检查保持。LinuxWorker49通过，build原lint警告留存，不称零警告。

源与独立副本各15项实际production Web/独立应用Worker/native媒体/隔离PG底座＋43项Edge（Workbench4、Canvas恢复2、分镜10、三媒体21、草稿恢复6）通过，两个进程命令各exit0。草稿恢复检查不写节点/任务/账务；原完整生成链每份16笔视频账本262 fixture积分。所有浏览器pageerror0、成功HTTP替换0、React注入0；每份5子进程、随机schema、pools、relay与浏览器全部清理。

旧固定be535f6e包通过原37项浏览器及15底座，同一个新helper真实确认未发送描述与时长刷新后均丢失，输出明确BASELINE，不算修复通过。新旧结果分开保留，没有把旧包换成新包再报告基线。

源码/副本core137与tsc通过，原bridge16与新装配图3通过。五路径副本回退恢复原字节/原不存在状态，新hostflag/child调用/节点后置核对探针true→false，恢复后core137通过；产品5396a864修复仍保留，不将工具回退冒称产品回滚。完整命令/输入/literal输出/exit、最终包及回退见四产物VERIFICATION.txt。初始来源核对错误地要求node_modules存在于git archive，脚本修正为逐项核对tracked输入，没有修改镜像或产品。

本轮产品src改动0、站点操作/配置/付费/部署0。此固定生产包证明不关闭跨BUILD_ID严格零刷新、真实站点启用配置迁移或真实供应商端到端；总目标ACTIVE、47 HOLD。
