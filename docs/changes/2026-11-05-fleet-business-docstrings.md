# Fleet 业务只读切片：函数契约文档补齐

## 模块与调研结论

- PR #11 的审查 `5776955378` 明确覆盖提交 `2d0173e1155c58f2c4c473590d530d7c2628cb0a`，没有新增行内问题，但函数文档预合并检查仍报告 19.61% / 80%，分析 66 文件中的 153 个函数。本轮处理这一文档缺口，不把 `COMMENTED` 当作整个 PR 已批准。
- 既有登录返回参数审查 `4473970603` 已由机器人回复确认并实际 resolved；本轮不改变该修复或重开其行为设计。
- 开工基线为上述 `2d0173e1`，分支 `codex/fleet-business-data-103-20261104`；PR base 为 `268076b7fb4900509817af7321ad34a85698c86c`（重构分支），不是 main。已刷新 origin/main，未整合整条重构线或触发发布。

## 职责、依赖与实现范围

- 在本 PR 原有修改触及的具名函数上补充有实际内容的 JSDoc / Python docstring：管理入口和本地/Fleet 归属、响应契约与未知态、签名及 actor/registry 绑定、只读事务、控制与收据边界、生产 admission HOLD、回退首写前检查，以及各有限 fixture 的验证目标。
- 不为匿名回调堆占位说明，不向 UI 增加文案，不改既有参数、SQL、权限、断言、阈值、配置、业务 token 或 Python 控制流。Python `__doc__` 元数据按设计增加；剥离文档字符串后的 AST 保持相同。
- 新增 `scripts/verify-fleet-business-docstrings.mjs`，只读取固定 Git cohort 和待检查源码，依赖现有 TypeScript parser、Git 和 Python AST；它不 import 应用模块，不运行部署脚本，不连接数据库或网络。
- 本地规则：固定 `base..scope-ref` 的 66 个代码文件，只检查函数声明/函数体与修改行相交、复杂度至少 2 的具名函数。复杂度包括逻辑/nullish、条件、循环、case 和 catch；跳过嵌套函数的分支。该规则产生 **172 个**函数，基线 **30 有文档 / 142 缺失**。这是可复核的本地偏宽口径，不是 CodeRabbit 的 153 函数算法或远端新评分。
- 对全部 66 文件同时比较 JS/TS 解析后去 JSDoc 的语法树结构、叶节点 kind/原始 text、声明种类、一元 operator 与 type-only 等语义字段，或 Python 去 docstring 的 AST 哈希。JS/TS 不使用裸 scanner 处理 regex/JSX，以免错误的词法上下文把注释当作字符串。函数对应使用固定基线的词法名称和出现次序，避免加注释导致行号变化后错配。
- `--source-root` 强制从指定副本读取每一份源文件，缺失即失败，无工作树 fallback；源哈希、来源、检查器自身哈希、缺失函数及真实退出码落盘。
- 首次写入前已将全部 66 文件原始字节与 SHA-256 保存到 `output/fleet-business-docstrings-20261105/original/` 和 `ORIGINAL_INVENTORY.json`，新增两个路径的原始不存在状态另记 `NEW_FILES.json`。
- 本轮对 54 份原有源码补充 179 份函数文档（生产 TS/TSX 65、Python 43、验证脚本 71），另增本检查器与记录，共 56 个修改路径。各分组报告均保留具体函数、原始位置、哈希及文档附着/结构等价证据。

## 可复用验证命令与证据层级

工作目录：`E:/Workspace/naumi-fleet-business-data-103-20261104`。

```powershell
node scripts/verify-fleet-business-docstrings.mjs --base=268076b7fb4900509817af7321ad34a85698c86c --scope-ref=2d0173e1155c58f2c4c473590d530d7c2628cb0a --baseline=2d0173e1155c58f2c4c473590d530d7c2628cb0a --output-dir=output/fleet-business-docstrings-20261105/tests/baseline
node scripts/verify-fleet-business-docstrings.mjs --base=268076b7fb4900509817af7321ad34a85698c86c --scope-ref=2d0173e1155c58f2c4c473590d530d7c2628cb0a --output-dir=output/fleet-business-docstrings-20261105/tests/modified
node scripts/verify-fleet-business-usage-entry.mjs --output-dir=output/fleet-business-docstrings-20261105/tests/usage-entry
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
```

