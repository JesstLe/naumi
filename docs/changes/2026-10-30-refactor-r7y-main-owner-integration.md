# R7Y：主线缓存、企业事务与回执读取 owner 整合

## 基线与目标

独立目录 E:/Workspace/naumi-refactor-20261024，基线0dce74e21bb00cd90efcd5aa95032650a51d86c3，完整5206原始文件hash及tar保存。普通整合固定origin/main e2f562556ea6e71370619686e1fc8d4c634ef5e7的5提交；整体重构仍ACTIVE，未合main未部署，47 HOLD。R7V同步后第三模块，本轮整合后计数归零。

## 真实职责与冲突处理

- 缓存：沿原BrowserCacheStorage/VerifiedImageContentPool接需求驱动恢复和已重新授权源的热字节复用；保留workspace epoch/账号分区、来源授权、字节预算、独立持久key以及不伪造内容hash。没有新加缓存系统。
- 素材：新input-asset-reference只查owner/key/mime，事务入口可传现有PoolClient，查询不再二次借池或读取媒体体；企业历史在事务前初始化schema，原renderer在COMMIT/release之后读字节。新入口依赖platform pool与原media schema owner，保持单向依赖。
- 数据库：db/connection保留兼容出口；12秒pg原生checkout期限迁到唯一platform/db/pool，不恢复旧连接实现或扩大budget。tick3秒与其它池配置不改，事务原错误与UNKNOWN不重试。
- Canvas：保留现有image-task-controller，页面不恢复两套旧轮询。30秒期限覆盖单次原job GET和body；传输失败只在原6分钟循环内继续同job GET，terminal/HTTP/非法JSON仍保留原退出语义。原结果的节点版本恢复同样使用该一次有期限读取，失败保留原任务、不再POST。
- 三冲突是canvas-client、db/connection、input-assets。前两者保留现有owner并把修复接到真实消费者，第三者保留managed-read/creation-access边界并复用新元数据接口。完整五提交进入普通merge，不只挑选补丁。
- 清理R7X新增两条canvasSelection effect依赖warning，使用稳定命令引用，不添加对象依赖触发循环。历史R7X真实lint39条，之前文档/回复37口径错误，本片纠正记录，不反写已封存旧日志。

## 初始定向模块验证

实际enterpriseRead/HTTP/renderer受控端口验证借池0/事务内bodyReads0、四并发、allowedEmails拒绝、schema在BEGIN前/媒体在release后；真实pg队列12秒超时、waiting0、再checkout通过，但物理client是stub，不冒充PG锁环实测。controller实际函数捕获headers/body各一次挂起、网络异常、pending→done，5次同job GET、原submit1；terminal/http/JSON/deadline/context、替换节点原结果三次只GET均通过。原图片任务47/177、主要入口57/129、完整tsc通过。基线/修改版、全core/完整Linux候选与最终四产物将在封版补齐，初始定向通过不替代完整通过。

## 测试与状态归属

复用现有incoming verifier并适配重构后的模块路径/真实controller；原main两个旧页面for-loop仍作为其兼容分支保留。已有图片fixture区分2500ms轮询和30000ms单次读取期限，并将原“第一次网络错必须人为点重试”改为当前同job自动GET后交付的合同；真实paid POST仍恰好1。

新增两项进入同一refactorCases/runner，不另造框架。完整核心使用同盘已有依赖、同SHA的自有本地Git副本，避免旧C源码/E依赖跨盘webpack假故障；所有源码hash需前后核对。Linux构建仍沿生产Dockerfile，runtime沿原完整core同SHA/digest门禁，不能以证据并集冒充runner PASS。

## 后续与未完成

本轮继续完整固定候选。历史Windows dev提前退出、性能容量、远端required CI支付/限额、最终普通合main与整版退出不随模块通过消失。四产物、基线/修改/独立副本回滚、later-edit零写入和source桥接以output/refactor-r7y-20261030/DELIVERY.json为准。供应商/服务器/生产数据操作0。


### 首次完整core的验证脚手架闭环

首次固定dcca528a完整core在13 PASS后，被新增缓存效率第10例阻断，原REPORT为FAIL/13PASS/1FAIL/146NOT_RUN。原版同probe也出现同一控制项失败，不属于新增产品回归。实际Edge/IndexedDB诊断显示所谓“已等双store持久化”之后仍只存在A的记录；异步predicate的Promise被waitForFunction视为真值，未等实际boolean。改成expect.poll等待page.evaluate返回的boolean，确实核对B的bytes与metadata后才reload；原版13项中仅预期5缺陷（exit1），新版本13/13（exit0）。此修正仅验证脚本，不改缓存产品、不降低“刷新后零额外下载”断言；失败日志与临时诊断保留。

同盘完整Git副本初始raw CRLF与index stat口径导致status列134项而git diff为0；仅在自有副本对tracked index重新规范化后确认cached diff0、raw bytes逐hash不变、Git clean，不用assume-unchanged。一次Windows全路径参数Win206及显式ignored路径尝试均在准备期退出，改用仅tracked update；产品目录没有受此变更。


### 第二轮核心 fixture 合同迁移

固定6fe9f19完整core在28 PASS后由fanout旧fixture中“第一次GET网络异常应留失败卡”断言中止（0!=3）；当前原job自动GET后成功，产品行为正确。将fanout/activity同类用例改为断言同job两次GET、paid POST1、attachment1；UNKNOWN POST仍保留原失败卡与明确恢复。version与placement VM原来没暴露浏览器AbortController，实际失败message已取证为`AbortController is not defined`，补标准浏览器全局并区分30秒期限与2.5秒轮询timer，不替换产品helper。定向fanout15/version9/placement6与activity通过，原失败日志保留。最终完整core必须在新固定SHA全部实跑，不拼接旧28项称PASS。

### 第三轮完整验收阻塞定位

固定e9832131完整core为84 PASS /1 FAIL /75 NOT_RUN，native-actions旧VM缺少R7X的canvasSelection.selectInProject端口，原生节点已保存而reveal抛错；补齐被调用的独立view-owner观察端口，不恢复页面选择实现。完整生产镜像构建PASS；完整产品浏览器已通过生成/扣费/冲突/重载/180秒混合读/剪贴板/创作模式，随后快照辅助进程触发40P01。DB原日志确认新起observer调用listCanvasTextNodes触发ensureSchema，ALTER与运行Worker形成锁环；observer改为只读REPEATABLE READ事务和既有纯mapper，DDL只在setup中运行，没有修改产品SQL或添加事务重试。最终全core与同镜像浏览器仍需新固定SHA实跑，旧失败材料保留。一般冷进程兼容DDL是否仍需整体迁移不因observer修正而关闭。
