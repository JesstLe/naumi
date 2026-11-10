# VV-01／02 r3线上入口与账户前置核验

## 模块与职责

本轮只更新真实验收状态、续跑入口及证据；未改产品源码、正式通道、价格或账务。供应商调用0。开发基线deeb1430b9f628982e7cc792c4b0b66e3dd43de4，独立分支codex/storyboard-live-acceptance-20261110；共享checkout保留。

## 公共接口、依赖方向、数据与事务归属

网站原生登录验证已存QA密码后，由网站签发正常会话。Canvas原文、视频节点与方案通过原UI和现有owner持久化；只读HTTP查询自身记录。原视频专用operator仅在103固定Web容器中BEGIN READ ONLY查询余额／密码存在性／任务／账本，未输出身份或秘密，未签发管理员Cookie或直写积分。

## 实际结果与证据层级

- public https://naumi.top/：/api/version 200精确3a043c6b84308bd542d3358831296fabcc478b2c／1794310315，/api/health 200且DB ok。本机urllib403与浏览器200分别保留，不推断站点故障。
- 普通QA原生密码登录成功，/api/account?view=user、/api/account/agent-tokens均200。QA余额30、账本1、视频任务0，未借用其额度。
- /api/video/catalog 200、v117、22模型、所选Seedance2.5 4秒480p16:9、图片4／视频1／声音1、supportsFirstFrame=false，原生分镜0。/api/models?feature=canvas.video错误400是错误查询名，改为正式video.generate后200，未认作产品回归。
- 完整Canvas UI创建text-fedfd8b4-7090-4b16-84e4-471eb9815c5c和vnode-8cddf28e-f0c6-4403-991d-7b8c9bcda3e6；原文90字（文件末尾LF不属于节点正文）、方案cff75ad3-9767-4011-8f36-1e00d9510e24 revision1整页重开后HTTP精确读回。没有调用Plan shots Agent、优化、生成、合成或供应商。
- 原生UI删除本轮自有项目后整页重开，活动项目0／文字节点0、视频节点deleted=true；QA30积分／账本1／任务0保持。方案历史回执和软删除节点保留，不宣称物理清空数据库。
- 原视频专用operator：balance0、passwordPresent=false、tasks0、ledger2、billingVersion8；受保护后台密码请求timed_out，没有收到秘密。正常后台验密、正式入账与真实试片未完成。

## 操作异常保留

preview_snapshot两次超时，部分文本selector点击超时，使用只读DOM状态核对后依据已观察元素的aria或坐标操作，没有盲重提付费任务。一次预览连接短暂失联，刷新status恢复。UI偶见Unsaved changes，随后同一原文／视频节点／方案均正式读回；没有将瞬间提示抹成全程无故障。选择Seedance后工作台生成价瞬时显示0，而公共目录costPerTask20；未提交，实际正式报价仍待试片时冻结。初次证据写入命令超过Windows长度限制，改用直接文件patch完成。

## 验证命令、结果及回退

证据根E:/Workspace/naumi-task-evidence/storyboard-live-acceptance-20261110。
BROWSER_PROBES.json保存公开／正常登录／目录／原文方案读回，OPERATOR_READONLY.json保存只读账户汇总，QA_CLEANUP.json保存原生删除后复核。check-record.py检查当前记录与实际证据一致，BASELINE／MODIFIED／独立副本ROLLBACK的精确命令、输入、字面输出和退出码见VERIFICATION.txt。

四件套为MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；回退只对独立文档副本恢复原哈希及新增文件原缺失状态。活动修改文件保持，不回滚数据库／媒体、不重放任务。纯文档与范围状态更新不发布、不增加发布计数。

## 未完成与下一步

通过受保护输入取得103后台正常登录密码后，网站原生验密；核对实际专用actor及正式入账回执，累计最多120积分，不重置账户密码、不改绑站长、不重复注册领赠额、不借QA积分。随后使用正式方案／原操作编号及新报价逐个试片，未知查询原任务；保留真实媒体、原账务与六维人工质量。辅助视觉／声音代码不在r3，不作为本轮线上功能。VV-01／02整体未完成，47未连接、103无锁／候选／切流。

## 续跑指令

```text
继续VV-01，读取本记录与trial-scope.json。先核对正常后台凭据和正式专用actor/余额，不重新发布r3。
每个原操作在提交前查原任务回执；正式报价须满足总120／视频5次20／媒体2次10上限。
逐个保存原任务、冻结报价、结算、私有产物和identity/action/dialogue/camera/visual/audio判断。
UNKNOWN只查询原操作；首页QA不付费；辅助审片未部署；47保持不连接。
```
