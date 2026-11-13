# 47 视频时长范围修复（配置已生效）

## 模块与职责

用户要求修复47视频时长只有固定值、与103已验收效果不一致的问题。本次只更新47现有21个视频模型的`capabilities.video.durationResolutionMap`。不复制103数据库，不改其他视频能力、模式、分辨率、默认值、价格、通道或凭据。

## 公共接口、依赖方向、状态与事务归属

纯计划模块`video_duration_range_plan.py`接受当前能力投影、不可变smoke、文档定义和独立研究见证，只输出可审查的字段增量，不拥有I/O或发布权限。公开模型ID/providerId/上游型号/profile严格绑定，既有管理员时长改动冲突时拒绝；只在本机已有分辨率上扩展文档支持时长，离散值不补造中间值。

写入由已存在的模型管理公共接口承担：独立actor草稿→validateModelConfig→runtime.publish→Router prepare/activate→repo.markApplied的版本CAS、容量登记和新版本能力冻结。没有直接UPDATE active_version，没有修改已有发布行或草稿，没有强制acceptStaleBase。新草稿绑定本轮唯一operation，正式发布ID `c11ae272-53a5-47fa-b647-676b28d39192`。

全程持47三部署锁和lifecycle锁。配置版本化发布与Web/Worker程序蓝绿发布是两件事；本轮没有改程序、环境或供应商适配，没有重建容器或切Nginx，也不冒称另一次程序蓝绿发布。

## 本次实现及迁移状态

基线main a0c372df；线上仍是main固定源码4c2ea711/build1794545779/image bcbcc7bf，与现有Web/Worker完全一致。配置v153→**v154 applied**，计费v8保持。21个时长字段以外的完整配置对象及公开目录对象逐项相等。

主要时长：Seedance1.0为2–12；1.5为4–12；2.0/Fast/Mini为4–15；2.5为4–30；Kling3.0系列为3–15，Kling4.0为3–30；Kling2.6/O1与Wan2.5为5/10离散；Wan2.6为5/10/15离散；Flash/R2V为2–15；Wan3.0为2–30；H3为4–15、H3Max为5–15。清晰度仍保持本轮前的已启用档位，不借机开放4K或其他模式。

依据为main中有原始URL/SHA/采集日期的video-family-capabilities文档定义、独立video-node-research见证，以及原smoke身份。范围与103已保存实站验收样本吻合，但没有把103整份配置当发布输入。协议保留原apimart-apib-*分支，使用真实源码组装每个新增秒数的JSON duration字段。

北京时间14:09:01前正式发布完成；14:14:50业务验收完成；14:16:24锁释放后的真实恢复监督及版本复核通过。当前APP程序仍4c2ea711，不因后续运维模块和文档合main而伪称换过镜像。

## 验证命令、结果及证据层级

- 实际线上旧配置和旧首页复现：Seedance2.0只有4s按钮、无slider。
- 真实源码基线：21模型、21组协议载荷、42个越界拒绝通过。
- 修正投影及正式发布前验证：21模型、279组时长/现有分辨率/真实协议载荷、42个越界拒绝通过，供应商调用0。
- 纯计划7个unittest通过，另6项实际投影身份/冲突/回滚保护检查通过；修改版可幂等复核，管理员新改动不覆盖。
- 真实47浏览器31项通过：21个首页模型范围、鼠标选择9秒、5/10离散吸附、画布9秒、原生PATCH保存及刷新重开9秒、390px无横向溢出、测试节点清理。pageerror0、未提交生成。测试账号原视频节点0个，不将空集合校验冒称覆盖了其他用户画布。
- 全局历史保全：2105行旧冻结能力和153个历史模型版本的原行SHA全部相同；7条既有UNKNOWN原样保留。完整配置和公开目录除了时长映射/兼容durations投影外相等；价格、路线、密钥引用、模式、分辨率、默认值不变。
- 程序镜像/容器ID/启动时间、Nginx完整SHA与canonical程序状态不变；四锁释放后实际recovery.service执行`RECOVERY_SUPERVISOR=PASS`、Result=success/ExecMainStatus=0。

证据：`E:/Workspace/naumi/output/video-duration47-fix-20261113/`；服务器受保护证据`/opt/naumi-staging/evidence/video-duration47-fix-20261113-r1/`。

## 回滚材料与原始失败

四件套为能力投影副本：MODIFIED_FILE.json、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh。投影中的modelVersion153表示发布基线；真实生效版本154由发布收据记录。副本回滚恢复原始SHA，并使用真实契约重现21个单值时长；MODIFIED保持范围版本，没有线上切回或数据库/媒体回灌。

真实配置回退必须持同样四锁，经模型管理runtime.restore追加新版本，expectedVersion154、targetVersion153、使用预留独立rollbackId；若当前版本已变，先核对新修改，不直接覆盖。原153不可变快照与本轮字段增量保留。已受理任务继续使用各自冻结版本，不重放。

早期独立helper验证受standalone依赖裁剪影响：server-only/zod根包未保留、React react-server文件未追踪。原失败收据保存；本轮仅将helper依赖打包并使用等效空server-only标记，不改应用依赖或源码。最终在真实容器中运行独立bundle通过，没有将加载器失败冒充业务失败或成功。浏览器创建节点返回正常201，最初夹具错误要求200；节点已真实创建，保存原失败后按2xx契约续验同一自有节点，未重复生成或扣款。

## 未完成项与下一步

本次修复已在47生效。真实付费成片质量、每个时长实际供应商成片验收未执行，本轮供应商生成0；不以协议组装/滑条验收冒称成片测试。103未连接或变更。本次不增加应用镜像发布计数。最后按短命工作树规则归档本任务，其他工作树与25项共享修改保持。
