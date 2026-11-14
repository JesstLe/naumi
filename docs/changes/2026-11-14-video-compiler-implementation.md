# 统一视频编译架构实施台账（持续目标）

## 目标与完成定义

状态：ACTIVE；业务重构尚未完成。用户2026-11-14明确要求“制定目标全部搞定”，已建立持续目标，不能用文档、类型定义、局部测试或main合并冒充整体交付。

唯一规范：[统一视频编译RFC](../architecture/2026-11-14-video-compiler-rfc.md)。实施基线main `1fbe7610b5d3e589e892394187f95f6cbfde6d3e`，独立工作树 `E:/Workspace/naumi-video-compiler-p0-20261114`，分支 `codex/video-compiler-p0-20261114`。

完成必须包含P0核心、P1全入口、P2全协议/历史兼容、P3旧裁决退出、P4 A01–A19与应用/DB/Worker/资产账务/回滚验收；完成切片普通合main，发布及实际上游证据分层登记。47明确暂停不由本目标自动解除，103隔离实验线不得混入主线，不暗中发起收费测试。

## 模块职责、接口与数据归属

- video拥有Draft/Intent/Profile/Compile/CompiledPlan；model-config拥有发布Binding/Policy与来源审计；媒体模块拥有资产访问、内容哈希与真实probe；任务/计费继续拥有幂等、预占、租约、结算、UNKNOWN；Canvas拥有节点与选片关系。
- 入口->应用用例->Resolver/Profile纯规则->既有I/O适配单向依赖。不拆计费事务，不新增内部HTTP自调用，不为每个函数机械增加层级。
- 目标公开接口为RFC的VideoModelProfile、compileVideoRequest、CompiledVideoPlan；当前尚未实现/接入，不预支状态。

## P0首轮实查结论

1. `reference-materialization.ts` 已按归属/项目可读性、sha256、字节数和真实媒体类型授权素材。
2. `media-inspection.ts` 的 `verifiedOwnedMedia` 已使用完整解码，并按storage_key+sha256+decoder_version=1缓存probe；不是只有上传MIME声明。复用此能力，不重建第二套媒体检查服务。
3. 当前 `frozenVideoSchema` 冻结definition/sources/profile/sourceRevision，缺少新CompiledPlan判别；需扩展plan reader并保留旧快照，不就地重写历史任务。
4. model-config.parameterMap与视频输入/node/workflow严格schema会拒绝未知新字段；迁移必须与Binding/intentPreference解析同步，不能只新增compile函数。
5. RFC全量范围是所有注册wire profile实例加无videoProfile旧路径，不用一个族的一次fixture代替所有子profile。

## 阶段台账

| 阶段 | 状态 | 完成条件 |
|---|---|---|
| 实施基线/清单 | 已建立 | 入口、逐profile、19项验收与历史边界有持久记录；不代表功能通过 |
| P0核心 | 进行中：现有数据边界调查完成 | 新合同/Resolver/Profile/Plan及Policy/Evidence分离有实际代码与集中测试 |
| P1全入口 | 待实施 | Canvas、Workbench、Workflow/批次、Agent、Storyboard、BYOC、恢复/重试同底座 |
| P2全协议 | 待实施 | 每个注册profile＋非wire路径有迁移/fixture，旧冻结任务不漂移 |
| P3清场 | 待实施 | 新任务旧裁决/fallback/整对象升级职责退出；调用与配置迁移证据 |
| P4集中验收 | 待实施 | 下表全部分层验证，真实上游/发布无授权时保持未验，不以fixture代替 |
| main整合/上线 | 待完成 | 按完成切片整合，实际站点/version/蓝绿/回滚/授权分别核验 |

## 全入口清单

- [ ] Canvas links
- [ ] Canvas composer
- [ ] Canvas single submission
- [ ] Canvas batch
- [ ] Workbench
- [ ] Workflow DAG/freeze
- [ ] Agent canvas/standalone
- [ ] Storyboard
- [ ] BYOC
- [ ] Model management/catalog
- [ ] Recovery/retry
- [ ] Artifact graph/downstream

## 逐协议实例清单

来源：`VIDEO_WIRE_PROFILES` 基线枚举；共57项，仅是范围计数，不是已通过数量。

