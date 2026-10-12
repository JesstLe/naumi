# Agent 生成后视觉检查失败修复（2026-10-12）

## 现象与结论
截图中的图片已经生成，失败发生在后续verify_image_output；不是图片生成失败，也不应因此重新消费生图。截图内容为鹈鹕站海边栏杆，不属于骑自行车动画分支。

源码确认的缺陷：视觉工具套用15秒普通查询预算，且将原signal而非超时拥有的signal传给内部请求，停止等待后请求仍可能继续。空JSON结果被默认成passed=false、score=0，会把服务异常当图片不合格。错误轨迹只给通用工具失败摘要。

已核实并排除“受管模型必须另有旧API key”的初始猜测：getOpenAISettings在执行上下文返回管理员连接，vision.review已经独立路由。隔离数据库+真实HTTP证明删除OPENAI_API_KEY和AGENT_API_KEY后仍按wire-review执行；不修改用户模型/价格配置。

尚未读取截图当时线上日志，因此上述为已复现的源码缺陷，不将其断言为当次生产唯一根因。没有连接/发布服务器。

## 修改
- verify_image_output独立100秒总预算（包含图片读取），内部下载和POST都使用ownedSignal；服务端推理80秒与请求取消信号传播，SDK零自动重试保持。
- 视觉返回严格验证boolean/有限score/summary/issues/retryAdvice；空结果、乱码JSON、不完整结果返回VISION_RESPONSE_INVALID，而非合格/不合格。无效图片先检查真实元数据，返回400，不进入供应商。
- 工具返回verificationStatus=passed/failed/unavailable；检查未完成不附加虚假的passed或score，保留图片并给固定公开摘要，不暴露上游原始错误。用户停止信号仍抛出，不当作检查故障吞掉。
- Agent共享提示词明确：检查未完成不等于生成失败或图片不合格，不重生成、不重复扣费、不宣称已验收。runtime和PiBridge将unavailable记为检查错误且使用具体公开摘要；不改变既有生成任务状态/积分/图片挂载。

## 集中验收
独立本机PostgreSQL容器naumi-visual-review-fixture-20261012、随机端口、随机独立schema；真实cookie/路由/管理员vision.review绑定/HTTP供应商fixture，没有生产或真实供应商调用。
- 原始基线：空JSON返回200并判failed；真实16秒视觉HTTP在15秒工具超时报错。
- 修改后：16秒检查成功，空/异常结果保持未验收，真实quality失败保留具体issues，供应商400仅调用一次/公开信息无secret-provider-detail，无效图片400、匿名401、用户abort传播。
- app_ledger计数保持、generate-image调用0、真实模型消费0。
- 证据output/agent-visual-review-20261012/baseline.log和modified-2.log；类型与定向lint退出0；runtime/PiBridge原生事件分支测试一致，unavailable错误轨迹只暴露publicSummary、不触发图片挂载回调。提交前再次fetch origin/main确认b1d10c21未变化。真实源码副本回滚（另一个SOURCE-ONLY目录）恢复原hash及15秒基线行为，修改分支保持新实现。完整命令、输入、逐字输出与退出码、四个重新打开验证的artifact见C:/Users/13357/.codex/worktrees/canvas-generation-concurrency-20261012/naumi/output/canvas-generation-concurrency-20261012/delivery/VERIFICATION.txt。原生回滚与修改检查退出均0；本任务fixture数据库容器已停止并删除其专属测试volume，不操作其他容器。
- 核心修复提交0b65885已推送origin/codex/agent-visual-review-20261012；画布分支d702783已推送，两个工作树干净。

## 交接
独立codex/agent-visual-review-20261012分支；仅本任务文件选择性提交，供发布Agent整合，不合main、不发布。画布并行交互在独立codex/canvas-generation-concurrency-20261012分支，两个提交均应纳入后续兼容候选。
本任务功能迭代累计2（画布+视觉），开工/提交前刷新main；不修改共享checkout，不覆盖同事未提交内容。101版本同步已按用户最新要求创建单独会话负责。
