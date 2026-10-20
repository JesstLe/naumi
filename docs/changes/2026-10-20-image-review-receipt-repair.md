# 2026-10-20 可钧 / 瑞秋生图任务诊断与本地修复

## 边界与版本
- 独立分支 codex/kejun-image-failure-20261020，基线 origin/main 3f940b8618797ddf8a9eddf908b47896f48f2a72。
- 47只读观察，运行 source56aa3233 / build1792471620；不发布、不重启、不配置写入、不重放历史任务。
- 本地供应商调用0；所有行为测试只用合成图片/本机或内存fixture。

## 观察（北京时间）
- 可钧09:23香蕉返回HTTP400，0交付、0客户结算；历史响应正文未保留，不推断更具体原因。
- 可钧11:51、13:52即梦已有供应商taskId，ledger状态reconciling，不是未提交，也不是正常生成中。早期SQL仅按operation_id关联遗漏部分记录，已补billing_unit_id并更正结论。
- 可钧09:17 GPT成功；13:52源节点的已接受任务冻结为即梦，UI选GPT不改变原任务。
- 瑞秋14:03:16、14:04:49、14:06:26、14:06:36 GPT四笔成功；14:06:43一笔仍pending，platform-images stage submitted/http null，lease与后台heartbeat持续有效，尚未确认该执行卡点。11:55~11:57另三笔已在既有发布事务隔离，保留原冻结，不改历史状态。
- 14:20即梦0/2、APIB图片0/1、platform-images0/4、geeknow1/4；不是当时应用供应通道并发满。此采样不代表故障发生瞬间或供应商自己的并发上限。
- 截图单独不足以验证浏览器缓存/JS版本；新任务已有ratioContractVersion2且同账号有成功，不把问题归因于用户没刷新。

## 本次修复
1. image-gateway：真实OpenAI SDK会将本地ImageOperationReview包进APIConnectionError.cause，原withImageOperation丢失暂停核查子类并持续pending。现有界深度8、去环，只恢复本地类型且同operation/fanout标识；暂停核查保留needs_attention，不重新生成，不修改结算或退款。未知故障仍Pending，429仍明确拒绝。
2. canvas receipt：新增可选modelId（兼容旧回执）；恢复旧任务时明确提示没有按新选择重新生成。保留原operation ID，0新POST；不擅自替换已接受任务模型，不删除不确定回执。原raw request分辨率报价逻辑保持。

## 尚未闭合
- 即梦上游reconciling的原始原因未确认；程序暂停核查修复不等于原任务取得图片。
- 瑞秋14:06:43后端长时间执行未结束仍待定位；不把本修复称为全部故障解决。
- 香蕉历史400无正文，无证据支持余额/敏感词/参数中的任一具体判断。
- 本地修复未上线，线上旧任务、收费hold和隔离记录保持；不自动解冻/重放。

## 验收与证据
见 output/kejun-image-failure-20261020/VERIFICATION.txt，含基线、修改、独立副本回退和hash。功能模块迭代计数1；本轮已fetch origin/main，未合main。
