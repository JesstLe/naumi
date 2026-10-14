# GitHub固定镜像交付流程

用户确认：三个版本由GitHub构建并存GHCR、镜像包按需生成、文档不触发构建；发布选已验收固定提交并沿用103备份/两锁/旁路切换，47保持未上线。沿用现有GitHub仓库与Actions，没有安装GitLab或创建新构建服务器。

## 构建与存储

`.github/workflows/docker.yml`：main业务源码变化只构建普通候选；普通文档变化不触发，实际构建依赖的报价JSON仍触发。手动运行选择已验收40位source_commit，默认构建ui/desktop/enterprise三种Linux amd64界面；发布tag也构建三种。版本来自该源码commit时间，运行ID/重跑次数和实际工作流commit独立记录，不能把工作流代码SHA当作所选业务源码。构建选定源码与工作流控制脚本分两个checkout，编译/类型检查在Dockerfile内执行。

GHCR分别存`<sha>`、`<sha>-desktop`、`<sha>-enterprise`；交付manifest使用不可变registry digest和runtime Image ID，发布不拉latest。manifest冻结平台、媒体变体开关、界面类型、来源/版号、run/attempt。三种镜像全部完成才公布GitHub预发布候选；失败保持draft，不能作为交付完成。

每次构建只上传很小的manifest到GitHub Release，不再默认docker save/upload-artifact大包或90天构建记录；缓存按界面分scope、mode=min。main过时构建可取消，手动固定候选不自动取消。私有GHCR不能匿名拉取；服务器没有受保护registry凭据时，手动勾选offline_bundle，由GitHub Runner导出三包，SHA256/长度入manifest，放在同一个私有GitHub Release附件，避免Actions artifact小配额。每包必须小于2GiB。没有扩大包可见性、创建长期GitHub令牌或把GitHub凭据写入服务器。

ACR只保留按需镜像复制：手动选择完整GitHub Release及SHA，已有ACR变量/密钥齐全时复制GHCR已构建的固定digest，不重复编译。未配置时跳过；本轮不启用大陆Naumi或配置新的ACR服务。业务回归workflow保留原检查，增加文档跳过/过时任务取消/60分钟上限；现有billing回归失败不会被标记为通过。

主线普通镜像继续保留GHCR latest别名，手动ACR复制亦保留普通版latest，兼容现有install.sh；本轮生产准备/发布只认固定manifest digest，不使用该别名。历史管理后台update-check仍比较main时间戳、没有接新manifest；它不是本轮安全发布器，文档提交不等于新可发布镜像，不从该旧安装命令绕过两锁/旁路/受影响验收。

## 获取和发布

在已登录GitHub CLI且可读本仓库Release的受保护本机下载：

```powershell
python scripts/github-release-manifest.py fetch --tag <codex-image-SHA-runID-aATTEMPT> --expected-sha <40位SHA> --directory output/github-candidate --offline
```

本机独立GitHub CLI令牌没有Actions dispatch权限、不能读取draft Release；浏览器已登录身份可正常启动。同仓库现有Git Credential Manager身份实际可读取draft，提供`invoke-github-release.ps1`在内存中短时复用该既有凭据，不新建令牌/扩权或改GH登录存储，退出时还原GH_TOKEN，也不传到服务器。可运行`./scripts/invoke-github-release.ps1 -Mode Build -SourceCommit <40位SHA> -Offline`启动三镜像，完成后以`-Mode Fetch -SourceCommit <SHA> -ReleaseTag <TAG> -Directory output/github-candidate -Offline`下载。只有当前仓库被绑定，不接受任意仓库目标。

脚本只接收本仓库的已公布候选，核对实际工作流完成且success、run/attempt/workflowCommit与记录一致、三界面齐全、每个离线文件的名称/长度/SHA256。指定输出须新建空目录，避免覆盖其他任务文件。默认需要三个版本；普通候选只验收ui时明确加`--flavors ui`。不把独立业务回归流水线是否通过与镜像工作流成功混为一谈。

将manifest、对应离线包和该脚本经原受保护SSH流程传到103任务目录。在103导入准备（有registry凭据可省略offline-directory，直接pull digest）：

```bash
python3 github-release-manifest.py prepare --manifest incoming/release-manifest.json --expected-sha <40位SHA> --offline-directory incoming --directory prepared
```

