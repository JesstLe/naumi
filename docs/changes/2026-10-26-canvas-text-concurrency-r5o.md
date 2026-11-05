# R5O：文字文档字段级并发写入与统一历史回执

日期：2026-10-26。独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `b64ff74987bf3954903309e19311010d39ded111`，完整4433个原文件SHA256与归档。

## 为什么本轮不只继续拆文件

原 autosave 保存整个文字快照，history 又有另一套全字段写入；两个页面各自成功却可能覆盖对方正文、宽度或引用，删除后迟到保存还能复活节点。本轮把真实写语义统一，再让客户端文档、历史、选择删除共同消费，而不是新建平行版本表或任务系统。

## 高内聚与实际改绑

- `src/lib/canvas/text-write.ts` 唯一负责12个可写字段的 current/desired/base 三方合并与显式版本比较；不依赖DB、UI、生成或钱包。不同字段自动合并，同字段真实冲突返回当前服务器版本，已等于目标幂等接受；非null基线不能复活已删除行。
- `text-node-links.ts` 负责同owner事务内的引用/产品归属和引用防环。autosave与history共用原owner advisory事务锁，避免先验图与实际写图不同；未新增DDL。
- `text-node-repository.ts`、原生text/history/delete HTTP入口、history compiler/controller、选择删除真实消费者均改绑。history仍使用原operation receipt，重试不重复写入，并回传受影响节点的当前canonical快照。
- `text-document.ts` 唯一拥有已确认基线、本页草稿、原pending请求body、缓存恢复和真实冲突状态。失去响应仍重试原CAS请求，后到输入不被旧回执覆盖；历史canonical与本页后到草稿rebase。每节点队列保留，flush沿用Promise.all，不因某个节点冲突冻结整个文档。
- `text-conflicts.tsx` 只呈现真实冲突的两份内容与选择，不拥有HTTP/执行状态。使用服务器版本或显式保留本页；已删除节点显式另存新ID；保留本页后产生真实undo记录。正常编辑不新增确认、限额或积分门槛。
- Canvas仅增加冲突视图和一个adapter，173个原具名函数AST不变，7311→7319行。本轮收益是数据一致性，不拿文件行数下降代替行为改善。

## 集中验证

| 层级 | 实际结果 |
|---|---|
| 纯规则 | 12字段，96检查，自动合并/真实冲突/幂等/删除保护；IO=0 |
| 完整旧源码→原生handler→真实隔离PG | 9场景18检查，复现不同字段覆盖、迟到保存复活、历史重放旧本地快照；exit0指复现成功 |
| 新文档/历史真实消费者→原生handler→真实隔离PG | 16场景47检查，两个owner、Promise.all并发、同字段草稿与两种解决、lost autosave/history、删除/另存、撤销、批次原子性、引用防环、cache/reload、跨owner；供应商与账务执行0 |
| 实际Next＋真实PG文字接口＋两个独立browser contexts | 4组：两份内容保留、真实冲突控件、server/local解决、实际undo/redo；fixture原生cookie，不冒充真实登录验收 |
| 相邻控件 | 创作栏15、普通图片5，实际Next；创作栏文字保存/历史为真实PG，模型生成仍显式fixture |
| 相邻PG | 原文字文档16、文字任务24、历史20、选择节点32、交互28保持；原价与已知结果续存不重新收费保持 |
| 相邻纯历史 | 67类184检查保持 |
| 结构 | 173个原具名函数AST保持，DDL变更0，emitted静态/全部literal导入SCC仍0；原fixture lib→app2与toast lib→UI1保留 |
| 类型/lint | 最终全项目tsc及本轮文件lint以VERIFICATION原始日志为准，原Canvas8个hook warning保留 |

Next是完整源码dev/HMR fixture，浏览器文字写入走真实原生handler与隔离PG，其他API显式模拟；生产文件逐hash绑定另见RUNTIME_BINDING。不代表生产镜像、外部供应商完整生成链、线上验收或100k容量。

## 原失败与精准修正

- 相邻旧history回执覆盖后到width600草稿，实际回归首次失败已保留；修正legacy applyHistory rebase后16通过。
- 初期fixture错误预期conflict resolve、signup grant被统计成付费执行，修观察器/统计，原失败日志保留。
- 真实双tab后相邻composer沿原reset只清模拟texts而真实PG仍留上轮内容，首次失败保留；新增可选REAL_TEXT测试适配，显式reset/read真实PG并seed同owner第二参考图，产品行为未改；补验15通过。
- 原准备runner逐文件重复git diff拖慢已结束，未杀其他进程；本轮不重复大suite。
- 收尾observer首轮PG名称沿用上一模块，身份断言在stop/rm前退出；修正为自有R5O名称后clients0且仅删除自有PG/volume/network。patch验证首次继承父Git前缀而跳过、第二次新Git全局autocrlf把一个测试末尾CRLF规范化，均由hash断言捕获；测试脚本统一LF并重制四产物，独立Git根关闭autocrlf后精确重放。原失败留存。

## 回滚、同步和未完成项

四产物：`output/refactor-r5o-20261026/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。完整modified独立副本恢复4433原hash并删除新增文件，再用同一PG verifier在完整恢复源码运行旧行为9/18；工作树保留新版。精确文件数、patch重放、commit/push/remote及自有Next/PG清理见DELIVERY。

新Canvas文字主消费者发送base/expected；旧raw wire、内部repository不传base/expected的调用保留原显式替换语义，未宣称旧客户端已全部CAS化。图片节点跨请求CAS、其余外围组合、R6同SHA CI/完整候选、历史benchmark与真实容量继续。没有改定价、钱包、生成算法或管理业务规则。

包含main `d460e61f86b509abc5edaffe40a4ff6318dc64ce`；同步后第2功能模块，不合回main、不部署。整体重构继续active，不将本模块通过当作完整重构版本交付。
