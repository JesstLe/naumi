# R9S：免重复积分确认的静态验收跟随实际owner

## 调研与实际失败

基线 `0454f164ba18d3d4e3372166a78808f49992a61c`，独立原重构工作树。该head Image远端在`Direct image submission without fee confirmation` / `npm run verify:direct-generation`终止exit1，后面的完整build和业务步骤均SKIPPED；Core是独立原固定源作业，未重启或取消。

本地原命令直接复现`DIRECT_SUBMISSION=FAIL generate quoted direct submission owner missing`。原扫描器只接受GenerateClient文件内直接调用`billing.submit`，而R9R已经让页面把这个原端口交给生成会话adapter。不能为测试把业务编排搬回页面，也不能删除这个工具的报价/免二次确认覆盖。

## 本次实现

只改原静态脚本和本模块记录，不改产品、账务、费率、UI或任务执行：

- 沿真实named import绑定核对页面使用原`useFeatureBilling`返回端口，交给实际`useGenerationSession`并消费同一返回会话。
- 核对hook导入实际`createGenerationSession`、提交adapter保留注入的billing端口和owner guard、原`/api/generate-image`协议不变。
- 核对owner在原submit前传入其所属视图guard；核对`useBillingEstimate`保留完整服务器quote并把guard继续交给原BillingProvider的POST边界。
- 页面/hook/owner均不得引入积分confirm。原Canvas、GenChat、其他七工具、原quote/current版本不误拦、operation header、Agent无跨轮确认、无关删除确认等原条件保留。
- 两个真实导入别名正例；新增错模块、错报价端口、未消费会话、adapter换成fetch、丢失guard、伪造空guard、facade丢回调及恢复积分confirm的负例。不引入第二个扫描框架。

这是静态归属合同，不冒充实际PG扣款或浏览器端到端；R9R实际18场景/父25/PG25场景74检查保持原固定源证据，产品2144文件字节全部相同。原命令实际exit1，新版完整命令37检查实际exit0；全项目非增量TypeScript与定向lint实际exit0、5096编译器输入及4配置绑定。当前修改与原guard的实际A/B、别名/负例及副本回滚分别记录到 `output/refactor-r9s-20261101/VERIFICATION.txt`，未运行断言不记通过。

整体重构ACTIVE，最终main整合、新head完整CI及真实同一付费断线链仍OPEN；47 HOLD。F01首页列表/上传、F03后台发布恢复继续按实际职责推进。
