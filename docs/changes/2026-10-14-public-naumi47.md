# 47公网Naumi开站

## 最新授权与入口

用户于2026-10-14明确“公网现在可以全面切换到naumi”，随后再次指定https://47.105.59.142/应直接打开Naumi而非参考工作台。该指令解除本任务此前的“47仅私有准备、不开站”门槛。

- HTTPS根路径已切Naumi首页，HTTP200/title Naumi- AI创作平台，无工作台跳转。
- /batchshot为原生参考图工作台，含single/chat-image三个原始UI页面；无iframe，账号/模型/积分/私有媒体复用Naumi。
- 新访问/workbench、/single、/chat-image进入对应Naumi模块。旧wb_session且尚未登录Naumi的旧页面保留旧后台兼容；原系统可从/legacy-workbench/workbench继续读取历史。旧1账号/8项目/54完成任务/1模板和素材没有删除或自动合并。

## 固定版本与发布

- 候选5fc5efe7926739ff8befee3133892b6d82bbea84 / version1791976273 / Image sha256:89e7f98aaf4568d163b5bd2f39c5421bc589b8c8db12e6618df2be7ee496e115。
- App naumi47-green-5fc5efe79267，loopback13052；Worker naumi47-public-worker-5fc5efe79267同镜像，仅内部网络。旧reference-workbench-17847继续运行。
- 目标Naumi/Hub/旧工作台三把部署锁贯穿最终发布；受保护完整PG备份/旧SQLite在线backup/原网关/原Compose/回滚副本保存。
- Nginx隔离五类临时目录语法验收，平滑reload；切流连续69个HTTP请求错误0。旧网关仍可通过ROLLBACK.sh恢复；不恢复旧DB、不停新App/Worker已经接受任务。
- 沿用可信Let's Encrypt IP证书与现有续期timer、80 ACME挑战，Session通过HTTPS设置Secure/HttpOnly；没有重新申领证书或改DNS。
- 数据使用47现有库：236账号、所有189员工花名归属北方企业保持；没有用旧103快照覆盖新151账号。两站不同步、103业务未更改。
- 媒体沿用47独立本地私有15GB副本，不启用NAS/S3或共享远端写入。新增请求进入现有私有媒体授权和账号缓存。
- 复制历史来源隔离NAUMI_STAGING_HISTORY_GUARD=1保留；只有新增任务允许正常执行，不自动重提复制的历史收费任务。
- 代理/Router从既有47准备材料启用，均loopback/Docker网关地址；Mihomo、bridge、Router为独立systemd服务。Docker没有重启，旧用户服务没有停止。

## 集中实机验收

- 本机独立headless Chrome经私有隧道及实际公网：根首页、canvas、原生三页1440/390通过，Cookie登录、模型选项、脚本异常0、无iframe；截图存在且已打开。
- 公网登录逍遥成功，可用99999；当前Naumi模型目录14项，非admin设置不可改，管理员接口403/401；原workbench认证Cookie在切流后仍读旧身份梦桐。
- 一次真实TDH单参考生图：operation60b43fcb-79b5-47d9-8120-ec93a8aa6824、4:3输入→1448×1086 PNG，状态done、原生账本唯一扣10；私有原图匿名和另一账号拒绝。供应商密钥来自Naumi已有加密凭据，不来自日志或浏览器。
- 上线验证消耗10积分通过原生grantTx幂等审计补回，逍遥最终99999；原扣费/原作品保留，不删账或伪造免费任务。
- 三页通用/ZIP/版本/聊天逻辑之前18组隔离验收保留。本次只真实消费图片1次；视频全部供应商、LLM聊天质量、Reverse Hub浏览器供应商逐渠道没有都逐一真实消费，勿将全站开入口声称为全供应商质量验收。

## 构建、Git复核与异常

- 开工刷新main28c646e并整合；已完成的参考工作台更名f7bf6e1/a5f8433选择性整合，上传body竞态修复随后合main5fc5efe，候选重新固定构建，不发布旧88a724d。
- GitHub run38551762141因账号付款/额度失败而未启动job；没有GitHub成功镜像。47构建同固定源码，npm依赖下载改直连并保留本任务缓存，Next15.5.27完整构建/类型检查完成、现存Hook lint警告保持。
- Debian下载慢，media-runtime使用本机已验证Linux镜像12e9238805b5的ffmpeg/chroot库与launcher；与本候选media-sandbox.c/prepare-media-runtime.sh的源码diff为空。固定媒体runtime层和构建Dockerfile另外保存，没有替换App业务为旧镜像。
- 切流前再次刷新main至e6d09ff，新增fleet模块仍在实施、20:00调度和真实部署未完成；未把未完整交付的fleet阶段接入本次业务开站，也没有自动触发跨站任务。其他后续仅视频测试/文档，不改变本候选运行功能。
- 共享主工作区不切分支、不覆盖同事改动；本分支已推5fc5efe，开站文档另行task-only提交。

## 证据、回退与后续

本机E:/Workspace/naumi/output/naumi47-public-20261014；47 /opt/naumi-staging/evidence/public47-20261014。
保留MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh及全部baseline/镜像/构建/公网证据。
回退先ROLLBACK.sh --check；--fixture在独立网关副本实际恢复摘要通过；--execute仅平滑切回旧入口，业务数据库/新账号/媒体/在途新任务不回灌、不删除。
旧槽保留而非立即排空停机，因为旧员工项目和缓存仍需要过渡。归属历史迁移没有仅凭同名自动完成。
正式应用发布本轮1次；47空间维护计数累计1，磁盘仍有余量，未无筛选prune或删他人版本。