- [ ] `openai-videos`
- [ ] `grok2api`
- [ ] `cogvideox3`
- [ ] `agnes`
- [ ] `agnes-v25`
- [ ] `ark`
- [ ] `kie-generic`
- [ ] `kie-kling`
- [ ] `kie-kling-v26`
- [ ] `kie-kling-omni-text`
- [ ] `kie-kling-omni-image`
- [ ] `kie-kling-omni-reference`
- [ ] `kie-kling-omni-transform`
- [ ] `kie-motion-control`
- [ ] `apimart-generic`
- [ ] `apimart-kling`
- [ ] `apimart-kling-v26`
- [ ] `apimart-kling-omni`
- [ ] `apimart-motion-control`
- [ ] `gemini`
- [ ] `minimax`
- [ ] `metaso`
- [ ] `autodl`
- [ ] `runninghub`
- [ ] `comfyui`
- [ ] `tokendance-seedance`
- [ ] `tokendance-kling-text`
- [ ] `tokendance-kling-image`
- [ ] `tokendance-kling-motion`
- [ ] `tokendance-kling-omni`
- [ ] `tokendance-wan3`
- [ ] `tokendance-happyhorse`
- [ ] `tokendance-minimax`
- [ ] `tfrouter-generic`
- [ ] `tfrouter-kling`
- [ ] `tfrouter-kling-omni`
- [ ] `tfrouter-grok`
- [ ] `compshare-h3`
- [ ] `compshare-hailuo`
- [ ] `compshare-vidu`
- [ ] `compshare-vidu-extend`
- [ ] `compshare-vidu-lip-sync`
- [ ] `compshare-wan`
- [ ] `compshare-seedance`
- [ ] `apimart-apib-seedance`
- [ ] `apimart-apib-kling`
- [ ] `apimart-apib-wan`
- [ ] `apimart-apib-h3`
- [ ] `geek-kling`
- [ ] `geek-wan3`
- [ ] `apib-video-v2`
- [ ] `geek-video-v2`
- [ ] `geek-h3-v2`
- [ ] `apib-video-v3`
- [ ] `geek-wan3-v3`
- [ ] `geek-h3-v3`
- [ ] `apib-storyboard-v4`
- [ ] 无videoProfile的openai-videos adapter
- [ ] 无videoProfile的direct adapter

## A01–A19验收台账

| 编号 | 要求 | 状态/证据 |
|---|---|---|
| A01 | 错误旧modes/limits、verified缺失、smoke缺失不否决已发布可映射请求；明确政策仍有效 | 待实施/待验证 |
| A02 | 旧描述无来源不自动变政策；人工字段/价格/路由/send=omit保留；同步不覆盖 | 待实施/待验证 |
| A03 | 同协议新增型号只发布Binding即可；新协议结构缺失准确报mapping错误，不按型号正则猜 | 待实施/待验证 |
| A04 | describe与compile共用约束；预览/正式提交在同digest和修订下intent/facts/诊断一致 | 待实施/待验证 |
| A05 | 预览零任务/零账务/零业务幂等/零供应商调用；陈旧响应不覆盖新草稿，预览失败不持久降级 | 待实施/待验证 |
| A06 | 连线/上传/提及同素材、角色和顺序得到等价计划；有语义顺序变化时不错误排序成相等 | 待实施/待验证 |
| A07 | text+媒体旧节点恢复自动；两张普通图不变首尾；明确偏好缺素材准确报告、不丢素材 | 待实施/待验证 |
| A08 | 切模型/保存刷新/多选/锁定不丢提示词、引用或参数；已有Dock连续性不回归 | 待实施/待验证 |
| A09 | 权限/跨项目/待完成/伪造元数据/真实超限/错误角色/重复ID仍拒绝；不每次编辑全解码 | 待实施/待验证 |
| A10 | §9所有入口同输入得到等价计划；Agent不能绕过权限/账务或建立独立模式规则 | 待实施/待验证 |
| A11 | §10每个注册profile实例＋direct/openai无profile路径均有真实序列化fixture；JSON/multipart/DAG全部覆盖 | 待实施/待验证 |
| A12 | 工作流未来绑定在依赖完成后只最终编译一次；冻结绑定不漂移，超报价需原有确认，前序不重放 | 待实施/待验证 |
| A13 | 请求/有效/wire参数分开，4K->2K等映射恰好一次；账务事实与实际执行规格对应 | 待实施/待验证 |
| A14 | 重复/并发/超时/重启/UNKNOWN不重复受理或扣款；新计划worker消费、租约与取消通过 | 待实施/待验证 |
| A15 | 旧冻结任务wire/价格/文本/素材快照及poll/cancel恢复不变；显式retryOf不覆写原任务 | 待实施/待验证 |
| A16 | 签名URL过期可按同资产身份物化，不能借机读最新能力或换模型/素材 | 待实施/待验证 |
| A17 | 生成完成 -> 选历史结果 -> 接下一节点 -> 再生成，资产/父子回执/账务/用户展示一致 | 待实施/待验证 |
| A18 | 编译成功、上游受理、成片保存、选片采用分别验收；证据有通道/合同/输入范围，不把一次文生泛化 | 待实施/待验证 |
| A19 | 蓝绿新旧Web/Worker与plan版本兼容，回滚不回灌DB/媒体、不重放未知付费任务 | 待实施/待验证 |

## 验证与更新规则

- 完整业务切片后集中跑受影响类型/单元/HTTP/DB/Worker/浏览器检查；不每个小helper跑全量构建。
- 保留baseline/modified/copy-rollback原始命令、输入、结果、退出码、hash与真实产物。物理/安全/计费边界失败同样覆盖，禁止把known baseline失败抹去。
- 当前只有实施清单内容核验；P0–P4业务检查、付费供应商、正式发布均未执行，不增加发布计数。
- 证据目录：E:/Workspace/naumi/output/video-compiler-p0-20261114；IMPLEMENTATION_STATUS.json与本表同步更新。

## 下一实际动作

实现P0的版本化执行数据契约与显式政策/来源分离，再接入可信输入Resolver和按协议族的编译接口；不把旧capabilities.video自动转Policy，也不新建以verified或静态型号表执法的门禁。随后按完整入口/协议切片迁移，目标保持ACTIVE直到全部验收。