- 基线覆盖检查已真实复现 `files=66 eligible=172 documented=30 missing=142 semanticChanges=0`、exit 1。
- 修改后为 `files=66 eligible=172 documented=172 missing=0 semanticChanges=0`、exit 0；检查器语法、376 项入口回归、20 项 admission 检查、16 项有限运维测试、20 份实际变更生产 TS/TSX 文件的 ESLint、全库 TypeScript 与差异检查均通过。上述静态与有限模块测试不等于真实 HTTP/PG、部署或生产验收。
- 修改后覆盖检查、所有实际变更生产 TS/TSX 文件的 ESLint、全库类型检查、376 项入口与登录返回回归、差异检查、副本回滚及负对照的完整命令/输入/stdout/stderr/退出码见 `output/fleet-business-docstrings-20261105/final/VERIFICATION.txt`。
- 本地检查器初次执行发现 Windows Python stdin 默认编码问题，错误回执完整保留为 `BASELINE_HARNESS_INITIAL`；改为显式 UTF-8 字节解码后才得到上述有效基线。未把初次解析失败当作覆盖率缺口的复现。
- 四份产物为同一 `final/` 下的 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。回滚仅针对指定独立 rehearsal 副本；先验证全部修改文件及必要未改依赖，任一 later edit 拒绝且零写，实际工作树保留文档补充。

## 完成状态与未完成项

- 本轮只交付函数契约文档与静态检查器；通过本地检查不等于 CodeRabbit 新覆盖率通过，后者须绑定新提交另行取得。不得降低 80% 门槛、关闭检查或用本地 172 分母冒充远端 153 分母。
- 同一父 SHA 的 core / fleet-business / verify 已核实为 job 未启动、steps=0、账户支付或支出限制；不反复重试，不改账户设置，不以本地验证替代远端 CI。
- 生产共享队列/回退闭包与真实 image floor 等既有未完成项保持；公共 `business.query` admission 仍硬性关闭，`PREPARATION ONLY / HOLD` 不变。
- 无合 main、103/47 发布、SSH、生产 SQL、permit 发行、配置迁入、账务/钱包合并或任务重放。后续继续按新 SHA 处理实际审查意见与检查结果。

## 后续审查：声明种类参与语法哈希

- `5777218560` 对 `58a90b346dbbc6818711f43234278ef54d4350b0` 的审查确认远端 Docstring Coverage 为 **97.87% / 80%，Passed**，分析 141 函数 / 62 文件；6 文件跳过（1 unsupported、5 over file limit）。该范围不是全库或生产验收，也不代表整个 PR 已批准。
- 新意见 `4474490231` 指出原 `syntaxShape` 忽略 `node.flags`，而变量声明种类存放在这些位上。真实基线复现：只把 `var`、`let`、`const`、`using`、`await using` 互换，旧函数会给出相同哈希；for-of 的 var/let/const 也存在同样漏检。
- 本次只给 `VariableDeclarationList` 增加 `semanticFlags.declarationKind = node.flags & ts.NodeFlags.BlockScoped`。当前 TypeScript 5.9.3 的声明位分别为 0 / 1 / 2 / 4 / 6，mask 为 7；不把 AwaitContext、JSDoc 等上下文位混入哈希。原 type-only 等字段、子节点遍历和叶节点文本保持不变。
- 新增 `scripts/verify-fleet-business-docstrings-shape.mjs`，通过 TypeScript AST 提取指定源码中的真实 `syntaxShape` 函数，再在只提供 TypeScript parser 的有限 VM 中执行；不是重写一份被测逻辑，也不 import CLI/应用模块。
- 22 项回归覆盖五种声明的十种两两差异、for-of 的三种差异，以及普通注释、regex、JSX、type-only 注释等价、原 type-only import/export 与字面量/操作符差异、无关上下文标志等价。父提交基线为 `assertions=22 failures=13`、exit 1；修改后及更严格 66 文件检查的完整结果见新一轮 `output/fleet-business-docstring-declaration-kind-20261105/final/VERIFICATION.txt`。
- 修改后 22 项全部通过，exit 0；更严格声明哈希重新核对原 66 文件，仍为 `eligible=172 documented=172 missing=0 semanticChanges=0`、exit 0。两个检查器的 Node 语法及三路径差异检查均通过。
- 本轮原始两文件字节/hash及新增回归文件的不存在状态已先保存。三路径切片只含检查器、回归与本记录；四份产物使用新证据目录，不覆盖上一轮封存材料。独立副本回滚恢复旧函数及 22/13 基线，later-edit 零写拒绝、缺源无 fallback、真实关键字变更的整检查器负对照均独立记录。
- 本轮集中验证只覆盖该静态检查模块，不重新执行无关 PG/浏览器矩阵，不改产品代码、文档阈值、CI 配置或生产 HOLD。

