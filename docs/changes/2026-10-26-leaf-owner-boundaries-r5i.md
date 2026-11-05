# R5I：跨域叶能力与协议合同归属

## 基线与目标
独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。完整基线 `23e8ab63d46fa909855505705a34b27a22c7f20d`，4368原始文件SHA256已归档。开工fetch origin/main=`73384aaa5d1547de84586de437dc1375257225c8`。本模块为最近同步后第3模块，模块提交后普通整合main；不合回main，不部署。

目标不只是把图上的环藏起来：调用者需要bytes就读取字节owner，需要元数据就读取元数据owner，不因错误类型、项目归属或签名合同而装载完整编排/注册/发布事务。

## 实现
- `object-storage/runtime.ts`持原配置、backend、签名、字节写入/读取、镜像/路径及删除机械实现；无数据库、媒体注册和变体调度。
- `object-storage/managed-read.ts`保留完整远程优先/待补传原镜像/哈希与大小核验/远程故障fallback，元数据从只读owner读取，不调用媒体写入编排。
- `media-upload.ts`保留原上传/必要注册；`media-assets-reader.ts`拥有媒体事实类型与原两个查询；media-assets保留原注册/variant/补传事务。storage原16公共导出同函数兼容；77个字节/媒体只读消费者直接改绑（另一个3D浏览器storage不属本模块，自动改绑误匹配已按原字节恢复，初始tsc失败保留）。
- `canvas/project-access.ts`拥有原authorizeVideoProject，`project-key.ts`拥有原key schema，视频/Agent/复制/删除等消费者不再通过完整节点编辑服务检查归属。
- `teams/errors.ts`拥有同一个TeamError构造器；归属、账务/HTTP错误映射与企业服务直接引用，不反向依赖team管理编排。所有原限制/状态/消息保持，不新增护栏。
- `fleet/release-contracts.ts`拥有原发布manifest/命令schema；签名wire不再引入发布repository/dispatch。签名、冻结、租约、unknown及默认关闭行为保持，不执行发布。
- 7194个原生产声明对照保持（37迁移，2个动态import仅改目标，6个内部helper为跨owner使用加export）；函数算法、SQL/参数、权限、账务和任务执行不变。最终精确计数以BUSINESS_COMPARE.json为准。

## 集中验证
- emitted静态环2→0、全导入环4→0；含8个新owner的整个已扫描生产源码图无新环。扫描限字面import/export/dynamic import/require，不把SQL/HTTP关系称为不存在。
- 实际叶bundle：raw输入22→8；发布签名wire1778→98。新版两者不引入media写编排、发布事务或PG/SDK。兼容storage16及其它跨owner导出同一函数/类/对象，实际Ed25519签名/验签和篡改/实例/过期负例通过。
- 团队授权/子账号、私有媒体上传/归属/变体、local回退、统一对象存储、项目原回执、Fleet派发/治理的完整旧新对照通过。两旧视频全站fixture缺Router环境，在基线和新版均InvalidURL/setup失败，保留；没有跑真实付费供应商。
- 新增项目/素材PG用例：完整旧新各33检查，六种项目来源、跨账号/不存在/非法key、真实PNG/哈希、并发导入一份、内容冲突、媒体类型/URL冲突、项目删除后原回执仍返回、零consume/外网。
- 旧存储fixture按完整新owner解析依赖，不投影函数正文；同夹具两侧远程优先20和真实loopback黑洞/慢写/本地持久/校验补传20检查通过。
- 类型、Worker/Web/相邻与副本回滚、patch、四产物、main整合和最终提交以本轮VERIFICATION/DELIVERY为准。此前失败日志不改PASS。

## 未完成
本模块不是完整重构完成：外围Canvas UI/多tab-CAS、全产品同SHA候选/benchmark/性能/容量/CI和最终主线整合继续。旧兼容出口登记给历史调用者/测试使用，实际生产消费者已按本轮范围改绑；其它未知字符串/运行链接不包含在静态图归零中。

实际Linux图片Worker71、Next15.5.27六入口20、完整TypeScript/变更lint/Worker build及diff检查均exit0；Worker2350输入/HTTP route0。新旧存储/项目/TeamError/Fleet边界行为没有新增业务限制。
