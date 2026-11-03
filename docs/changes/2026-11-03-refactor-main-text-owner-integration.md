# PR8 主线文本工作流 owner 整合

## 固定输入

- 重构输入936fe80e4057ae76752d656e3880e3b7f25b3428，5672个完整tracked源码hash与原MODIFIED_FILE.tar已固定。
- 新main dede39337f174da487b0067550f7770366d52dbe：23路径增量，文本正文/AI要求分离、650ms自动保存、同项目引用和下游正文读取。
- 隔离整合工作树E:/Workspace/naumi-refactor-main-owner-sync-20261103；普通merge5冲突（Canvas、text-route、两video owner和旧history测试），无reset/stash/force push，不覆盖共享旧树。

## 实现归属与本轮合同

Canvas agent拥有节点/Composer展示、既有text document/task/history owner与新autosave组装；server agent拥有HTTP正文/要求输入、actor/project引用读取、模型文字/视觉区分和video原文/切片；独立reviewer检查flush/barrier、历史和原document身份。不把main单体整体覆盖回来。

必须保持：手写编辑不购买，AI要求不是正文，完成后清空正文不回退旧prompt；显式生成沿原paidID、冻结输入和UNKNOWN恢复；account/workspace/document原归属与ABA保护；autosave、撤销、删除写屏障不互等死锁；服务端文字引用按已认证actor/项目读取，不作为视觉图片；视频冻结原文优先、原slice/Tx/CAS保持。

原billing JSON wire、contenteditable测试修正、runtime测试端口去重与publish-only/restore草稿合同继续保留。新scope仅main文本增量，不部署、不改供应商配置。

## 正式回归与证据

root为文本正文、generation-input、actual React autosave、model参考、真实SQL/PG及video正文owner新增6个正式case，目录应为243；runner为三种有落盘证据case新增case目录路由。完整Next文本17项由agent自有loopback应用与独立缓存执行，不混入无固定Web前置的core直接入口。

所有阶段精确commands/input/literal stdout/stderr/exit、来源hash与失败尝试保留output/pr8-main-text-sync-20261103。agent结果按其阶段source身份，root最终集中类型/lint/runner/边界/Worker与副本rollback后另行记录，不把旧PASS套到新源。

## 当前退出边界

整体ACTIVE。main→重构候选同步不等于候选合main，未部署、47 HOLD。本轮前后对照及最终结果以VERIFICATION.txt/DELIVERY.json为准；没有把243目录新增当完整243执行或整体语义/页面/固定WebWorker/性能退出。

## 最终模块结果与发现

- Canvas已正式冻结26条职责路径；server冻结9条。main正文/650ms自动保存/AI写作/同项目引用接入已有presentation、editing、task/document/history和HTTP/public read owners，不复制请求循环。
- 独立review actual callback+task实证关联正文save=null、unsaved但无CAS conflict仍误提交；已改逐source非空ACK后提交，独立paidPosts=0。初始naive flush在history barrier内的自等待只是未采用组合诊断，最终在barrier前drain并同步阻新编辑。
- 实际Next17首轮7项后fixture把裸TEXT_OUTPUT_LIMIT502当可释放intent；没有按裸码改财务终态。提取Billing既有identity-bound terminal四条件，client/task共用。UI失败场景明确同ID settled receipt，原17断言保留；原四裸码/foreign/负charge仍UNKNOWN的实际task/retained/helper正负例通过。不得把真实TEXT_OUTPUT_LIMIT说成未受理。
- Canvas：tasks30/202、history67/184、document21/58、selection84/332、scene30/103、image-runs60/213、image-creation46、editing14、实际React autosave12、DOM4、真实SQL/PG13；新content12/input12及whole BillingProvider client24通过。完整Next/React Canvas17通过，供应0/pageErrors0；副本与候选1955实际输入一致，root.next/tsconfig未改；服务已自有PID清理。
- server：actual owners13（SQL/auth ports）、model引用7、实际Route/SDK loopback33及原text-only合同通过。自动merge的domainPath作用域错在实际模块确定复现并改回input.path。不能将SQL ports oracle称真实PG。
- root服务器阶段：完整billing-all18PASS/0FAIL/0NOT_RUN及restore36真实PG通过，189输入阶段pre/post不变；后续纯client-response提取另以实际客户端/独立9case验收，不把旧phase哈希重标最终源。
- root最终非增量tsc：5604实际输入、0error、pre/post0变；lint44路径0error/6旧warning。最初两条harness局部module lint错误已scope rename，原失败保留。四类SCC均0，实际Worker构建2440输入通过（不代表固定完整Web镜像）。
- reviewer四合同窄审通过，唯一实际P2已修且复验；并非整条R04签字。正式6项新目录、原runner31/426通过与完整Next17/真实PG是不同层级，正式6项最终执行结果以主集成记录为准。

副本回滚仅恢复独立副本，当前候选仍保留修改。原936已经包含restore-context、JSON回放和runtime fixture修复，不回退这些；最新main仅同步进候选，未反向合入或部署。

正式6项首轮在44e535c0全部PASS/顶层PARTIAL exit2；PG默认12项而agent显式instruction-history为13项。root已将该原第13项flag纳入正式case，并加runner参数断言，最终clean-source执行另行记录，不把首轮12重标13。
