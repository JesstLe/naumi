# Core375：引用保留测试的实际 Canvas 闭包与提交准备端口

## 失败身份与职责

固定基线375e3ca37d97e210e7c21244cd7b4673700fc5c2、main ca00b1f1；5701个原始tracked文件hash/mode与完整源归档已封存。旧共享工作树另有本阶段只读快照，不覆盖此前阶段证据。

Core run41667753446/job126027558537实际执行8bbac82ecb85f8142e931713b32341b908a18f2d：145PASS/1FAIL/100NOT_RUN，reference-retention在VM读取canvasAccountRef时报ReferenceError/exit1，尚未进入原引用字段断言。当前原脚本已本地原样复现相同错误；不是据此认定图A或上传图片丢失。

## 最小实现与端口归属

只修改引用保留测试，不修改产品Canvas、参考图/任务/计费owner。原测试仅抽取generateSelectedImage，却遗漏当前闭包10项身份、保存与提交依赖。VM补可变account/workspace/project/epoch、Map提交锁、可观测epoch setter和prompt flush端口；submission key、token-CAS unlock与新attempt identity从实际background-generation导出，不复制或用恒成功锁替身。

原真实input-references、image-references、image-creation、image-task-request、reference/node draft owners继续承担引用顺序、目标版本、编号迁移、显式选择、16图上限及URL释放规则。参考字节读取和request transport仍是声明的fixture，不能称为真实供应商或账务受理。

## 完整模块验证

原40项引用检查保持并实际通过。新增11个准备阶段case、85项检查：held flush前不进入creation、同key重复点击只执行一次；保存失败释放锁且显式新提交可继续；account/workspace/project/epoch与三种ABA在flush后、creation前被原adapter拦住；原ACK释放后新submission获取不同token，旧finally不释放新锁；attempt来自实际UUID owner，原参考节点不变。总125检查/exit0。

这些ABA检查只证明实际Canvas adapter的提交前fence；scope.assertCurrent与services.isCurrent仍是声明的request fixture，不宣称覆盖受理后的owner恢复、UNKNOWN、已知job GET或真实账务不重购。相邻实际image-creation46、main-sync owners5/32、background-runs11在同源已独立通过，按输入hash桥接复用，不重复运行。

## 副本证据与未完成项

新copy driver只执行传入副本中的原/新完整retention harness。原ReferenceError必须同时匹配eval4、原submit25/main29且result.json缺失，才算受控FAIL/exit1；依赖、setup或其他错误保持ERROR/exit2。修改版要求完整40+85、11case及实际source hash一致。临时依赖junction只在无Git源码副本创建并核lstat/realpath后非递归移除，共享依赖不改。

所有精确命令、输入、literal输出/exit、集中静态、正式原case、独立窄审、四产物和全raw副本回滚归output/pr8-reference-retention-ci375-20261104。原正式reference-retention case不改目录或预算，不以新增copy oracle替代；目录仍246而非完整执行通过。

最终集中非增量tsc：5606个实际输入前后hash稳定、exit0/类型错误0；两份代码路径eslint exit0、错误0/警告0。独立静态AST确认原48个assert调用表达式保留、25个适配器外部root全部绑定，剩余可复现P1/P2为0。实际copy driver外部原5701副本FAIL/exit1、修改版完整PASS/exit0；缺源setup保持ERROR/exit2，stderr均空。正式冻结提交和全源三相封装另由本阶段最终报告绑定，不用这些局部结果替代。

375的Verify远端完整SUCCESS保留其原head/实际merge身份，不能贴给未来提交。当前完整Core、整体R04/同case页面/固定WebWorker/runtime/performance与main整合继续独立。wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD。
