# R5H：功能模型规则单一归属

## 目标与基线

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `6bb86d2dd7257ea0bbfe4c9305de168a85ffa418`，4365 原始文件归档并逐个核对 SHA256。开工 fetch 的 origin/main=`368c93e2343c57a330a0db6831ccbef01283ed6d`；这是最近同步后第2模块，不合回 main，不发布。

旧 business 为选业务模型反向依赖 tool-scope；tool-scope 为管理校验又依赖 business 的功能绑定和兼容候选。目录、报价、准备、SDK执行前选择、工作台和后台借两个混合 owner 读取相同纯规则，构成双向依赖。

## 实现

- `feature-model-policy.ts` 唯一拥有 FEATURE_BINDINGS、modelAllowedForFeature、featureDefaultModel、upstreamSupportsFeature、compatiblePublicModels、assertToolScope 六个原声明，正文逐 token 保持。
- 业务编排、采购换汇和路由规则匹配仍在 business；工具配置集合校验仍在 tool-scope。两者仅向纯策略 owner 依赖，不再相互 import。
- 15 个实际生产消费者改绑，涵盖公开 models/capabilities、Canvas/通用图像准备、报价身份、公开目录、原生工作台、批次和管理端。旧 business/tool-scope 对原六导出保留同函数/同对象兼容，不构造平行副本。
- 没有改变显式模型、默认优先级、Canvas家族 generate-or-edit、供应商候选过滤、隐藏抠图模型、功能停用、工具范围、冻结执行或客户价格。不添加限额、审批、用户确认或自动重提。
- 既有定向脚本按 owner 更新依赖白名单/双路径 mock，原业务断言保持；测试输入仍使用完整源码与原始 functions。

## 已有证据与待完成

- 24 组配置、13161 条实际纯函数决策基线/新版一致；默认优先级、家族备用通道、Canvas/非Canvas能力、隐藏/禁用/缺失、pool、scope、价格业务、文字/视频及显式模型保持。输入零修改，兼容6导出同函数/对象。
- 全生产7194个原声明正文保持、6迁移、算法变更0；旧两文件环拆除，其余全部SCC成员保持，新owner入环0。纯策略bundle无业务编排/管理/PG/SDK依赖。
- 首轮 verifier 将含 undefined 的内存数组与 JSON 的 null 直接深比较，observer exit1；已对当前决策同样JSON规范化再比较，未修改生产规则。原失败留存。
- 完整旧/新九组回归均exit0：管理工具范围/发布与冻结原任务、客户价/真实钱包部分失败单次结算、Canvas实际HTTP/plan 23、图片准备45、批次、隐藏抠图、工作台/家族和报价resolver36。补充原执行与business routing以及实际控件以最终索引为准。
- 最终四产物、真实回归、独立副本回滚、patch重放、提交/远端与cleanup以 `output/refactor-r5h-20261026/VERIFICATION.txt` / `DELIVERY.json` 为准。

## 后续

剩余4个全导入双文件环、Canvas外围UI和多tab/CAS、最终R6整包/基准/容量/同SHA CI与整合仍需推进。整体重构保持active。

原Windows直接dev控件夹具启动后health500，依赖junction使sharp/pg在该Next webpack路径未externalize；未改生产next.config，改用独立完整副本显式externalize原生包继续控件验收。旧静态入口夹具按R4后的真实availability/runtime/pool/account owner补齐mock，旧新同夹具对照，不修改产品逻辑。原失败完整保留。

## 集中验收发现的 Node/Edge 编译边界缺陷

真实 Next dev 第一次直接根目录运行 health500，含 sharp/pg 原生包扫描；完整副本显式externalize后仍health500，并指向Edge链中的Node crypto。根因是 instrumentation 提前return并未让Next编译器排除后面的Node动态import。完整副本恢复原next.config，仅将动态import及其原执行正文置于肯定的 NEXT_RUNTIME===nodejs 且非build分支，health200、37-owner正常启动，实际Next15.5.27＋headless Edge管理默认值/元数据刷新/保留人工输入/单一Canvas范围/排序/移动端等原脚本全部通过，paid0。

该两行结构修正已采用到src/instrumentation.ts；初始化正文逐token相同，9组Node/Edge/undefined与build/dev/undefined运行真值表及日志与完整旧源码相同。生产next.config未改；首两次dev失败日志保留，不当作纯测试错误。

最终新增启动验证：实际7部分53检查、完整源码复制的Next15.5.27生产模式build/start 25检查通过；build SQL0、首次登录/请求DDL0、目录请求metadata0/写入0。实际控件为原 verify-model-management-defaults-canvas-ui，METADATA_CANVAS_UI=PASS；旧verify-canvas-model-scope-ui的前两次仍明确setup失败，不扩大为该脚本全场景通过。完整产品镜像、本轮运行性能/容量不在上述结果中。
