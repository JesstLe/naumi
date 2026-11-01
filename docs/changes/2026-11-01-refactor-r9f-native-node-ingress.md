# R9F：原生节点入口身份归属

## 目标与现状

整体目标继续是完整模块化重构，不把验证资产变化计为产品模块。基线 ba497560、5344 个原始文件已归档并逐文件核对。R9E 的主题重载失败保持 OPEN；本轮原97断言分别在协议日志、CDP观测、仅失败后启动的延迟探针下通过，原失败没有被覆盖，唯一根因未证明。一个诊断准备错误（CDP frame.url 被当函数）已保留，临时 tsconfig include 按精确基线恢复、自有进程及端口确认退出。

新 head 的 Image gateway CI 已确认为 npm run build 步骤失败；日志下载在 GitHub 元数据之外遇到 TLS EOF，不能据此推断编译根因。该失败与主题问题分开，不恢复已删除的积分确认。

## 模块与职责

音频、角色、场景、导演台、多轨的 withCreationRoute/withCreationReceiptRoute 已完成服务端认证，内部读写处理器仍重新调用 authenticatedEmail/authorizedTargetEmail。此次消费同一请求已认证 actor，不增加全局缓存、ALS 身份推断或新鉴权框架。

- 公共 request-auth helper 仍负责身份规范化和目标授权；undefined 表示未解析（无DB入口沿原逻辑认证），null 表示已知匿名，不再次查询。
- 创建包装器仍负责当前企业/项目归属；管理员跨账号只读仍执行真实 requireAdmin，不能用已知普通用户身份代替角色检查。
- 各 node-service 继续拥有 schema、CAS、操作幂等、素材归属、事务和任务状态；不改价格、模型、表结构或媒体执行。

## 验证计划与当前边界

新增实际 HTTP/原生签名会话/隔离PG的对照脚本，先在完整基线上复现重复认证，再实施并集中检查正常CRUD、原operation重放、CAS冲突、管理员代查、跨账号/跨站、账号撤权、无DB语义及动作负例。普通结果投影应 EXACT，认证SQL按实际观测记录。已有整版结果只属于R9E，不标成当前候选通过。

实现、实际结果、失败及剩余工作随本轮更新。整体 ACTIVE；main 未整合、部署0、47 HOLD。

## 实现与首次集中对照

15个原生节点Route、25个处理器消费包装器的已认证actor；request-auth helper增加可选server actor，只有undefined沿原认证解析，null不再重读。普通CRUD、角色仍用原实现，requireAdmin分支未移除。初次基线/修改版各95个实际HTTP/native签名/PG加20个无DB Route场景，合计115场景238检查通过，普通状态/节点/CAS/管理员目标投影EXACT，普通认证SQL2→1；管理员跨账号检查3→2（保留独立requireAdmin），无DB20个401语义保持。

两个fixture准备错误均保留：测试密钥不足32字符；新建三个账号的原始赠额账务被误断言为全库0行。已改长fixture常量，以及调用前后整组账务记录精确比较；未改生产密钥规则、赠额行为或余额校验。补充管理员角色撤销、并发账号隔离和并发CAS，随后统一集中验证。

Image gateway构建仍执行原npm命令与原参数，新增保存commit/工作树路径列表、完整原日志、失败末尾40行到8000字节的GitHub错误注释，以及always上传；原exit保留，没有continue-on-error、增加预算、放宽测试或推断旧构建失败原因。既有runner用明确npm fixture的两个真实Bash子进程检查0/7退出及日志、百分号/换行注释语义；不是实际Next构建通过证明。

## 最终固定源码集中验收

应用/验证源9ba80e10ed5135e5eeb20cc4c57c93cfb090aa71：原新98实际HTTP/PG＋20无DB Route（118场景244检查）、正常投影EXACT；当前216完整单次PASS，0失败/未运行/复用。同源App/SDK、runtime177、browser92/routeMocks0及450秒混合165/12/177/1014通过，capacityClaim=false。类型5092输入+4配置、非增量tsc0、lint0/37既有warning、四SCC0。

普通认证SQL2→1、管理员跨账号3→2；计数不含middleware及其他SQL。角色撤销、并发账号隔离/单CAS胜出和20个无DB401通过，账务前后整组记录不变。源码16产品路径变更，其余2125原产品字节相同；原5344文件保留，当前5346。副本回滚、精确旧行为、完整补丁和四产物以最终VERIFICATION为准。

第三产品模块后fetch/merge origin/main e2f56255已包含，计数3→0；未写main。旧ba497的两个远端CI已FAIL，不把本地完整PASS或CI日志接线当作远端修复。新head状态在DELIVERY/REMOTE_STATUS；main未合、部署0、47HOLD，整体ACTIVE。当前主题97及原生链通过不关闭旧间歇首因。

验收元数据源292e24f5195e5d416121105a45cff1836a61930f：2个真实子进程的case目录端口及118正常投影EXACT检查通过，报告保持PARTIAL/exit2。完整216仍明确归9ba应用源，不把日志重标为元数据源；最终head需新CI实际整版通过。只读Core失败报告器5场景18检查通过。首次报告合同fixture误把Windows CRLF当LF，原失败留存；随后显式LF/CRLF两输入都验证，报告器本身未更改。
