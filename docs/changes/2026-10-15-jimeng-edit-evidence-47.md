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
