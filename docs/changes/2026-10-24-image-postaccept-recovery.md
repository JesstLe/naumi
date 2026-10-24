# 图片已成图后交付失败：恢复身份修复

## 本轮状态

- 基线：`3e1e402e97f098496601cb4a134743366b6f3e4b`；修改前工作树干净。
- 线上观测：47 Web/Worker 均为 `af22c6e5f149215cfd5bf862f781e95e67c88987` / `1792808190`。这不是本轮修复已经上线的声明。
- 已确认缺陷：根付费操作以整单 ID 登记，fan-out 供应操作使用 `root:image:index`；根恢复检查却只查 root，第一次 indexed Pending 可排一次查询，第二次在进入供应查询前被根身份检查阻断。
- 原始首次异常没有被旧日志保留。两张原图通过了真实 Node 环境中的图片校验；正则栈溢出未复现，不作为本轮根因。

## 实现范围

1. `image-gateway.ts` 增加请求内 `ImageIndexCheckpoint`，每张图片沿原 indexed ID 执行与恢复；没有持久跨用户共享上下文。
2. `durable-image-jobs.ts` 与 `channel-availability.ts` 修复根与子图片恢复身份。子检查点放在根 attempt 的 `children` 字典，不新增顶层 `paidOperations` 项，避免交付检查重复收集图片或误判 `allDone`。
3. 已完成子结果直接读取保存字节；已受理任务仅沿原身份查询。未知受理状态不成为另一笔生成 POST 的许可，多图不能凭第一张 pin 放行全部图片。
4. `channel-image-response.ts` 在原异常上关联固定处理阶段；`model-health/observe.ts` 记录有界内部诊断，原异常身份、cause 链及健康分类保持不变。
5. `imagegen/failure-evidence.ts` 仅输出允许的错误名称、代码和固定分类，最多四层 cause，拒绝原始 message/stack、提示词、URL 与凭据。
6. APIMart 逐图下载与像素解码通过后，复用同一 Response 的已验证标记，省去外层重复 JSON/base64/像素处理。原单图 32MiB、整包 48MiB 界限保持，不把健康成功当作已经交付。
7. 最终窄审发现并修正两项兼容边界：合法成本预设也能提供精确 accepted task 证明；原任务只读上下文在实际 transport 的所有 POST 边界检查，不再依赖是否配置 channelGuard，防止阶段路由在恢复时新建备选生成。

## 验证方法

- 原文件逐字节备份位于 `output/image-postaccept-recovery-fix-20261024/before/`，不覆盖旧备份。
- `scripts/verify-image-postaccept-recovery.cjs`：实际 TypeScript 模块/AST，外部仓储与网络为显式 fixture；覆盖原故障状态、分图检查点、原任务查询与重复结算边界。
- `scripts/verify-image-postaccept-diagnostics.cjs`：真实图片校验与 sharp，健康仓储为 fixture；验证阶段定位、cause 边界、敏感内容排除、日志异常不替换原错误。
- 集中运行前不以静态源码审阅或脚本编写完成宣称 PASS；每次运行的完整命令、stdout、stderr、exit 单独封存。
- 副本回滚只修改专用副本，产品工作树保持修复版；基线旧故障应复现，修复版应通过，恢复副本应恢复原故障。

## 真实历史任务与发布边界

- 两条历史失败分别为预占 8 / 12、实扣 0，原图存在而作品为 0。预占存在不等于已退款，供应 completed 不等于已交付。
- 本轮不重新生成这两单。原图交付与原账务收尾须沿既有所有者、冻结版本、确定性作品 ID、原结算 ID 完成；只有实际回执后才记录已恢复。
- 服务器实时顶层仍有历史 `MIGRATED_CLEANUP_PENDING` / revision 818；当前 normal 子发布为 `COMPLETE`，所有 operation 已 ACK，runtimeRecovery 指向实际 af22c6e 进程。历史顶层状态不能直接推成新故障阻断，也不能删除重建；新发布仍需核对当前程序与原子状态绑定，不拿旧直接替换脚本当蓝绿入口。
- 本文随源码、集中验证、Git 与真实发布结果更新，未完成项不写成已经上线。

## 当前实测记录

- 基线：`BASELINE=REPRODUCED CASES=11 CHECKS=88 FAILURES=5 REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=1`。两笔模拟旧状态均恢复在进入回调前被阻断，GET/POST 为 0。exit 1 是原故障复现，不是通过。
- 修复版：`MODIFIED=PASS CASES=11 CHECKS=142 FAILURES=0 REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=0`。真实模块与显式 fixture；存量任务每单原 task GET=1、生成 POST=0，不当作生产 E2E。
- 真实隔离 PostgreSQL：`IMAGE_POSTACCEPT_POSTGRES=PASS CHECKS=18 REAL_POSTGRES=1 HTTP_CALLS=0 SUPPLIER_CALLS=0`，exit 0；包含上述两项边界的新增检查。
- 原 APIMart 真实隔离 PG + loopback suite：53 checks PASS，`REAL_PAID_API_CALLS=0`，exit 0；参考图传输另核 16 个文件。
- 内部异常留证：`IMAGE_POSTACCEPT_DIAGNOSTICS=PASS CHECKS=23 REAL_MODULE=1 SHARP=REAL HTTP_CALLS=0 DB_CALLS=0`，exit 0；包括实际适配器响应构造的原 48MiB 上限。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0，stdout/stderr 均为空。
- 早期恢复 fixture 用 Hub Review `reconciling` 导致两项失败，改为普通 accepted `running` 后重跑通过；没有放宽产品 accepted 白名单。一次 PowerShell 包装引号错误导致隔离环境未注入，真实 suite 重跑通过，原失败记录保留。
- 第一版固定提交 `a1aed2dcbefd14afb716d2471743a93ed740f55d` 已推送，Linux 完整镜像构建 exit 0，91/91 静态页；仅候选，不是已上线。最终窄审的两项修正形成后续固定提交及新构建，不使用旧镜像冒充最终版。
- 第一版副本实际回滚已通过：7 原文件恢复、4 新文件删除；副本恢复旧故障五项，与 baseline 同失败。第二版新增 transport 后需重新封存，旧制品保留为 v1，不提升为最终版。
- 历史两单补交：限定原两组任务、原图哈希、同根 token，已完成只读预检；apply 与最终作品/账务/父子台账结果以独立真实回执为准。
- 最终构建、副本回滚、Git 推送及上线结果：待本轮后续回执补充。
