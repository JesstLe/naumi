# 六历史UI维护idle退役：旧源码精确观测语义

本轮仅离线源码分析；不连接103，不修改代码门槛，不执行stop。用户最新“现在就上线香港”的单CID操作与风险判断由root持锁负责。本报告修正先前工具过于一般化的“完整Next含Agent API即拒绝”门槛：**API能力存在≠正在执行Agent；六槽历史仅分配UI/读取职责，应按当前idle证据决定，不要求它们永远是删光API的纯文件服务器。** 旧工具未被静默放宽。

## 1. 核对的真实业务版本
13028/29/30对应b243f5ed703c00e46410808d05932559ed654dad；13031/32/33捕获源码3bbebee2cfe31e884268c539373b81afff263207。两版本下述6个文件字节相同：

|旧源码路径|SHA256|关键行|
|---|---|---|
|src/lib/agent/harness.ts|858b7e703e7e80aa1f021ed63b23be9a35174b2662a5d3f578ae0706f7d0460e|60—61 ID验证|
|src/app/api/agent/route.ts|94d2262ceb3fc2df1dfcf52038c8833d3ce4ec2278c7c169018d8b3d5f1f8fc5|128—129 PUT初始持久化；302—320 runtime GET；349 POST默认ID；376开始running；406 finally持久化|
|src/lib/agent/runtime.ts|390281eb2249d9846414183b2d02cf5d61107418e0d2edea61dcabfc590aeaac|122—123 Map/CREATING；228—234创建；441 agent_start；474注册；482 GET；507刷新凭证；529—553持久化|
|src/lib/agent/canvas.ts|ed58b842cb81e2805418b6af9c42d34ef2a9e5acbf75fe2224a0db622df04196|91创建；101—102初始持久化；124 prompt；152 finally|
|src/lib/agent/canvas-history.ts|48df8cf3e3112b2768de16a02ac370ff8f5ec81538875c782e6e493cf9ac5771|12 GET授权；31 DB读取；48 running||canvasExecuting；55输出|
|src/lib/video/worker.ts|0cd2688d84a0933d1fb08b7163d072595d5b4986e0c665ac407ca0379c1bf246|35—36 worker0直接return|

使用`git show <实际业务SHA>:<path>`读取，不用最新0614的release registry/owner代码冒充旧槽行为。

## 2. 逐个问题的精确答案

### session ID是否只能ag-*？tmp是否仅fixture？
不是。harness60—61接受`^[\w-]{1,64}$`；workbench仅排除cv-*，不强制ag-*。PUT使用客户端ID（最多64字符）或自动ag-时间随机数；POST使用客户端ID或ag-once-UUID。故**tmp-xxx从已鉴权旧公网Agent API在语法上合法**，不是只能fixture调用；但正常工作台默认路径生成ag-*，canvas将输入归一为cv-*，本轮没有证据表明六UI实际运行过tmp会话。不能把可能的tmp直接写成观测到的live任务。

runtime529—530明确对tmp-*跳过持久化。所以直接DB会话全集不严格等于内存Map全集，这是GET覆盖的一个已知残差，不是禁止所有完整Next的理由。

### PUT/canvas是否prompt前已await初始persist？
是。普通PUT128—129在设running=true后await persist，之后才构建SSE并prompt；canvas101—102同时设running/canvasExecuting=true并await persist，124才prompt。非tmp正常这两入口在开始模型执行前已有DB登记。canvas finally152仍在await最终persist后才canvasExecuting=false；因此canvas-history GET检查两字段有价值。

### 一次性POST ag-once是否同样初始persist？
否。POST367创建session，376设running=true后直接await prompt，finally406才await persist。runtime441的agent_start订阅只设running并推内存事件，**没有持久化**；message_end/tool_end/agent_end会异步void persist，不能拿它当开始前持久化保证。因此尚未产生任何可持久输出的oneshot存在DB未登记窗口。运行中的正常POST通常保持入站HTTP，并有模型出站活动，所以全netns持续静默观测能降低这个风险，但不能把DB枚举称为全Map枚举。

### CREATING是否只由HTTP触发？30秒无连接能否排除？
全版本调用点只有workbench PUT、POST与runCanvasAgent三处；没有周期timer自主getOrCreateSession。228—234对创建Promise放CREATING并由HTTP handler await，最后finally删除；创建完成474才放SESSIONS。

因此阻止所有新入口后不会凭空周期产生新Agent；维护前尚在创建的HTTP通常可由入站/DB活动看见。**但30秒不是源码保证的创建超时**：createRuntimeSession不接request.signal，会await配置/DB/动态import。PUT在创建后没有立即检查已aborted信号，晚注册abort listener不会回放既往abort；旧canvas在SSE内有`if(request.signal.aborted) cancel()`检查，POST创建后也有aborted检查。故HTTP已断但Promise尚未返回是PUT的具体残余窗口，不能用“所有CREATING永远有可见入站socket”作形式证明。

