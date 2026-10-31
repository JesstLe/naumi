# R9B：历史生成入口的完整身份传递

## 模块、职责与依赖

历史 `/api/generate-image` 保留原 JSON/multipart 解析、自动画幅和 Worker/高级步骤分支。认证结果由提交回执或 HTTP 入口取得，通过现有 callback/参数传给 BI、模型适配、报价适配及领域 actor port；不引入 ALS 身份缓存、全局权限缓存、身份容器或新任务系统。

- `withBillingIntent` 继续唯一拥有原请求指纹、claim、pending 和原响应回执，新增 claim 成功后的 actor callback 参数；旧零参 callback 保持兼容，已有响应仍先返回。
- `withBiRequest` 在已有认证、creation/continuation/model 包装中显式传递 actor 给 callback 与 model adapter；没有改变观测/作品来源归属。
- model/opaque quote/signed version 与 billing HTTP facade 消费可选服务端 actor；undefined 保留旧认证，null 是已确定匿名，不重新解释成其他身份。MAC、expiry、owner、scope、输入数量与冻结版本/价格仍各由原 owner 验证。
- submission/read 领域用例继续通过已有 `actor()`/`quote()` port 工作，不导入 Request 或身份解析模块；没有 schema、费率、钱包、供应商改动。

## 原始证据

完整基线 `1efbda61567311d94fad46374d0c476e3442a970`，5335原始raw文件，逐文件核对并归档。实际原生 HMAC/HTTP/PG/BI/model/quote/intent/预占/任务/画幅读取：基线 **38场景、79检查**。

认证SQL次数（不含middleware）：普通提交4、带intent5、带opaque quote6、signed versions6、两者并用7、原intent重放1、multipart5、imagegen父轮询2、旧child轮询1、active1、health0。原价6/当前17的冻结价、真实余额不足402、丢失ACK后的503→原intent409待核查、并发同intent仅一任务均已复现。

基线准备第一次误用不存在的 `admin.models`，随后改用实际 fixture repository 的模型版本。失败日志/exit1与独立清理均保留；没有修改产品规避它。

## 实现与验证进度

7个现有产品文件只做显式actor传递；新 verifier `scripts/verify-legacy-generation-ingress.ts` 已接入原pricing catalog（目录210→211）。修改版首次实际 **38场景/79检查 PASS**，普通/intent/opaque quote/signed/两者/原receipt/multipart/父/child/active认证均1、health0，原/新正常结果投影EXACT。对应PG/随机schema/连接、本地HTTP及临时媒体均清理。

固定验证源码`b7963e41025fd2e1bdccf7f99a705d11e9128684`集中pricing12个脚本全部执行通过，0失败/未运行/复用；runner保留`PARTIAL/exit2`，不是完整211目录通过，其余199项未本轮重跑。质量检查按lint→实际类型输入→tsc顺序执行：lint exit0/37既有warning、5092个实际输入、tsc `--noEmit --incremental false` exit0；四类SCC0，2个release fixture与1个dist例外保留。

副本回滚恢复11个原文件、移除2个新增文件，全部5335原始raw hash与38场景79检查原行为恢复（认证4～7、父2、health0）；原/新/恢复正常投影EXACT，later-edit首写前exit1/零写。真实工作树保留新版。本轮原始5335、新版5337、其他2134个src/services文件raw不变。归档与本固定验证源仅4文档变化，产品/验证资产source bridge与最终四件产物见本模块`VERIFICATION.txt`/`DELIVERY.json`。

相同本地AST盘点59个wrapper，actor消费者9、本地直接认证候选0；不代替跨文件身份传递核查。已定位公共`billing/quote`与`canvas/image-tasks`的间接认证链为后续模块。开工main fetch确认e2f56255已包含，本模块同步后计数1，不写/推main；47 HOLD。

实际任务使用原 Worker 延迟策略，供应商执行与最终结算未执行，consume=0不是免费生成。最后完整App/Worker证据仍属R8Z，R9A/本模块子集不替代当前211整版验收。整体目标ACTIVE；main未合、部署未执行、47 HOLD。
