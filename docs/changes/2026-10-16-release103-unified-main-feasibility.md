# 103容量方案调研：单普通Web三UI / 冻结匿名页换出

## 调研范围
本轮仅离线源码/已捕获证据和公开Linux文档分析，未连接103、未修改cgroup/swap、未开发或执行pause/reclaim脚本。固定业务参考6272c5e；root发现同事后继视频Dock并重建镜像后，需要在新的固定SHA复核同一组条件。本报告不把可行性当已上线或完整行为验收。

## 优先建议：一个HK普通Web提供三种URL界面

### 源码证据
- `next.config.mjs`：DESKTOP_UI_BUILD仅决定`assetPrefix=/desktop`和编译常量NEXT_PUBLIC_DESKTOP_DEPLOYMENT；ENTERPRISE_UI_BUILD仅决定`assetPrefix=/enterprise`。没有按flavor排除app页面/API的构建分支。
- 全固定源码搜索后，NEXT_PUBLIC_DESKTOP_DEPLOYMENT唯一业务读取在`src/components/desktop/desktop-transport.tsx`：值为1且当前URL在desktop时，将同域`/api/`fetch改写为`/desktop/api/`；普通build为0则不覆盖window.fetch。同runtime时直接canonical API不损失隔离之外的业务路径。
- `src/app/desktop/[[...segments]]/page.tsx`完整包含DesktopHome、create、带desktopAppearance的canvas及创作工具；`desktop/layout.tsx`始终装DesktopShell和desktop.css；`AppShell`按URL跳过普通壳，不依赖DESKTOP_UI_BUILD。因此main镜像仍有真正的desktop界面，不是把desktop重定向到dashboard。
- `src/app/enterprise/page.tsx`始终装EnterpriseConsole，主AppShell按enterprise URL跳过普通壳；Console请求canonical`/api/enterprise`。`src/app/team/page.tsx`也始终存在。
- feature-access/catalog显式把desktop页面/API归一至对应业务feature，把enterprise页面归team；main的enterprise/team权限实现已在root候选整合。运行时仍需保留本103 env/DB/私有R2，不能以普通镜像替换edition/账号配置。
- `desktop/api/[...path]`在main构建仍存在，固定loopback回同进程canonical API；`desktop/api/version`直接复用canonical handler。故旧desktop JS仍改写API时可以保留兼容路径。

### 实际变化（需要显式选择unified-main，而非偷偷换）
1. 常驻Web从3个（main/desktop/enterprise）变为1个HK普通build；Worker另起同固定业务image。desktop/enterprise两镜像仍保留固定ID/static/build元数据作为variant回退证据，不能据此声称它们仍在线。
2. `/desktop`、其所有原页面路径、`/enterprise`和`/team`不redirect，均由同一个main origin dispatch；仍显示各自壳/布局。全部API的原本统一main计划不变。
3. 新三入口HTML均引用**root `/_next/static/`**的普通build chunks；旧desktop/enterprise prefix完整alias继续按原SHA服务。这不是修改或复制旧JS使其冒充新build。
4. 新desktop不再全局包裹fetch，也不加desktop API前缀；旧已加载desktop bundle仍可能加前缀，网关/同runtime别名必须继续支持。SiteVersion独立按URL访问`/desktop/api/version`仍需保留。
5. 三variant的不同buildID收敛到一个main buildID；跨版本旧tab的RSC/导航可能发生Next整页导航，不能称零reload或内存编辑无损迁移。使用本次用户明确的维护边界，并保留旧静态，业务保存/重新打开要实际验证。
6. worker/video inline任务仍由Web `NAUMI_VIDEO_WORKER=0`关闭，单独Worker接管需root既有receipt/UNKNOWN恢复闭环。一个进程内三入口权限与cookie一致，不应产生第二用户存储或第二DB。
7. 当前renderer要求三个不同origins；应另加明确`unified-main`模式、报告oneLiveWeb/三个URLUI/普通buildID，并重新生成四CAS链。不能给三个假端口或直接手工把现有bundle端口替换后当已验收。

### 验证矩阵（复用root现有隔离DB与单HKmain容器）
|类别|必须观察的行为|
|---|---|
|构建归属|新固定main image/source/version/buildID/prefix空；实际app-paths包含desktop catchall、enterprise/team及API|
|SSR/资源|三入口实际HTML和浏览器都指rootchunks；root MIME/hash正确；旧3prefix全部URL仍原byte且缺失404；无chunk/hydration/pageerror|
|登录会话|正常原生登录后main→desktop→enterprise→team同账号/cookie，刷新不丢；logout各入口同步；匿名/private媒体拒绝|
|desktop结构|真实独立导航/desktop.css、create、canvas desktopAppearance、工具和native batchshot路径；不是只测/desktop200|
|API双路径|新desktop的canonical/API与旧desktop alias返回同身份与权限；desktop/version与release-notes成功，无二次desktop前缀；不绕过原worker deny|
|企业角色|老板/管理者/成员的可见企业、下级树、团队素材、只读统计；外企业/撤权/停用过期账号拒绝；不把EnterpriseConsole空态当通过|
|持久写回|隔离fixture内保存一个canvas文字/undo/redo及账号skill；三UI再读同DB行/账号归属，反向账号拒绝；不调用真实供应商|
|版本边界|原本已验收旧tab保存/维护结束重开回归；旧variantprefix兼容仍服务；不冒充旧RSC跨build零刷新|
|容量|896MiB Web cap+128MiB Worker cap+1024MiB真实余量=2048MiB最低规划；测真实peak/events/PSI与DB/媒体路径，非仅启动成功|
|回退|保持原CID/image/env及103独立数据；四CAS链与静态字节恢复；回退前释放本次新槽预算，原完整fallback进程恢复后才恢复原配置|