必须超过10GiB可用。所有离线校验先完成才docker load；导入后核对实际Image ID、source/version/platform/界面标签，按ui→desktop→enterprise固定顺序输出`release.json`与`release-images.tar`，兼容现有槽位控制器的材料接口。只有`IMAGES_READY`代表准备成功，绝不自动启动App/Worker、改网关/env/DB或收费任务。

下一步仍按RELEASE_RUNBOOK：刷新main及已完成同事分支→明确候选来源与实际站点→持两锁读取最新基线/可读备份→适配空闲旁路端口→就绪→隔离Nginx语法检查→切流→旧资源/受影响真实功能与公网实际版本→保留回滚→释放锁。UI-only沿用原creation/Agent/Worker，不套用会停站的历史单容器deploy-release.sh；全应用发布仍受Agent/Worker连续工程门槛约束。47继续私有准备；旧120/179/101不连接。GitHub候选完成不是网站已经上线。

## 验收状态

集中9项校验通过：SHA/平台/媒体开关/来源和摘要篡改、缺界面/重复JSON、runtime来源/界面错配、混run、固定ui→desktop→enterprise顺序、损坏离线包在任何Docker调用前拒绝、错误工作流不下载镜像、classic/containerd身份绑定、不同Docker ID格式下registry digest仍必须匹配。三个工作流actionlint v1.7.11通过；PowerShell包装器语法、既有Git身份读取draft及真实Fetch通过，未重复调用Build包装器制造额外作业。

GitHub真实工作流38523814746 / control57eab3b / business3bbebee全部5 jobs成功，11分7秒，三个镜像实际上传GHCR，Release公布且Actions Artifacts为0。源码内容版号1791956027，780,382,767字节三份离线包全量下载/长度/SHA256通过。合main c7c33ea后自动普通候选38524909039亦成功（含7项当时版本校验）。独立业务回归38524909050已通过billing-all，后续Billing admin browser acceptance仍失败；未以镜像成功伪称全业务回归通过，未绕过生产受影响验收。

103实际获取和Docker导入三镜像通过，生成兼容控制器的release.json及1,385,352,192字节release-images.tar；source/版号/架构/界面和配置/manifest摘要均核对。首次导入发现GitHub输出config ID，而103的containerd store输出archive manifest ID；补齐已校验离线包内config/manifest哈希绑定，保留原immutable registry digest和包SHA，输出103实际runtime ID，未改旧记录或宽松接受同名镜像。所有离线SHA先核对齐才解析包/导入，已验证的本地镜像可复用。此次没有再次构建三图像来解决导入器问题。

SFTP慢速后仅终止本任务已核定的客户端writer，并确认原进程结束；服务器通过GitHub签发的短时只读Release CDN地址获取剩余字节，完整包保留、半包HTTP Range续传，最终三包SHA通过。GitHub API身份仅在受保护本机内存，下载地址仅通过SSH stdin传送、未落盘/日志；没有把GitHub账号令牌传到服务器，没有新增带宽费用或长期访问凭据。

导入前后实际在线容器ID/镜像/启动时间/重启次数、Nginx/env/Compose指纹和公网入口版本保持，health/DB OK；生产UI仍3bbebee / 1791956188，核心App/Worker c05a923、企业API43cccd5保持。应用源码没有复制到服务器，仅复制运维校验工具；数据库/媒体写入和模型调用0。未连接47/旧120/179/101，47继续不上线。不把导入候选当作上线。

因验证用候选使磁盘到82%，确认本轮可读DB备份和当前容器引用后，实际持Naumi/Hub两锁，仅移除三个未被任何容器引用、版号1791956027的测试候选镜像及本任务incoming压缩包/导入tar；原正在运行/此前成功镜像与全部回滚/7天备份/业务媒体保持。实际释放4,731,133,952字节，103恢复79%/24.9GiB可用；候选标记改为IMAGES_IMPORTED_VERIFIED_RETIRED，不能再当成可直接切流材料，GHCR/Release及本机完整校验包和服务器manifest/导入回执保留，需要时重新prepare。两锁核对FREE，维护计数仍0。

服务器证据 /opt/naumi-staging/evidence/github-release-flow-20261014；本机 output/github-release-flow-20261014。流程/工具修改已普通合main，后续文档提交不触发重复构建。UI修复此前已上线，不重复切换，也不将未验收main视频/性能候选上线。
