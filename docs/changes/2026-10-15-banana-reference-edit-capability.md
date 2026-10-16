# Nano Banana 参考图编辑能力修复（47）

## 现象

47 原生画布选择 Nano Banana Pro、1 张参考图、3:4、1K 时，计划阶段提示“所选模型没有已核实支持本次参数的通道”。

## 根因

已启用的香蕉通道只有旧版 `capabilities.edit=true`，整体 `verified=false`，新图像能力校验因此把独立的 `imagegen.edit` 判为 `unknown`。全局改 `verified=true` 会错误声明身份保持、质量、分辨率等尚未逐项核验的能力，未采用。

## 真实证据

- 历史 Geeknow 两笔 `phase=edit` 的作业实际上参考图数量为 0，单凭账本 phase 不足以补证，原候选 a027a65 已 HOLD。
- Prompt Hubs 历史有 1 张参考图并已完成的作品，但当日持续 403/429；历史能力不等于当前健康，不据此声称可用。
- 18:41 单次受控诊断：`scripts/probe-banana-reference-edit.ts` 沿用当前主站环境、代理和凭据，经过现有容量限制器，真实提交 `POST /v1/images/edits`，wire `gemini-3-pro-image-preview`，1 张合成参考图、`size=3:4`、`resolution=1k`、`n=1`，不自动重试。
- operation `banana-edit-proof-pro-20261015-r1`，call `5c6cfef2-6b18-4d77-80cf-ca9f2a81b59f`，HTTP200、delivered=1；输出 PNG 896×1200、1,960,302 字节，sharp 解码及人工查看通过。
- 参考图 SHA256：`83aa6e73bb8991f3c4e29b3d14bdde7fae7b70a030f67f973ad08ba65d7966a5`。
- 输出 SHA256：`6b5c2373d20ecdbaf4383bf088e823d88f57d0c256f0d3d9b0ffdf13ba6d6f32`。
- 证据在主站容器 `/tmp/banana-edit-proof-20261015/{PROOF.json,REFERENCE.png,OUTPUT.png}`，本机已取回副本。未改模型配置、入口、容器或 Worker，未重放用户任务；真实供应商调用合计 1。

## 修复边界

仅给 `geeknow-nano-banana-pro` 增加 `capabilities.imagegen.edit` 的 `supported` 证据，日期 `2026-10-15`。该通道对应 Nano Banana Pro 的 5 个比例别名。保持 `verified=false`、`preserveIdentity=false`、质量/分辨率/透明/蒙版等未核验能力、价格、供应商权重和启停状态不变。Banana2、Prompt Hubs 和其他供应商保持 unknown；管理员已显式维护的 `imagegen.edit` 不覆盖。1K 实际返回尺寸不构成精确像素承诺，也不外推其他档位实测成功。

## 本地验证

`scripts/verify-banana-edit-evidence.ts` 已通过：基线 5 个 Pro 比例入口均 0 个候选；修改后每个入口恰好 Geeknow 1 个候选，未知通道仍排除；参考图数量 2、蒙版、透明背景和未声明参数仍被拦；生成路径、路由投影与价格不变；独立副本回滚恢复原 SHA 和原拒绝行为。`scripts/verify-imagegen-capabilities.ts`、`scripts/verify-model-publication.ts`、TypeScript 全量检查均通过，以上回归供应商调用 0。

18:45 对线上 v114 执行只读 PLAN：核对实测三文件的哈希、解码尺寸、调用记录和原供应商身份/凭据，5 个 Pro 比例入口修改前 0 候选、修改后 1 候选，价格与 Router 投影相同；未执行 APPLY。

证据目录：`output/banana-edit-evidence-20261015/`（仅本地忽略产物）。

## 发布状态

未改线上配置。原候选 a027a65 已撤销发布意向；修正后的单通道版本需纳入 2026-10-15 19:00 47 统一蓝绿窗口，持三把部署锁并先重核配置版本、资源余量和在线任务；不新增并行候选、不原地重启、不影响正在使用的用户。

## 发布操作

`scripts/repair-banana-edit-evidence.ts` 通过正式 repo/runtime 发布，不直接 UPDATE active config。先在协调窗口执行 PLAN（每次新目录），再 APPLY，最后 VERIFY。APPLY/ROLLBACK 将请求 UUID 持久写入目录；超时/unknown 使用同模式同目录核对同一操作，不另造发布。VERIFY 真实读取管理员所有的参考图并运行 `planImagegen`，不创建图像任务、不产生第二次供应商调用。

```sh
node repair.cjs PLAN /tmp/banana-edit-evidence-20261015/release-r3 /tmp/banana-edit-proof-20261015
node repair.cjs APPLY /tmp/banana-edit-evidence-20261015/release-r3 /tmp/banana-edit-proof-20261015
node repair.cjs VERIFY /tmp/banana-edit-evidence-20261015/release-r3 /tmp/banana-edit-proof-20261015
# 需要撤销时，仅撤销本次 edit 证据，不覆盖后续其他配置：
node repair.cjs ROLLBACK /tmp/banana-edit-evidence-20261015/release-r3 /tmp/banana-edit-proof-20261015
```

工作目录 `/app`，沿用当前进程环境。脚本依赖按实际 standalone 依赖打包；仅诊断的 server-only 空模块在服务端 bundle 中替换，不能让这份运维程序进入客户端。协调者须将证据三文件保存到主站容器外，防止蓝绿退役时遗失。当前独立任务分支基线为 `c2634fb`；已刷新远端 main 且未改变，同步后本模块计数 1，未混入此前模型健康模块。
