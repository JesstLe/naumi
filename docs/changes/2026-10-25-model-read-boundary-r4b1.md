# R4B1 — 已发布模型读取与管理组装分离

## 基线与目的

- 独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整基线 `3b00e8bc4d1e3f0b451c75453b3564b940f9870b`，4214个原文件的字节与SHA保存在 `output/refactor-r4b1-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。
- 本轮不是统一配置中心或DI容器；目标是普通目录/方案读取不先装配后台、Router管理、legacy discovery和DDL。新库仍保持现有首次初始化能力。

## 实现边界

1. `published-repository.ts`只SELECT已发布active/current或历史版本；current不跨请求缓存，历史版本沿原64项不可变缓存和私有clone。
2. `snapshot-value.ts`承接原canonical/digest及共享decode；发布repository与只读reader用同一schema、摘要和版本校验，避免两套解释。
3. `lifecycle.ts`承接原管理组装中的schema/credentials/legacy导入/首次bootstrap，保留原锁、事务及失败重试；管理server在它之后才装配billing与发布runtime。
4. `published.ts`只在确无registry时调用首次使用兼容初始化；已有pointer损坏、缺失历史版本、坏digest及sidecar不触发seed，不把已受理工作切到current。
5. `public-catalog.ts`、`simulation.ts`承接纯目录和模拟；原runtime保持同函数re-export，实际消费者直接引用新owner。
6. legacy image目录与managed目录分离；bootstrap不再反向读取managed facade。调用者已传模型snapshot时直接使用，不再无条件获取管理runtime。
7. imagegen能力与video目录实际HTTP消费新读入口；视频冻结sources、原价、身份/素材权限及执行可用性链保持。

## 非本轮完成项

真正空库仍可由首次请求触发兼容initializer；完整Web/Worker显式启动生命周期及所有热路径DDL退出仍属后续R4B，不把warm SELECT-only扩大为全站只读启动。实际执行、后台发布、billing/bootstrap和其它域仍有自己的ensure。

## 结构对照

- 原模型组装8文件动态环已拆开，原静态6文件环也已拆开；新增读/纯计算/生命周期模块均未进入环。最大20文件视频环、图片恢复12与身份/creation/billing7仍在。
- 生产静态引用重型model repository由14处降为1处（生命周期组装）；快照reader和managed图片目录到管理server的2条直接边归零。
- 20个抽出声明及environment parser完成原正文AST对照；28个其他原源码文件178个保留声明保持。repository decoder规范化只针对抽出的原快照校验，实际坏版本/摘要/指针用PG负例核验，不把新读取行为藏在AST比较里。

## 集中验收

输入：`DATABASE_URL=postgresql://fixture:fixture-local-only@127.0.0.1:65454/naumi_refactor_r4b1_fixture`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NODE_OPTIONS=--conditions=react-server`。

```powershell
node --conditions=react-server --import tsx scripts/verify-model-read-boundary-pg.ts --baseline --source-root output/refactor-r4b1-20261025/baseline
node --conditions=react-server --import tsx scripts/verify-model-read-boundary-pg.ts
```

- 完整基线 **8部分75检查**、新版 **8部分80检查** 均exit0。基线PASS包含原读写耦合的预期复现；不是旧只读模式正常。
- 种子在另一个进程创建后退出，读侧模块/schema缓存真正冷态；旧读取在`default_transaction_read_only=on`中尝试CREATE并失败（PG25006），新版current/历史/图片目录全部SELECT-only通过。
- 已发布配置存在而管理token缺失：旧snapshot/已提供snapshot的图片目录都受ROUTER_UNAVAILABLE影响；新版正常，提供snapshot的目录额外SQL为0。
- 管理端draft/save/stage/markApplied实际更改pointer：读侧及时返回新current，stage未applied时仍旧版；历史版本不漂移、clone不互相污染、warm历史8路不重复查版本；受理bundle中已传snapshot不重读。
- NULL pointer、缺失versions表、坏digest均报错且不seed；历史版本不存在不切到current。真正空库的Router discovery失败、真实PG插版本失败分别重试，凭据/版本回滚不留半态，8路并发只生成1个active版本/publication。
- sidecar缺表不写DDL；实际imagegen能力/video目录HTTP形状保持，读侧模型DDL从旧有变为0。此结论不扩大到认证、账务等其它域首次ensure。

相邻管理/元数据/工具作用域、模型发布恢复、wallet/entitlements、195登录handler、任务3/226、内容7/290、商业6/164、持久化6/78与29/90、平台PG29均通过。视频frozen sources用其要求的独立DB `naumi_video_fixture_r4b1` 验证，真实双入口8用例16检查、原control10退化通过；不是把数据库名校验删掉。

原preparation回归的统计与mid-publication故障注入从admin.repo.current spy迁到实际active-pointer SELECT：新旧入口用同一观察器，均45检查通过，仍要求每笔报价1次读取、发布中途不混价、原3积分合同在current17积分后交付、原历史计划可执行及消费不重放。供应商是loopback PNG fixture，两次本地执行，外部调用0。纯preparation结构14与imagegen capabilities回归通过。

全项目tsc与本轮39个TS/TSX文件lint通过。未运行full build、产品浏览器或容量验收。

## 保留的失败记录与修正

- 初次源码编译发现legacy helper依赖currentModelExecution未迁入，补导入；TS verifier的ProcessEnv默认值/this注解同时修正。
- 主verifier初轮错误预期旧PG25006为领域码，漏掉原`edit:[]`响应；修正fixture后8组集中通过。初始7组65/70结果与最终8组75/80分开留存。
- preparation旧spy不再观察新SQL入口，先暴露计数0；改实际SELECT后又发现publication spy在Client callback层错误串接Promise导致double-release。两边同样失败，生产源未因此修改；改在Pool Promise边界等待读完后发布，并排除注入本身的读取、继续统计报价后续读取，最终新旧均45通过。
- frozen-source首次传入普通fixture DB被名字校验拒绝，创建专用DB后通过；原退出码和日志保留。

四产物、副本回滚、提交推送及清理的最终实际命令/字面结果见 `output/refactor-r4b1-20261025/VERIFICATION.txt`、`DELIVERY.json`。本轮是main同步后的第1模块；整体重构仍未完成，不合main、不部署。
