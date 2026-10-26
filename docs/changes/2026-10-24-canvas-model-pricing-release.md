# 画布报价与积分显示：47 直接上线结果

## 用户授权与固定版本

- 用户明确要求修复后最快直接上线，跳过旁路候选/蓝绿；本轮只更新 47，不操作其他站点。
- 实际程序源码：`af22c6e5f149215cfd5bf862f781e95e67c88987`；分支 `codex/canvas-model-pricing-fix-20261024`，已推送 GitHub。
- 版本：`1792808190`。
- Web/Worker 统一完整镜像：`sha256:45b272fc98834ea109b71ff14e759ce4cbb76742242945293f6ab46ab3538f65`。
- 已保留质量回退提交 `0fbdd5a823c58755177412ef4a8a443fb3a03389`，未混入另分支性能优化。
- 本文件是发布后证据记录，不属于上述程序镜像的源码提交，不将文档提交号冒充在线程序版本。

## 实际更新

- 时间：2026-10-24 10:35:50，Asia/Shanghai。
- 原部署三锁内执行；暂停恢复 timer 后等待其已在运行的检查自然退出，没有停止其他发布者。核对确认间歇持锁的是恢复服务，不是另一发布。
- 先暂停 Worker 并等待当前 tick 与媒体工作完成，再暂停 Web 新后台接单，等已观察的 HTTP/Agent/后台活动归零；未强杀任务。运行观察覆盖不是全业务覆盖证明。
- 直接替换同名完整 Web 与 Worker，保留原端口、三个网络、资源、秘密及业务媒体挂载；只改变固定程序版本及新 Worker 状态文件名。
- 两旧容器停止、`restart=no` 并改名保留作程序回退；旧状态与历史 UNKNOWN 证据保持，不清账务、不回灌数据库、不重放未知任务。
- 保留旧静态资源到新版容器，原恢复 manifest/canonical/journal 路径不变，按原哈希算法重新绑定新容器、boot 和镜像，canonical 单调更新至 revision 818。
- 恢复 timer。随后服务自动执行两次均 `RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=RUNNING`，exit 0，不再指回旧版本。

## 上线后实际核验

| 项目 | 结果 |
| --- | --- |
| 公网 `/api/version` | `1792808190` / 完整源码 `af22c6e5f149215cfd5bf862f781e95e67c88987` |
| `/api/health` | 数据库 enabled/ok、storage enabled，HTTP 200 |
| 原有登录、项目和画布读取 | 通过，未建立临时账号 |
| Web/Worker | 同上述完整 Image ID，Web admission open，Worker 正常扫描、unresolvedTicks 0 |
| 模型与价格 | 实际 `GPT-Image-2.5`（ID `gpt-image-2`），1K/1:1 五档报价均 HTTP 200：低4、标准6、高10、超高14、最高18 积分/张；高档3张30积分 |
| 通用积分目录 | 读取成功，包含 `canvas.image` |
| 公开更新记录 | 版本1792808190及对应用户文案已从实际接口核对 |

价格是本次现有核验账号、当时配置、1K/1:1 的真实报价，不泛化为所有账号、规格或永久价格。上述6次 POST 仅请求报价并按原机制保存报价回执；没有提交生成、预扣或消费积分。付费供应商出图由用户自行实测，未冒称完成。

## 本地回归与证据

- 修改版通道35项、catalog/client22组、隔离真实PG/实际route/planner23项、真实组件UI_FIXTURE10项均通过；完整最终Linux镜像构建exit0，原始失败原件保留。
- 三视图报价比例与执行固定16:9一致，其他模式使用原选择比例。
- 独立副本回滚：8份原始hash恢复、6新增文件删除、3份合入qualityfb保持；修改版35/35，恢复后30/35并复现原5条误拦，属于旧行为恢复，不是回滚失败。实际工作区及线上保持修改后。
- 源码制品快照包含修改说明文档；本发布后文档独立保存，不改写原快照。
- 本地完整证据：`output/canvas-model-pricing-fix-20261024/VERIFICATION.txt`、`RUNS.json`、`DIRECT_RELEASE_FINAL.json`、`LIVE_PRICING_READ.json`、`LIVE_FINAL_RECOVERY_NOTES.json`。
- 四制品：`artifacts-final/MODIFIED_FILE.zip`、`artifacts-final/DIFF_FILE.patch`、主目录 `VERIFICATION.txt`、`artifacts-final/ROLLBACK.sh`；原始备份及副本依赖一并保留。
- 远端私有证据：`/opt/naumi-staging/evidence/canvas-model-pricing-20261024/`。秘密留在服务器私有材料，不进入仓库。

## 保留后续

- 用户端实际付费生成与结果质量由用户验证，本轮未代提交。
- 两项既有前端依赖竞态仅有源码审阅发现，未运行复现、未在本轮扩修；不把控件回归扩大为全依赖修复。
- 历史生命周期 `MIGRATED_CLEANUP_PENDING` 及原历史事项未重新归类为完成；本轮实际新旧程序、恢复身份与报价核验结果独立记录。
