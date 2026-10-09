# MVP 模型显示档位与实际参数

用户要求把平台显示档位与供应商真正接收的质量值分开。MVP 模型行新增“参数设置”：五个固定语义 ID（low / medium / high / xhigh / max）可逐档启用、改显示名称；每个真实来源选择逐档映射、原样发送或不发送 quality。同一家族的比例分支统一展示、分别配置实际值。积分仍按平台档位×分辨率维护，不自动修改售价或采购成本。

配置写入既有模型版本 JSON 的 `upstreamModels[].parameterMap.qualityPolicy`，没有数据库迁移。旧 `parameterMap.quality` 保留，“恢复原参数”只移除新 profile。参数发布使用现有版本冲突、幂等和 Router 发布流程，完整管理草稿保持。新请求校验未开放档位，既有任务通过冻结模型版本使用原映射；JSON 和带参考图的 multipart 都实际映射/删除字段，不重复映射。原生能力与质量 rank 不被展示名称提升；只有已配置的 profile 改变质量选择契约，其他输入、蒙版、原生尺寸等能力检查保留。

本轮支持当前可见模型使用的 OpenAI Images 与 New API Flow 直连适配器。外部 Router/APIMart/fal、启用的路由池及成本预设不能套用此 profile，按钮明确禁用：这些路径的实际执行契约须在其适配器内扩展，不能只改网页后声称传参生效。Flow 旧配置不新增 quality；只有显式 profile 才传映射值。当前只实现质量档位，比例与分辨率继续沿用已有配置。

核对状态区分尚未验证、文档声明、接口接受（效果未验证）、实测拒绝；保存不会自动收费测试。是否原样发送或移除由管理员明确选择，不猜测“不支持就一定会忽略”。共享同一实际来源的其他工具入口会继承该 profile，界面已说明。

## 供应商实测

仅在新机 120.27.162.85 测试，凭据从既有加密库在进程内读取，未写入文件或日志。原可见 GPT 显示名 gpt-image-2.5、真实 ID gpt-image-2（TDH 来源），依次 low / medium / high / xhigh / max / invalid_probe_value，六次均 HTTP 200 并返回图片。连故意无效值也被接受，因此不能证明原生五档、效果差异或参数被忽略；结果只记 `accepted_effect_unverified`。一次 Flow 无 quality 探测连接状态不明，记 `unknown_stop_no_retry` 并停止，未重提，也不声称供应商费用为零。总计七次实际尝试，六次明确出图，一次结果不明；绕过应用用户任务，不扣用户积分、不创建作品。供应商费用未确定。

证据 `/opt/naumi-staging/evidence/mvp-model-parameters-20261009/probe-results.json`。模型官方参数文档只作参考，不能代替代理供应商实测：[OpenAI image-generation guide](https://developers.openai.com/api/docs/guides/image-generation/index.html)、[image-gen prompting cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)；当前供应商模型 ID 不等于前端别名。

## 验收与发布

隔离 PostgreSQL + HTTP 上游实测脚本 `scripts/verify-mvp-quality-parameters.ts` 验证五档改名、真实 JSON/multipart 映射和移除、Flow 字段、避免二次映射、冻结旧映射、请求档定价与实际值审计、草稿/原能力/售价保留。`scripts/verify-mvp-quality-parameters-ui.mjs` 启动隔离 Next 与浏览器，真实保存参数，检查生图和画布五档、max 请求、关闭档拒绝、不发送报价、手机、行序及恢复原配置。浏览器验收不调用供应商。

画布参数穷举 480 个组合；工具范围、MVP 发布、七项管理员画布执行、积分矩阵、自带图片 API 关闭/ComfyUI 保留、质量菜单、全局质量、家族路由、APIMart 预设均通过。类型检查与相关 lint 通过。UI 脚本初次误用 button 而实际是 tab、第二次把画布 multipart 当 JSON，均为验收脚本错误，原配置已恢复，修正后完整通过。

发布仅针对新机，固定源码镜像，共用 deploy.lock 从备份到线上浏览器验收连续持锁。保留本地媒体、数据库、账号鉴权、Router 连接、Compose 与公网代理，旧机不连接、不回传。视频与 OSS 延期约定保持。实际版本与发布证据完成后追加。

### 已发布与线上验收

- 运行源码 `8ca8329aec4af8af6e526bfa9ab3824648bc1e92`，镜像 ID `sha256:3c281c586bc309a6f60e1e963428de545766187529ef07a6b2b3c27306902d71`。APP/Worker 相同固定镜像，数据库与公网代理运行身份未变，health DB ok。`/api/version` 为 `1791559097`，浏览器实际加载 `v2026.10.09-231817`，发布锁已释放。
- 线上真实保存五档/改名/映射，生图选择 GPT 后显示定制档位，画布 max multipart 提交保持 max（供应商生成被浏览器拦截）；关闭 xhigh 后报价 409，omit 后报价 effective=auto，手机与稳定行序通过。恢复原完整配置、草稿和计费 v8 均核对一致。
- 线上默认生图模型为 Gemini，第一次验收误假定默认 GPT，第二次未兼容模型菜单的积分副标题。两次只影响脚本定位，分别恢复为模型 v50/v52，未更改用户默认、未收费生成。修正后完整验收恢复至 v55。最终只读检查等待最高档实际选中、加载稳定后截图，确认客户端/服务器版本相同。
- 原兼容完整配置仍为 v48。创建临时映射 v56，实际执行回滚兼容配置恢复至 v57，证明旧字段已移除且草稿/价格保留；没有回退主镜像。随后 GPT 五档 profile 正式生效 v58，模式 passthrough，来源实际 ID `platform-images:9ba2827204791ed8` / `gpt-image-2`，状态 accepted、依据注明无效值也被接受和效果未验证。其他模型、模型顺序、默认选择、采购价、客户计费 v8 保持。十个生图/画布×档位报价各轮通过，无收费生成。
- 回滚版本防覆盖实测：当前 v58，传过期拥有版本 v57，恢复被拒绝且仍 v58。`ROLLBACK.sh --check` 只读通过；真正回退前会拒绝新机未结算图片任务或后续管理员配置，避免旧代码解析新冻结 profile。
- 历史自带图片端点、ComfyUI 端点/工作流和计费 v8 前后完整行摘要一致；自带图片 API 仍 410，ComfyUI 鉴权保持。临时浏览器会话和应用 /tmp 验收助手已移除，用户原私钥未改动。
- 发布证据 `/opt/naumi-staging/evidence/mvp-model-parameters-20261009-release`，含 env/Compose/数据库备份、固定源码包、构建/部署日志、截图、最终配置/版本摘要、供应商实测结果和可执行回滚。`ROLLBACK.sh --apply` 自行取共用发布锁；仅在运行镜像和拥有配置版本仍匹配且无新待结算图片任务时执行。测试/文档跟进提交不另发业务镜像。

### 旧镜像回滚兼容性

原镜像 65cec197 不识别 qualityPolicy。应用回退前须用当前应用的版本恢复接口恢复备份的兼容模型配置，不能直接回灌 DB。回滚脚本核验运行镜像仍为本轮候选、当前模型版本仍为本轮拥有的版本，并拒绝存在新机未完成图片任务时回退（这些任务可能冻结新 profile）。若已有其他管理员配置或后续发布，停止自动回滚，不覆盖他人。只切 NAUMI_IMAGE，保留数据库和媒体；备份 dump 不用于覆盖现有数据。
