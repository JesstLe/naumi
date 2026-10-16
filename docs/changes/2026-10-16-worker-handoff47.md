# Worker 可观测排空与统一恢复入口（2026-10-16）

## 现场与边界

北京时间01:55只读复核47：13个运行容器，MemAvailable3011MiB，Swap0使用，网关单文件SHA仍77afe920…；Worker仍直连`naumi47-green-5fc5efe79267:3000`。本轮不重复发布v115，不沿用昨晚无用户的假设，不重放pending/needs_attention任务。

现有`video-worker.mjs`只有进程内running布尔值，无暂停新tick/排空确认/重启后保持暂停的控制通道。无法据此证明旧Worker已交接，原Worker保持。

## 本模块已实现（未安装线上）

- 抽离单飞tick运行器，控制通道只改变未来tick接收状态，不取消已开始的tick。
- 控制API使用现有Worker密钥鉴权，bootId、revision、operationId幂等保护；控制状态原子持久化并绑定commit/实例/目标origin。
- 候选可暂停启动；收到显式resume才开始，drain后重启仍暂停。请求超时不将activeTicks伪装为0，不调用供应商诊断。
- Docker正式镜像包含同一运行器；默认无控制环境变量时保留既有Worker行为。

- `scripts/ops/worker_handoff.py`提供实际47控制适配，持同一三锁、固定machine-id/Docker ID/Image ID/commit/origin，resume前检查目标Web同镜像同commit、INTERNAL_APP_ORIGIN回到自身。操作请求先fsync落盘，失联按原UUID/请求核对；未闭合操作阻止新操作。该工具不创建或停止容器、不改Worker环境。
- `package.json`集中验收及GitHub CI接入；没有声称远端CI已运行。

## 使用契约（待完整候选集成，不在旧Worker上照抄启用）

受控候选Worker必须使用与候选Web完全相同的固定镜像，并设置：

```text
NAUMI_WORKER_RELEASE_CONTROL=1
NAUMI_WORKER_START_PAUSED=1
NAUMI_WORKER_STATE_FILE=/worker-release-state/state.json
NAUMI_WORKER_CONTROL_PORT=3001
NAUMI_INSTANCE_ID=<本槽稳定且独立的实例ID>
SOURCE_COMMIT=<40位固定提交>
NAUMI_APP_ORIGIN=http://<统一候选Web容器名>:3000
```

`/worker-release-state`必须挂载专用持久私有目录，不复用数据库/媒体目录，不让其他槽共享。已持久resume后正常重启会继续工作，已drain或UNKNOWN后重启维持暂停。控制请求`{action:drain|resume,operationId,bootId,expectedRevision}`只发给容器内`POST /control`，鉴权沿用`x-video-worker-secret`；`GET /status`也必须鉴权。真实密钥不进入命令行、日志、产物或Git。host工具自动从容器环境读取，不让操作者粘贴密钥。

```bash
python scripts/ops/worker_handoff.py status \
  --target 47.105.59.142 --container WORKER \
  --expected-id FULL_DOCKER_ID --expected-image sha256:IMAGE_ID \
  --expected-commit FULL_COMMIT --expected-origin http://WEB:3000 \
  --host-identity-sha256 VERIFIED_MACHINE_ID_SHA256
# drain/resume另带 --operation-id UUID --plan CURRENT_LIVE_PLAN；结果只说明tick状态，不批准退役。
```

UNKNOWN目前只阻断、不提供凭空“解除”接口；需要服务端tick回执与实际任务复核流程补齐后才能启用线上。旧Worker无控制模块则直接拒绝，不发送SIGTERM/SIGKILL、不注入运行代码。

变更还要求根本地生命周期current.json与完整live plan/releaseId/hash相符；resume只允许READY/DRAINING中的同一新Worker，不能绕开PREPARED/UNKNOWN债务直接启动新扫描器。drain允许同事务中已登记的旧/新Worker，但从不执行退役。

## 集中验收

Windows/Linux运行器15项：暂停启动、单飞、inflight不假排空、写盘失败、CAS并发、UUID冲突、boot/identity围栏、dispatch崩溃、失联不自动重试、legacy行为、shutdown并发恢复拦截。

真实Linux子进程＋本地HTTP fixture：新Worker先暂停→resume仅1tick→drain保留inflight→SIGTERM等待原响应→重启保持暂停→再次resume并模拟SIGKILL→重启UNKNOWN拒绝自动再发。这里的SIGKILL仅作用于隔离fixture子进程，没有连接47。供应商调用0。

host控制适配另有16项mock契约测试；不是生产Worker交接验收。既有生命周期58项仍通过。完整类型/应用构建未跑：本模块是独立Node/Python运维运行器，无node_modules依赖，不冒充整站Next构建已通过。

未完成：完整统一候选、整站切流执行器、旧Web真实Agent/异步任务归属采集、旧前端资源兼容。此模块不是完整整站发布，不安装到当前线上Worker、不重启/新建47容器。

本轮仅本地实现、隔离fixture及47只读快照；无应用候选/镜像构建、无服务器配置/入口/容器/Worker变更，供应商调用0。

## 证据与同步

`E:/Workspace/naumi/output/worker-handoff47-20261016/`含12文件实际副本清单`MODIFIED_FILE.json`、真实`DIFF_FILE.patch`、`VERIFICATION.txt`和Linux700可执行`ROLLBACK.sh`。回滚只操作专用`rollback-copy`，原5文件精确恢复、7新增文件移除，再以旧Worker真实子进程复现旧行为；工作树及modified副本保持新行为。不是线上回滚。

开工及提交前fetch：origin/main仍`c2634fba41fd50a117f9af93e63d865e446f7394`；当前任务普通merge main为Already up to date。未合业务候选分支仍单独保留：no-silent-crop618cac0、channel-live-guards2aea8fc、model-health6e531d5、metadata79b3ab5。无提交/覆盖同事未提交内容，无自动主分支合并或线上发布。本模块完成计1次功能迭代（本轮fetch后1），后续达到3次再同步。

下一步：Web请求/Agent/后台已接任务的归属和排空观测、UNKNOWN tick服务端回执核对、完整统一候选和整站执行器，再做同镜像App/Worker及旧前端兼容验收。不是只差执行一条切流命令。
