# R8S：助手已保存文字结果归入文字文档

## 模块、基线与职责

基线 `b0cf62fdf99d823cb0e16def11cf9e2ef72d475a`，独立工作树 `E:/Workspace/naumi-refactor-20261024`。完整5315个原始raw hashes、源码归档与完整副本保存在 `output/refactor-r8s-20261031`；上一轮R8R已提交/推送并取得实际验证，本轮继续产品代码重构。

原Canvas助手text回调直接读取文字快照、按结果ID/项目筛选、补默认字段并交给document.accept；这些规则已属于现有text-document及其canonical normalizer、草稿和写入版本边界。

## 实现、公开接口与依赖

`text-document.refreshSaved(nodes, signal, isCurrent)` 接收已经保存的文字节点身份，只GET既有快照，不执行生成、不建任务或新operation。页面只绑定该具体接口。

- 读取继续沿原owner和账号/工作空间/项目scope，使用调用方原AbortSignal和当前会话检查。
- 只合入原事件ID且属于原项目的行，不用完整快照替换整份文字图，不因缺少行重执行工具。
- 复用既有`normalizeTextNodes`，与load/cache共用有限正数尺寸、文本字段和引用数组规则。
- 复用既有per-ID `written` revision：在读取期间完成的accept/history/save或删除，不被迟到的旧快照回滚；不同ID的并行结果仍可分别合入。
- 既有accept继续保留本地草稿、confirmed状态和保存队列。只读上下文允许读，不引入POST或业务额度/确认门槛。

依赖为Canvas/assistant应用owner → 原text document → 原scoped HTTP/GET handler。数据库、事务、CAS、history、报价、钱包、供应商和UNKNOWN原执行链不改，不另起store/cache/任务系统。

## 验证与未完成

完成模块后集中执行原/新实际页面回调与真实document、SSE助手入口、隔离PG GET，以及原文字并发/历史/助手回归。结果按实际输出补录，不提前填写通过数字。

本模块为主线同步后第三个产品模块，完成后按AGENTS刷新并普通整合main，记录实际SHA与计数。完整候选core/镜像/runtime/产品浏览器、有效CI、持续容量与最终main验收仍OPEN；未合回main、未部署，47 HOLD。

## 集中验证与修正结果

固定应用/验收源码 `8e8c73d7695c605c654853924305d65e49c2fa9f`。原/新各33用例，原58检查、修改59检查；26组正常GET/草稿/SSE trace EXACT。4个迟到读覆盖或复活观测、3个非canonical元数据观测，从原7个变为0；这是实际document/回调的夹具观察，不是线上故障率。真实assistant SSE owner→实际页面text回调→真实document的成功/读取失败均执行，父请求一次，供应商/账务执行0。

初版371e虽然15定向入口通过，收尾源码审查发现先normalize全快照再filter造成额外分配。实际对2000个无关行的解码字段getter观测为4000次，原失败exit1保留；修正为先筛ID/项目/per-ID fence再canonical normalize，原实现和最终实现均0次。没有将该控制称p95/RSS/生产容量，也没有用首轮15通过覆盖这个真实引入问题。

最终15个受影响入口同source全部新执行通过、0FAIL/0NOT_RUN/0reuse；原runner仍subset PARTIAL/exit2，catalog199不等于全199已执行。真实PG文字并发21用例60检查，其中5个新增saved refresh用例覆盖原GET、只读、跨账号拒绝、后完成confirmed和真实history删除后迟到读；PG/schema/pool/HTTP全清理。原text-document21/58、assistant session15/55、history67/184、native documents/编辑/复制等回归保留。

完整类型exit0，5088实际compiler/config/dependency输入hash前后一致；lintexit0、原warning保留；四类SCC0。166个其他Canvas命名函数、17个其他assistant context字段、原text document的set/accept/save/attachImageResults/resolve/load算法正文，在归一化换行后EXACT。仅两个既有产品文件改动，无新增产品文件，其他2135原src/services raw SHA保持。

第三产品模块完成后再次fetch main并普通merge，实际Already up to date，incoming main仍e2f56255；计数2→3→0，固定source在同步前后保持。该同步是将主线整合进候选，不是合回main，更不是部署；47 HOLD。

## 整体退出审计

本轮回读原架构/迁移目标并生成WHOLE_EXIT_REQUIREMENTS.json，而非把15个局部通过当完成。当前源码生产lib→app0、platform DB→业务0、生产消费者→旧db facade0；旧facade仍为实际CLI/tests保留。四类图SCC0，但enterprise workflow的runtime/CLI仍有一条真实指向scripts/lib/enterprise-source-audit.mjs的导入；另外两条tests导入单列且原始3边完整保留。下一片优先审查这条业务owner边与实际operator/runtime调用者，不因名称含pilot就当作无效代码删除。

完整当前候选core199、固定镜像、原runtime177/产品browser92、有效CI、同机性能与最终main验收仍OPEN；本轮未建新镜像或运行这两套整版验收。回滚/归档以本片VERIFICATION/MANIFEST/ROLLBACK_RESULT为准，整体ACTIVE。历史32用例、371e首轮通过及规范化范围失败日志均保留，不跨source拼接完整通过。
