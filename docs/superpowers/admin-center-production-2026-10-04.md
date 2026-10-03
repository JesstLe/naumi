# 管理中心整合：生产验收

2026-10-04 按现有发布授权完成部署。将原运营 BI、计费管理、内部定价测算和系统设置纳入统一管理导航，入口 `/admin`、`/admin/center`。旧 `/admin/bi`、`/admin/billing` 保持可用；部署过程没有修改计费引擎或供应商调用链路。

- 应用提交：`6b70e147071a80d276c6b9037d2ee429daeb533d`；实际 `/api/version`：`1791054907`。
- 当前 release：`/opt/naumi/releases/6b70e147071a-20261004-035803`；前一 release：`/opt/naumi/releases/bbc0ec411ff4-20261004-025807`。
- 应用和视频 worker 固定镜像：`ghcr.io/jesstle/naumi:6b70e147071a80d276c6b9037d2ee429daeb533d`；镜像 ID：`sha256:b152eed5debcefaed3d259aac2b6c0e8658e4f09538839c934695d1f55741c58`。
- 源码包 SHA256：`bfbcb378a3838e13e0a730ac3c23bada2c79da0af0951efc99f33ad3c1826c16`。
- 离线镜像包 126647761 字节，SHA256：`94e8e539321d4bcdb1f3b181b277ce4e3013bb9552ff6c3d9107b808f096a783`。

## 验证

- 本地类型检查、生产构建、13 项浏览器验收、BI 数据与用户管理回归、私有报价访问校验通过。界面截图来自隔离测试配置，不是生产价格。
- 最终 CI [回归 37147219365](https://github.com/JesstLe/naumi/actions/runs/37147219365) 和 [镜像 37147219187](https://github.com/JesstLe/naumi/actions/runs/37147219187) 均成功。回归包含原有计费套件及图像、质量、BI、用户管理和商品验证。
- 原视频浏览器 fixture 存在报价未加载就点击提交的时序问题；改为等待模型与明确的 fixture 报价，保留请求编号及参考图只上传一次的断言。
- 线上授权读取验证 11 个数据分区及其 API、旧入口、计费及内部定价页面；匿名和普通用户访问仍被拒绝。
- 已存储计费配置版本仍为 `1`，原配置哈希和各项价格一致。余额、积分流水、用户、批次、媒体及供应商配置快照一致。
- 应用与 worker 镜像一致，数据库健康、外部入口恢复，生产 `.env` 和 Nginx 配置逐字节一致。没有发起付费供应商调用。

## 备份与回滚

切换前关闭入口并暂停应用与 worker，确认无进行中任务或未处理计费操作。服务器备份目录 `/opt/naumi/backups/admin-center-20261004` 权限 0700，保存最新数据库、配置、原发布路径和验收快照。

数据库与配置备份已保存到受保护的本机 `output/billing-20261003/production-backup/admin-center-20261004-db-config.tar.gz`：677388 字节，gzip CRC 验证通过，SHA256 `ff21ef5dbbc7893146952831cda3e12eb54fa08bc24d831b680aef63cc914a10`。备份含凭据，必须保持忽略与访问限制，不能上传 GitHub。

媒体沿用已验证的异机完整备份 `appdata.before.tar.gz`，SHA256 `bce5ab305780c6839b859f4858aaf74090869df71139841da7d3bdd9e8b0d460`。发布前确认自备份开始以来没有新增或修改媒体文件；现有媒体卷始终保留。

按 `scripts/deploy-release.sh` 使用固定镜像发布，`ROLLBACK.sh --check` 通过。回滚前保持维护模式与 worker 暂停，检查当前任务和配置再执行；不自动恢复数据库、余额或媒体卷。旧镜像、旧 release 和所有备份均保留。
