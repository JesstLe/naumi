# 视频融合阶段：主线计费保护回归

本次接续 b990eed 的 Image gateway CI run38491693613，完整App镜像构建成功（run38491693641），计费回归失败。日志下载仍EOF；通过CI失败步骤和相同本地命令，在本任务已有guard的loopback PostgreSQL隔离数据库复现。没有连接103或修改业务数据库/媒体/凭据。

修正过时验证条件，保持真实计费契约：

- 抠图fixture此前返回全不透明白PNG，与现有透明主体校验不符。现在模拟Replicate输出真实透明背景+可见白色主体，按原始alpha像素验证；产品透明校验未放宽，17种工具/三种画布/竞品计费和重放检查均通过。
- Agent计费现通过统一imagegen规划，旧fixture只有OPENAI_API_KEY，缺Router管理连接。测试使用现有createModelFixture独立schema、明确已核实图像能力、加密假凭据、仅loopback的Router prepare/activate/state/status控制面，禁止供应商生成；实际规划/系统大额确认/模型不能自确认/下一轮本人同意、价格变化和余额拒绝保留。
- 覆盖检查跟随共用generate-image按origin映射image.generate/canvas.image，视频通过submission事务模块报价，媒体使用video.process/本地媒体事务；检查30项特性各自默认价格、单项价格变更和结算，不将本地默认0积分误认6积分。没有跳过任何特性或直接删除报价/UUID/事务断言。
- SSE fixture只发六字符，现有PublicOutputBuffer至少保留512字符及跨chunk秘密，实际读到的首帧已是结束后，200是正确的已结算重放。fixture现在先发足够安全且换行的文字，真正验证执行中409、仅一次上游请求、变价时原3积分冻结、失败/未知持有和已保存回复补资恢复。释放所有fixture暂停流、关闭自身socket，防失败清理挂住；产品输出保护未改。

真实并发缺陷也被复现：旧扣费deductPrincipalFIFO先锁credit batch再更新app_users，而新billing wallet先锁用户再批次，混合并发会形成40P01死锁。共享旧FIFO入口现在先对本人用户行FOR UPDATE，再按既有到期/创建顺序扣批次；不改变扣费数量、顺序、流水/占位或余额语义。原来的混合并发回归已通过：两条consume流水、余额89、占位0；恢复/画布/无数据库模式均通过。

最终本机 `node scripts/verify-billing-all.mjs` 18组完整PASS，session30071 exit0，日志忽略目录 checkpoint-a/billing-all-app.log：钱包/并发/初始化/配置版本/报价/真实生图部分成功/17工具/视频与画布冻结/Agent/来源事实/核账/成本审核/未知提交幂等/30特性/SSE/OCR/恢复/性能。性能各500样本，并发1和10均errorCount=0。测试中的500/502/409是明确注入或价变拒绝分支，未将正常流程失败算成功。没有付费模型调用。

仍需更新CI结果；本机全套通过不等于新CI通过。当前功能改动需要包含在最终固定镜像内，不能用修复前的成功构建代替。完整视频目标仍有C的BYOC/媒体GUI、图片保护与混合布置/更多规则，D上游实操、34项、整分支复核、完整App运行候选/蓝绿排空回滚和103发布待完成。测试账务证据与正式账号/配置/媒体保护分开记录。