### runtime GET/404实际证明什么？
- 正确账号直接访问**目标旧CID回环端口**`GET /api/agent?sessionId=<id>&since=0`：200的running来自该Agent route的getSession；已知404“会话不存在或已过期”意味着**该owner/id在该路由运行时Map不存在**。这条404可以接受为已知ID没有liveMap项，不应一律标unknown。
- 同一个GET会`refreshSessionCredentials`并更新lastUsedAt；它不生成模型任务，但不是严格内存无副作用。必须用正确owner身份，不拿admin身份假代别人。401/403、超时、HTML404、请求打到core/其他CID、source/版本不匹配均不能当idle。
- workbench GET明确拒cv-*。不能把cv送此入口后的400算Map空。
- cv使用`GET /api/canvas/assistant?id=<cv>&projectKey=<key>`或anchorId。旧canvas-history48实际返回`getSession.running || canvasExecuting`；必须有正确owner/当前project或anchor授权、DB持久会话。项目不匹配/素材被删/权限失效也返回404，因此cv的404必须按response内容与所有权校验区分；不明原因保留该CID或该未闭合工作归属。
- `GET /api/agent/session?id=...`读取的是DB历史（仅await已有persistPending），不是普通Agent运行状态查询；列表默认50且过滤cv，也不是完整枚举。应由只读DB全量分页枚举`(email,id)`及cv的project/anchor上下文，核对计数/无截断，再逐ID命中对应runtime GET。
- 普通GET的running=false不包含canvasExecuting/persistPending/toolResultsPending；后续应结合已知sessions的DB历史稳定/终态及PG事务/持久pending工具记录，不以一个bool替代所有业务状态。

## 3. 六槽具体职责证据，不推断“永不可能有Agent”
旧`scripts/deploy-image-cache-slots.py`的render_gateway明确跳过普通及desktop `/api/*`（只有版本/精确media/cache读取特例），保持原creation/Agent/Worker指向core；start给三新槽NAUMI_VIDEO_WORKER=0、固定loopback且不赋app业务别名。`deploy-canvas-performance-slots.py`明确20条UI/static/只读media/version位置，其他location不改。现完整Nginx六槽仅各一个named静态fallback引用，20个旧static已完整文件化。

这些是六槽“实际被分配只读UI”的正证据，足以把它们列为**维护idle候选**而非core；不需要镜像中移除所有Agent路由。仍须把原创建记录/实际CID/image/源SHA/当前原始Nginx和root本轮all-Docker/systemd/internal alias审计绑定，特别检查直连loopback、容器IP和误配置的INTERNAL_APP_ORIGIN。历史文档不是全生命周期网络隔离证明，但本次维护idle策略也不应要求不可能补齐的终身零能力证明。

## 4. 建议的可实现maintenance-idle例外
这条策略应显式名为`legacy-ui-maintenance-idle-v1`，与普通complete-drain及现有“结构纯只读”审计分开，**不得静默改旧工具或签假receipt**。

1. root持锁固定六CID逐项清单；core13012、生图13038、企业API13027、原Worker、Fleet和其他未知角色不选。保存restart/image/env/mount/network/原static及可读本103备份。
2. 上传并验证file-static完整原URL union；先CAS切维护503、旧静态/Fleet保持。核验当前已file-static维护，旧Nginx worker与任何internal/loopback任务入口不再录入六槽；外部API仍未证明被完全阻断的该CID先不退役。
3. 对六槽的源版本、timer0、标准Cmd及进程树；all-Docker/effective-systemd/internal alias/config引用逐项审查。持续采集至少30秒间隔两轮（优于仅两个瞬时点，记录sample间隙）所有netns inbound/outbound与loopback连接/字节、CPU/进程活动、PG active与idle-in-transaction，排除probe自身请求但不误去除业务socket。
4. 从同一个只读一致snapshot取得**全部**已登记`(email,id)`，含cv及上下文，另并入accepted任务/ledger中能提取的session IDs；root已保护所有动态核心未知工作。每个候选旧进程、每个已登记ID两轮runtime GET，保留正确principal/source/CID/状态/正文hash；200仅接受known running=false且终态/持久记录稳定，workbench特定404可记ABSENT_KNOWN_ID，cv需语义区分。
5. 核对完整task/ledger/accepted upstream/frozen payload前后保全，不能只看“状态行数没变”；已接受调用仍由原core/Worker负责GET恢复，不因退役UI重复提交。发现某slot实测running/非idle业务socket/PG事务/未落库输出/归属不清，**保留这个slot**，不是扩大停核心。
6. 上述全部已知观测idle时，可交root判断该单CID是否符合用户授权的“终止纯UI渲染的短维护idle退休”。记录`coverage=partial`、known-session枚举总数/结果、原角色证据、30秒实际静默区间、残余tmp/oneshot/CREATING注册盲区；不可记录complete=true或unknownAgent=0。
7. root若决定该partial证据足以进行本次单CID维护动作，graceful stop不升级SIGKILL、保留容器/image、restart=no，立刻复采资源和paid/task保全；失败原CID逐一start/version/health/static复核，完整旧fallback恢复后才回原配置。容量达到真实2048MiB门槛即止，不为整齐继续停。

## 5. 是否“足够”的精确判断
- **作为显式维护idle决策证据：具备可实现性，而且比一律因Agent API存在而拒绝更符合六槽角色。** source支持正常PUT/canvas先登记、GET逐已知ID有真实Map语义、创建仅HTTP驱动；角色路由+current引用隔离+静默/事务+paid保全可构成有分量的partial证据。
- **作为“全部非持久Agent绝不存在”的严格保证：现有HTTP GET仍不具备全Map/CREATING枚举能力。** tmp在语法上合法但未证实使用、oneshot初始登记窗和已断HTTP的PUT创建窗是具体残差，不应被写成已观察活跃任务，也不能虚构为零。若root要求这一强保证而非本次partial维护例外，需要已存在的进程内完整枚举/注册证明或额外真实观测；本轮不注入/重启旧进程来造观测。
- 任一已知session/paid调用的归属或持久化不闭合，保留对应动态核心和有关UI；保全证明不能通过“连接为0”补写。

本报告没有把旧工具的终身pure-app-path门槛改成通过，也没有宣称六槽已经通过本轮现场idle审计；root可据实测结果和用户当前维护授权逐CID判断。root新只读MemAvailable1072MiB/SwapFree0由其采集，本子任务未核验或改动现场。
