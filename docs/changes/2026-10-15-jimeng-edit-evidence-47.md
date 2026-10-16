# 47 补录即梦单参考图编辑能力证据（模型 v113）

## 问题与根因

2026-10-15 用户在 47 画布用「即梦 5.0 Pro」做引用图编辑（1 张引用 + "换成猫"，自适应·1K）被拒："所选模型没有已核实支持本次参数的通道"。纯文生图不受影响。

根因是新旧两套能力登记的空档：即梦 5.0 Pro 于 10-12 接入 120/香港，只有旧式布尔能力（`capabilities.edit=true`）且 `verified=false`；10-13 进库的图像能力共用层（`codex/imagegen-capabilities-20261013`，来源用户提供的 imagegen-skill-20261012.zip）在 47 上线（f4b3df1）后，`publishedImagegenCapabilities` 对 `verified=false` 的旧布尔按 unknown 处理，而编辑操作要求 `imagegen.edit` 证据 `state=supported`，即梦唯一通道被以 `IMAGEGEN_EDIT_UNSUPPORTED` 剔除，候选清零。47 从开站起即梦引用图编辑就不可能通过，并非回归。

## 修复方式（仅数据，不改代码/镜像）

用户授权修复。走应用自身管理 API 全流程，不做直接 SQL 改配置：

1. 持 `/opt/naumi-staging/releases/deploy.lock` 全程（等待同日 geeknow 会话释放后获得）。
2. 事前全库 `pg_dump -Fc` 30,282,449 字节，pg_restore -l 537 项可读（0600 权限）。
3. 复用"服务器原生签名管理员"先例：在 App 容器内用 `SETTINGS_SECRET` + `app_settings.admin_password_hash` 签发 `nv_admin` 会话，secret 不出容器，cookie 存 /run 0600 用后即删。
4. GET 快照 v112（digest 与库一致）→ jq 构造补丁 → **PUT /api/admin/bi/model-config/draft**（注意 draft 是子路由 PUT，根路由 POST 是 publish，此前 400 即因方法用错）→ validate 返回 `changes=[upstreamModels/local-jimeng-50-pro:changed]` 且 expectedVersion=112 通过断言 → publish `phase=applied`，v112→v113。
5. 发布后 v112→v113 全库配置 diff 仅 7 行新增（即梦节点 `imagegen.edit` 证据），发布配置与补丁输入逐字节一致；legacy 布尔、价格、参数映射、人工配置零改动。

补录的证据内容（依据 10-12 接入时的真实单参考图换色实测，2048×2048 已核验）：

```json
{"edit":{"state":"supported","source":"docs/changes/2026-10-12-jimeng-provider-onboarding.md：真实单参考图换色（红杯→蓝杯）完成并核验2048×2048结果；本次仅补历史编辑能力证据，不声明其他参数组合均已实测","checkedAt":"2026-10-12"}}
```

## 边界

- 未把 1.5k/4k/10 参考图等目录声明扩张为实测；mask/transparent 未补证据（10-12 约定蒙版编辑由应用端合成，不声称供应商原生能力）。
- 不涉及 120/香港（bed3391 无 imagegen 模块，无此闸门）；103 的 gpt-image-2 通道 10-13/14 已有自己的实测证据。
- 无供应商调用、无收费请求；发布与回滚材料齐全。同日 `codex/jimeng-edit-capability-20261015` 工作树中另一会话的 repair/verify 脚本（未提交）与本修复同一结论，本修复按其证据口径执行，未引用其未提交代码。

## 证据与回滚

- 服务器 `/opt/naumi-staging/evidence/jimeng-edit-evidence-20261015/`：db-backup.dump（0600）+ TOC、v112 快照、patched.json、validate/publish 日志（mutation.log）、v112-to-v113.diff、after.diff（空=发布与补丁一致）、repair.sh。
- 回滚：管理 API restore 至 v112，或以 db-backup.dump 整库恢复；restore 前须核对新版本无他人发布。
- 修复后画布引用图编辑（即梦）恢复可用；验收以真实画布编辑为准（本记录发布时用户尚未重试）。

## 2026-10-15 午间端到端实测结论（v113 之后）

浏览器真实账号（admin）画布实测+后端核对：

- **v113 闸门修复已生效**：10:44 用户重试即梦引用图编辑（3:4）与 10:57 我的即梦文生图均通过规划（此前该场景秒拒），任务落库并产生供应商调用——不再出现"没有已核实支持本次参数的通道"。
- **但即梦在 47 无法完成**：供应商配置指向 `http://reverse-hub:8080/v1`，而 47 上不存在 reverse-hub（App 容器内 DNS 解析 EAI_AGAIN；`naumi-new-api-app`/`reverse-hub-new-server` 两容器仅 Created 未启动，系其他会话 22 小时前遗留）。两笔调用卡 `submitting` 约 20 分钟后进入 `reconciling`。库中 10-12 的 `succeeded` 即梦调用是播种环境带入的历史验收记录，非本服务器实跑。**47 要用即梦必须先补齐 Hub/New API 反代栈并接线网络与凭据，属独立部署任务。**
- **引用图编辑路径本身是通的**：用户 10:17-10:20 用 Nano Banana（gemini）完成 3 笔引用图编辑，全部结算 6 积分/张，端到端正常。
- **全站生图通道今天异常（早于本修复，10:11 本地即开始）**：员工账号自然并发下大量 `429 所有兼容供应通道繁忙` 与 `400 所有可用供应通道均未取得图片`，结算时断时续；我的 GPT-Image-2.5 与 Nano Banana Pro 文生图两次尝试均以 400 失败。属通道容量/上游健康问题，与 v113 无关（时间线可证），建议由 geeknow/通道侧会话跟进。
- **计费注意**：02:44:09 账本有一笔 `-8`（对应失败的即梦编辑），两笔即梦调用 `cost_status=pending` 对账中，需确认对账后退回或人工退款。

## 补充（同日晚些）：reverse-hub 已由协作会话补齐

本记录"47 要用即梦必须先补齐反代栈"的阻塞已被另一会话接手完成（103 复制 New API/Redis/Postgres、启动 reverse-hub-new-server 与 naumi-new-api-app、worker tick 驱动僵尸调用清账）。补齐后实测：即梦提交不再卡死，改为快速真实失败——hub 内即梦 chromium 登录态过期导致任务 error，通道随后熔断为 429「所有兼容供应通道繁忙」。即梦真正可用前的最后一步是运营动作：在 hub 的 chromium 里重新登录即梦账号。全站通道 429/400 风暴（员工自然并发）仍在，属容量/上游健康事项。
