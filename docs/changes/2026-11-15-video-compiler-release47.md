# 47 输入驱动视频编译架构：已切流，旧槽清理待完成

## 模块、职责与当前状态

用户明确“更新47站”，并确认“接受短暂维护窗口”。本轮以47为目标，不再以103运输问题或旧47 HOLD阻止本次发布，不连接103或废弃站点，不改变103隔离实验线。授权仅针对本轮。

当前公网实际19d983853d90154b9c5e9efdecac0806b53a2ceb / 1794718498，Web与Worker同sha256:0a94c8b8a6400ef44fe9c27ad4ee85fd658c92907d97d1358c31b05caf3ec5af。原固定main84e产品与19d一致；后续本轮文档提交不代表另一个程序构建。生命周期CLEANUP_PENDING，不是COMPLETE，成功发布计数增量0。

## 配置、依赖与事务归属

发布事务全程持Naumi/Hub/参考工作台三锁及既有生命周期锁，固定在线4c2ea711/1794545779、canonical2225与备份。原837146023B完整dump的pg_restore --list、字节哈希通过，不恢复DB。旁路同源Web/Worker先启动且保持draining/paused。

实际v154启用21模型/21通道，无videoExecution；原迁移owner审查32条（包括11条禁用通道），在授权维护内通过既有model-config repository/runtime发布v155。唯一操作77796c1c-235a-4417-849b-02e05d4c54fc，原StageInput持久化，未原始SQL改active指针，未伪造管理员cookie。普通用户访问平台管理API404仍保留。新增执行绑定由root授权维护actor执行，不覆盖用户未保存管理草稿。

仅64个parameterMap.videoProfile/videoExecution字段变化；移除这两字段后新旧完整配置逐项一致。原v154整行hash、价格/路由/人工参数/证据、disabled状态和计费设置保持。video编译/Profile统一owner已经生效，旧capabilities.modes/limits不再拥有额外否决权。

本轮保留站点原local任务执行/HTTP-tick Worker运行模式，不混入全站任务归属迁移；新的Resolver/Compiler/冻结计划与同版本媒体Worker仍是当前实现。未声称所有应用计算都搬到direct Worker。

## 维护与切流

北京时间2026-11-15 18:46:56.713至18:51:11.792，约4分15秒。完整Nginx闭包维护503、旧Web关闭新准入、旧Worker完成tick后quiescent，迁移后新版health由预期503变200、只读文生编译200，然后新Web开放准入并切流，新Worker恢复。旧槽原请求自然完成，没有强停或重放。

初次维护→新版转换的执行器把原始文件bytes误当nginx -T带分隔符body，严格SHA核对拒绝并实际恢复维护配置；保留原失败记录和原操作id，以明确FAILED_PREIMAGE_RESTORED回执核对后生成正确闭包，最终逐文件bytes等于事先已验证的golden配置再切流。没有放宽CAS/语法/整闭包哈希。其它驱动修正（不存在的models路由、普通用户管理404、Worker complete/completed阶段、SQL字符串解码）仅影响验收器，原失败都留存，未重启进程或重放tick迎合检查。

## 当前站点验收

- 公网version/health200，DB健康，当前source19d/model155。新Web自身UNKNOWN0、新Worker未知tick0、已完成正常tick。
- 21个启用通道使用仍可见的自有真实图片676650B，legacyMode=text＋一张普通图、无显式意图，实际编译预览21/21 HTTP200并解析为single_image；自己的标记任务行0、生成提交0、付费测试0。最初选到软删除作品的21条422准确拒绝，未修改权限规则，保留为负控。
- 登录、项目、目录、Canvas、Video、作品、Dashboard和统一创作历史8项200。创作历史21412条/每页20，不返回未消费summary，原读取修复保持。
- 6820旧新静态资产并集保留，公网抽取6份旧新JS/CSS均200且SHA一致。未据此声称所有公网浏览器跨版本零刷新。
- 兼容回滚包main6685d4c2 / 1794714127 / sha256:1fb523e3eaa4848a8b320dbacab8423dc5e69f7f14d7fdfc54db1eee41750517已保留；实际冻结视频/Workflow格式及Profile只读回退guard通过、无blocker。原4c不冒充V3任务兼容回滚版本；未执行生产程序切回、DB恢复或付费重放。
- systemd真实恢复服务ExecMainStatus0/Result=success，已经核对其newWeb/newWorker身份后在四锁内ACK，canonical2283。最后四锁已释放。

## 仍未完成的收尾

旧HTTP请求0，但旧Web仍有2条持续media-mirror后台活动和1条当前boot的canvas-image UNKNOWN。原7条历史UNKNOWN连同该条，8条原行逐项保持，新UNKNOWN0。旧Worker已排空并暂停；旧Web禁新准入；旧双槽restart=no、无公网路由，但暂不强停。canonical明确CLEANUP_PENDING并保留两旧槽身份；这不是完整蓝绿退役完成，也不能启动下一次普通发布。

下一步核对旧媒体活动的实际I/O/幂等及原UNKNOWN未绑定claim的原始凭证，取得真实退役证据后收敛旧槽。真实供应商受理→成片→资产→账务和全高级输入生产验收仍未由本轮付费0的预览证明；整个架构目标未标完成。

## 空间与材料

准备阶段清理五轮之外6个停止容器、3个旧镜像，清理阶段增加1738412032B；本轮另清理两份Nov7、超过7天的过期dump，选中文件1549872105B，实测增加1549901824B。删除前重验最新完整backup可读。近7天备份、当前/直接回退、最近5轮程序和配置、业务媒体/volume/凭据保持，无prune。最终约4.90GiB可用/93%，未在服务器构建，不以忽略本轮材料占用的方式声称全任务净释放。

证据根E:/Workspace/naumi/output/release47-video-compiler-20261115；对应服务器/opt/naumi-staging/evidence/release47-video-compiler-20261115-r1。四件套MODIFIED_FILE.json是实际发布描述符；ROLLBACK.sh仅恢复独立描述符副本，不冒充生产程序切回。BASELINE/MODIFIED/ROLLBACK精确命令、字面结果、exit、原哈希恢复与修改版保留见VERIFICATION.txt/DESCRIPTOR_RECORDS.json/REOPEN.json。原准备版四件套封存在preparation-artifacts，实际现场回执在live-receipts。
