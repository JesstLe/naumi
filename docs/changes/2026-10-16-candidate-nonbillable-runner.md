# 47新候选非计费账号验收runner（2026-10-16）

## 可复用方案与范围

从现有`test_release_memory_payloads.mjs`复用真实Skills导入/编辑/读取、包装save/revision读取协议；从`canvas-history.ts`核验文本text-patch及持久读回。移除原fixture的注册、权限提升、4K图像负载、模型调用和DB直接写。新runner只调用固定非计费API；画布save/undo/redo属于**真实API历史协议验收**，不冒充浏览器按钮验收。实际UI/boot由主线程独立collector补齐。

实际source固定`7bdcd8b644e8771646003f68055585f257df40f0`、build`1792146767`、main image`sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375`；容器仅loopback13100→3000，Cmd不由本runner改变。原HostTransaction/三锁由调用者持续持有，本runner不独立宣称持锁。主机machine-id SHA由主线程原manifest传入核验。

## 文件/依赖/有限操作

- `scripts/ops/verify_candidate_nonbillable.py`：Linux root Python3.9+标准库、Docker CLI；读取原始Cookie header私有文件和owned-media数组JSON，执行原候选CID内置Node22+；无需npm/Playwright/额外安装。Cookie只进入docker exec stdin，绝不argv/stdout。
- 相邻`verify_candidate_nonbillable.mjs`：Node内置crypto/fetch/FormData/File；wrapper注入配置，禁止直接任意URL/任意target执行。服务进程及其env不变，只有审计Node设置NODE_OPTIONS空值。
- root把两文件按字节保存到同一私有目录即可。先核hash、root/operator文件不可被非root写。无SSH和服务器上传逻辑。

```sh
python3 /PRIVATE_RUNNER_DIR/verify_candidate_nonbillable.py \
  --candidate-cid EXACT_RUNNING_MAIN_CID \
  --expected-host-sha256 MACHINE_HASH_FROM_ORIGINAL_47_MANIFEST \
  --cookie /opt/naumi-staging/evidence/release47-window-20261016-main7bd/qa-native-cookie.private \
  --owned-media /opt/naumi-staging/evidence/release47-window-20261016-main7bd/OWNED_MEDIA_PRIVATE.json
```

输入/输出root固定`/opt/naumi-staging/evidence/release47-window-20261016-main7bd`，目录及输入0600/0700；owned-media格式数组`{id,title,image_url}`，仅最多1条既有managed path只读验证。runner不打印原始email/media path/cookie，HTTP日志只存path哈希/status/body哈希/字节数。

- GET version/session，正确已有principal；不注册、不登录、不修改账户或权限。
- 本runId Skill文件multipart导入→revision PATCH→GET精确内容/可编辑/private；匿名GET拒绝。
- 包装只`action:save`，新项目→expectedRevision保存→GET精确读回；匿名拒绝；不resolve或调用model。
- 本runId文本节点→text-patch save→undo→redo，每步GET已持久节点精确读回；不动其他节点。
- 本runId 1x1PNG上传→owner bytes SHA256与**本次原始上传字节**精确相等→匿名拒绝。既有owned-media只记录观测hash和无原件预期hash事实，不冒充已有原件hash证明。
- 可写测试对象不删除，以runId隔离并记录created IDs；失败也保留report和已创建IDs供根任务判断。匿名隔离明确非跨账号隔离，不伪称使用第二账户。
- 最后version及Docker CID/image/StartedAt/hostPID再次相同；报告root内O_EXCL0600写入并重开验证。stdout只PASS/FAIL、check数、report名/hash。

## draining审阅

7bd中Skills import/storage、packaging save、canvas text/history及artwork multipart upload未调用release新claim gate；`middleware`仅internal release与continuation核验，registry scope为Agent新turn和已instrumented后台claim。因此保留candidate draining，runner不resume/drain、不调用付费/Agent接口。若真实特性权限/存储失败，原样FAIL，禁止为测试提权。

## 本轮验证状态

Node语法及Python编译PASS；4个离线协议fixture PASS，覆盖完整有限路径、匿名媒体错误公开拒绝、错误version创建前终止、精确CID/image/端口/source校验。仅本地mock协议验证，不声称生产功能已通过；本轮未执行服务器动作或重新构建镜像。
