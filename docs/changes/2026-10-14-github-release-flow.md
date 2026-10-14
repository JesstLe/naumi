# GitHub固定镜像交付流程

用户确认：三个版本由GitHub构建并存GHCR、镜像包按需生成、文档不触发构建；发布选已验收固定提交并沿用103备份/两锁/旁路切换，47保持未上线。沿用现有GitHub仓库与Actions，没有安装GitLab或创建新构建服务器。

## 构建与存储

`.github/workflows/docker.yml`：main业务源码变化只构建普通候选；普通文档变化不触发，实际构建依赖的报价JSON仍触发。手动运行选择已验收40位source_commit，默认构建ui/desktop/enterprise三种Linux amd64界面；发布tag也构建三种。版本来自该源码commit时间，运行ID/重跑次数和实际工作流commit独立记录，不能把工作流代码SHA当作所选业务源码。构建选定源码与工作流控制脚本分两个checkout，编译/类型检查在Dockerfile内执行。

GHCR分别存`<sha>`、`<sha>-desktop`、`<sha>-enterprise`；交付manifest使用不可变registry digest和runtime Image ID，发布不拉latest。manifest冻结平台、媒体变体开关、界面类型、来源/版号、run/attempt。三种镜像全部完成才公布GitHub预发布候选；失败保持draft，不能作为交付完成。

每次构建只上传很小的manifest到GitHub Release，不再默认docker save/upload-artifact大包或90天构建记录；缓存按界面分scope、mode=min。main过时构建可取消，手动固定候选不自动取消。私有GHCR不能匿名拉取；服务器没有受保护registry凭据时，手动勾选offline_bundle，由GitHub Runner导出三包，SHA256/长度入manifest，放在同一个私有GitHub Release附件，避免Actions artifact小配额。每包必须小于2GiB。没有扩大包可见性、创建长期GitHub令牌或把GitHub凭据写入服务器。

ACR只保留按需镜像复制：手动选择完整GitHub Release及SHA，已有ACR变量/密钥齐全时复制GHCR已构建的固定digest，不重复编译，不推latest。未配置时跳过；本轮不启用大陆Naumi或配置新的ACR服务。业务回归workflow保留原检查，增加文档跳过/过时任务取消/60分钟上限；现有billing回归失败不会被标记为通过。

## 获取和发布

在已登录GitHub CLI的受保护本机下载：

```powershell
python scripts/github-release-manifest.py fetch --tag <codex-image-SHA-runID-aATTEMPT> --expected-sha <40位SHA> --directory output/github-candidate --offline
```

脚本只接收本仓库的已公布候选，核对实际工作流完成且success、run/attempt/workflowCommit与记录一致、三界面齐全、每个离线文件的名称/长度/SHA256。指定输出须新建空目录，避免覆盖其他任务文件。默认需要三个版本；普通候选只验收ui时明确加`--flavors ui`。不把独立业务回归流水线是否通过与镜像工作流成功混为一谈。

将manifest、对应离线包和该脚本经原受保护SSH流程传到103任务目录。在103导入准备（有registry凭据可省略offline-directory，直接pull digest）：

```bash
python3 github-release-manifest.py prepare --manifest incoming/release-manifest.json --expected-sha <40位SHA> --offline-directory incoming --directory prepared
```

必须超过10GiB可用。所有离线校验先完成才docker load；导入后核对实际Image ID、source/version/platform/界面标签，按ui→desktop→enterprise固定顺序输出`release.json`与`release-images.tar`，兼容现有槽位控制器的材料接口。只有`IMAGES_READY`代表准备成功，绝不自动启动App/Worker、改网关/env/DB或收费任务。

下一步仍按RELEASE_RUNBOOK：刷新main及已完成同事分支→明确候选来源与实际站点→持两锁读取最新基线/可读备份→适配空闲旁路端口→就绪→隔离Nginx语法检查→切流→旧资源/受影响真实功能与公网实际版本→保留回滚→释放锁。UI-only沿用原creation/Agent/Worker，不套用会停站的历史单容器deploy-release.sh；全应用发布仍受Agent/Worker连续工程门槛约束。47继续私有准备；旧120/179/101不连接。GitHub候选完成不是网站已经上线。

## 验收状态

实现完成，尚待集中manifest篡改/混版本/界面顺序/工作流语法检查、实际GitHub三镜像构建和103只导入验收。不重复切换已在线3bbebee修复，也不将未验收main视频/性能候选上线。此流程模块不增加成功应用发布次数。