**源码结论：可以进入单HKmain三UI行为验收。** 这比冻结旧Agent再加三Web更直接减少常驻预算（3840→2048MiB），但当前root只读1045MiB仍差约1GiB，仍需真实容量闭环；不能把节省两份cap直接当已可发布。

## 备选实验：暂停历史UI并主动换出匿名页

### 内核支持不是“有memory.reclaim文件”就充分
- 当前现场只证实cgroup v2可读memory.current/stat/events，未证实memory.reclaim语法、swap控制或freeze支持；root另行只读核验uname/cgroup。
- 实际查阅Linux官方v5.19/v6.1/v6.6/v6.8/v6.9文档：memory.reclaim存在，但文档明确只接受字节数，**不支持nested keys**。最新kernel.org文档已列swappiness；因此发行版内核版本/补丁必须匹配，不能看见该文件就直接写`swappiness=200`。
- 最新文档说明：swappiness范围`[0-200,max]`；200不是“只回收匿名页”的保证，`max`才文档定义仅anon，而且不是所有内核都有该枚举。若语法/权限不明则先保留原状；独立空cgroup语法探测也属于写操作，需要另设受控实验，不能冒称只读核验。
- memory.reclaim可能多回收/少回收，少于请求可返回EAGAIN；主动reclaim不是正常压力信号，不会因此触发socket memory balancing。

### 必须只读确认的条件
1. 目标CID/PID/cgroup真实归属及祖先；cgroup.controllers/subtree_control有memory，非root专属误操作；Docker可报告Paused且cgroup.events最终frozen=1，冻结不是命令返回即所有进程已静止。
2. memory.reclaim存在及确切内核/发行版文档支持所需nested-key语法；memory.swap.max/current及所有祖先swap限制、memory.min/low/high/max、memory.events、memory.stat anon/file/unevictable、memory.pressure/io.pressure。
3. host已启用swap、真实可用swap、磁盘可用/文件系统支持/非稀疏swapfile、I/O延迟和持久盘可靠性。当前旧swap几乎耗尽，不能以“已有1.4GiB swap”当可用空间。专用swapfile也不是每cgroup绑定设备；swap priority属于host，全机其他任务也可能使用。
4. 进程不是DB事务/跨槽锁持有者，无必须及时续约的Task/Agent/供应商HTTP。即使保护内存态，也必须审阅其外部时间依赖。既有DB/Worker不冻结；原API核心13012/13038/13027及Fleet不纳入。

### 主要风险与预算边界
- 冻结保留虚拟地址/堆，不保存“外部世界”。时钟照走，租约/供应商结果/超时/会话到期继续；DB连接/未提交事务可能持锁影响原Worker和新Web，unpause后可能遇断socket、expired lease、重复恢复竞争。换出不是Agent业务一致性备份。
- mlock/unevictable、kernel/sock/page tables及共享页可能不能按期望回收；memory.current变化和MemAvailable增量可能不等，不能拿anon总量、swap容量或原peak充当可用RAM。只用稳定后的真实MemAvailable判断新cap+reserve。
- freezer不免疫host OOM/管理员操作/daemon重启，增加swap也不提供这种保护。高I/O可引发磁盘与DB延迟，unpause时page-in风暴会再次耗RAM；需要逐一恢复和恢复容量，不是批量unpause。
- swapfile会承载进程内存中的密钥/会话，0600只限制文件访问，不等于静态加密；不得打包上传swapfile或将其当普通临时文件删除。
- 不能通过降低旧memory.max逼回收，不能为“完成实验”制造OOM或强制kill。EAGAIN/语法错误/PSI或I/O恶化时保留原caps并停止推进；已经进swap的匿名页不能为回滚轻率swapoff。
- 恢复顺序应先阻止新录入，处理新槽accepted ownership，给旧槽page-in留实际RAM；按记录精确CID逐一unpause，观测memory/events/PSI/DB/外部receipt及登录。恢复运行不等于外部租约/Agent状态已自动恢复正确。

### 现有工具
仓库只有`scripts/ops/provision-emergency-swap47.py`：硬编码47证据路径/三锁、拒绝任何existing swap、仅ext4/4GiB、持久fstab事务。它既不适用103已有swap，也没有pause/reclaim/逐一恢复编排。当前没有可直接复用的103冻结+reclaim执行器。本轮未开发新执行器。

### 公开资料
- https://raw.githubusercontent.com/torvalds/linux/v6.8/Documentation/admin-guide/cgroup-v2.rst
- https://raw.githubusercontent.com/torvalds/linux/v6.9/Documentation/admin-guide/cgroup-v2.rst
- https://docs.kernel.org/admin-guide/cgroup-v2.html （memory.reclaim/swappiness段）

**判断：冻结+换出只适合另行受控实验，不作为默认保护未知Agent的可用性承诺。优先验证单main三UI，然后再按真实进程职责/容量决定少量旧UI是否可退役；两条路线都不允许伪造drain=0或重放已接受任务。**
