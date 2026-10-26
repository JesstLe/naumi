# R5P：图片元数据单写链、并发合并与真实回执

日期2026-10-26，工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。完整基线 `cfc7a8824d7d1645d09343b74e0ada4a7a18478f`，4441个原文件SHA256及完整归档。

## 实际改动与模块边界

原Canvas改名/生成后命名/标记/批量标记/分组/解组/缩放/自动比例修复有独立HTTP写链，拖动和撤销使用history；多tab互相覆盖、已提交但丢响应后本地重放旧数据，部分缩放忽略响应且先记录undo。本轮删除主消费者的平行写链，不再只对一处接口打补丁。

- `field-write.ts` 是文字/图片共同的纯字段三方合并内核，领域各自声明字段、冲突与校验；旧文字12字段规则不变。没有新全局registry、版本表或DDL。
- `artwork-write.ts` 定义8个图片元数据字段与receipt/冲突合同：title、canvasX/Y/Width/Height、marked、canvasGroupId、visible。`artwork-write-repository.ts` 在原owner事务、行锁内统一应用；不触碰图像像素、供应商、计价或钱包。既有rowToArtwork仅导出复用，JSON进入UI的category边界显式类型投影，不改值。
- 实际Canvas用户改名、标记、批量分组、拖动、缩放均使用原history identity/事务。删除原applyCanvasGroupAssignments和独立API调用；自动尺寸修复/生成后命名复用原retained command但不新增undo条目。明确未受理后可改正；unknown原operation先恢复再处理后续操作。
- compiler携带原expectedArtwork；未存储的NULL坐标/尺寸与屏幕布局区分。不同字段自动合并，真实同字段冲突保留原action和服务器版本。成功后移除仅初次使用的artworkBases，避免undo后redo误用原NULL基线。
- history返回当前canonical作品及visible，原receipt重试不重复写；包括原删除已成功、后来另一页恢复的场景，不再本地误删恢复节点。含video-result的旧receipt快路径也进入统一只读receipt，但不重新读媒体、不重新执行。
- artwork-document拥有唯一graph、事务frame、后到本页改动rebase和冲突提案；hook只连接ports。显式保留只改原动作实际变化字段，不把服务器后来坐标回退；冲突undo可显式解决，并丢弃过期undo项。UI仅真实冲突后显示浅色两份修改/选择，正常编辑没有新确认、积分门槛或业务限额。
- 选择删除携带全部图片基线，同原owner锁核对；混合删除仍一事务/一receipt，返回canonical给实际node-operations acknowledge。原项目整体删除仍是显式项目操作，不冒充全站删除CAS。

Canvas7319→7133行；174个原具名函数中167个AST保持，7个明确改绑（其中原group writer删除），新增resolveArtworkConflict适配。图片生成、原任务恢复、账务算法未改。

## 集中证据

| 层级 | 实际结果 |
|---|---|
| 图片纯内核 | 8字段30检查；文字同内核原12字段96保持 |
| 完整旧源码、实际文档/history/HTTP/隔离PG | 9场景18检查，复现坐标被resize旧快照覆盖、同字段覆盖、历史回放旧本地、软删除后迟到命名、旧选择删除；exit0指复现成功 |
| 完整新源码、实际文档/history/node-operations/HTTP/隔离PG | 20场景44检查：字段合并、同字段两份、lost response原op、批次原子、已删除不改、选择删除基线、delete receipt后另页restore、并发不同字段、NULL首次布局、NULL坐标size-only、同op并发一次/篡改、后到本页草稿、显式保留只改目标字段、undo/redo/undo冲突解决 |
| 两个实际Next页面→原生history/PG | 6组，改名冲突两份/用server/保留local/真实undo-redo/drag基线/NodeResizer真实history写入 |
| 实际Next批量控件 | 3组，原分组/标记/undo/解组；旧group/mark接口调用0 |
| 相邻实际Next创作栏 | 15项通过；文字history/save为实际PG，生成是明确fixture |
| 相邻PG/纯history | 文字并发16/47，原history20、node-ops32、interactions28、history67类184通过 |
| 全项目tsc/lint | exit0；保留原Canvas8个hook warning，不声称warning0 |
| 结构 | emitted静态/全部literal导入SCC仍0；原fixture两条lib→app与toast一条lib→UI保留 |

Next是完整源码dev/HMR、fixture native cookie与account身份；作品GET、text/history/delete为原生handler及真实隔离PG；其他API是loopback fixture。精确18个生产文件hash另见RUNTIME_BINDING。不是生产镜像、真实用户登录/供应商完整生成验收或10万容量证明。

## 原失败与观察器修正

首轮verifier重复声明action导致transform失败；seed原addArtworks不保存指定canvas坐标，已显式用fixture SQL补位置/尺寸；原history PG脚本同样补真实保存的from坐标。纯文字脚本原只transpile单文件，提取共同内核后改真实bundle加载；history VM补新adapter可选port并改module测试变量名。lint首轮包括原脚本module变量规则及新增callback依赖，已修实际adapter稳定ref/依赖，不关闭规则；最后保留原8warning。最后compiler observer因PowerShell GBK无法打印符号而退出，原TSC/LINT日志与COMPILER_INDEX已写出且二者exit0，不重跑已完成身份；修打印器后续采用UTF8。

所有原失败保留在output，不改写成PASS。

## 回滚与继续项

四产物 `output/refactor-r5p-20261026/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`，完整副本恢复4441原hash并运行同verifier旧9/18；额外probe是当前测试代码，不是原生产文件。patch逐字节重放和最终commit/remote/cleanup见DELIVERY。

旧独立API仍供创建定位、系统落地和旧客户端使用；未携带base/expected的旧调用保留显式替换兼容，不声称全部旧writer已CAS。通道/定价/余额/unknown收费任务规则保持。外围Canvas组合、R6同SHA完整CI/候选构建、历史benchmark与容量债务继续。

本轮为上次同步后的第3模块；开工fetch记录origin/main `c622b31475cd0fad7bc56c654abeb064dd41e580`，R5P封存后另做普通整合及集中验收，精确状态见main-sync DELIVERY，不把fetch当合并完成。分支不合回main、不部署；整体目标active。