```powershell
node scripts/verify-fleet-business-docstrings-shape.mjs --baseline=58a90b346dbbc6818711f43234278ef54d4350b0 --output-dir=output/fleet-business-docstring-declaration-kind-20261105/tests/baseline
node scripts/verify-fleet-business-docstrings-shape.mjs --output-dir=output/fleet-business-docstring-declaration-kind-20261105/tests/modified
```

## 后续审查：前置及后置一元 operator

- 审查 `5777397176` 覆盖 `abbfcfa8fe7763801ef79b8a81f8c7d8702c254f`，新意见 `4474617484` 指出 `PrefixUnaryExpression` / `PostfixUnaryExpression` 的 `operator` 是标量，不能仅靠 `forEachChild` 读取。父提交的远端文档覆盖率本次已报告 97.90%；这不代表新修复提交或整个 PR 已通过。
- 在真实旧函数上扩展回归后，`+ / - / ~ / ! / ++ / --` 六种前置操作的十五种两两比较，以及后置 `++ / --` 比较，均错误地产生相同哈希：总 44 项中复现 16 项失败，exit 1。原 22 项声明种类与既有字段测试继续保留，另覆盖前后置位置差异及四种注释等价。
- 本次只对两类一元表达式添加 `semanticFlags.operator = node.operator`；保留声明位掩码、type-only 等字段、子节点和叶节点处理。既有有限 VM runner 继续提取真实源码函数，不替换被测实现，不执行 fixture 的增减操作。
- 修改后 44 项全部通过；更严格的完整检查器重新核对 66 文件，仍为 `eligible=172 documented=172 missing=0 semanticChanges=0`，均 exit 0；两脚本语法及差异检查通过。
- 本轮原始三文件字节/hash在首次修改前保存于 `output/fleet-business-docstring-unary-operator-20261105/original/`。四份交付产物及完整 BASELINE / MODIFIED / ROLLBACK 命令、输入、输出、退出码单独保存在该轮 `final/`，不覆盖历史封存。
- 独立副本完整检查器负对照仅把已有 UI 验证脚本中的 `assertions++` 改为 `assertions--`，要求只检出该路径的语义变化。副本回滚恢复真实旧函数和 44/16 基线，后续修改拒绝且零写，缺源即失败而不回退工作树。
- 本轮只验证静态检查模块；没有产品代码、CI 配置、阈值或生产状态变更，PREPARATION ONLY / HOLD 保持。

```powershell
node scripts/verify-fleet-business-docstrings-shape.mjs --baseline=abbfcfa8fe7763801ef79b8a81f8c7d8702c254f --output-dir=output/fleet-business-docstring-unary-operator-20261105/tests/baseline
node scripts/verify-fleet-business-docstrings-shape.mjs --output-dir=output/fleet-business-docstring-unary-operator-20261105/tests/modified
```
