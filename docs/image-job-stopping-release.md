# 生图持续等待修复：上线验收（2026-10-08）

## 完成

- 生产基线 d5a80fa5db86bad28c0a5472119ca9a6218bfbb4，只挑入 13 个任务文件。发布提交 84e1afdee61013f3d5320b00bf688ae125b98179，应用和 worker 均使用该固定镜像；主开发分支修复提交 a6b891e 已推送 GitHub。
- 本地独立 PostgreSQL、HTTP mock、真实路由测试、计费/Router 回归、生产镜像构建通过；浏览器看到断连失败后停止等待，积分恢复，刷新不恢复失败任务。未主动发起真实收费生成。
- 8 笔历史未交付任务 error / billing released，释放 58 积分；每笔 reconciliation 恰为 1 条，reservation 为 0，供应商未知费用及响应证据哈希保持。
- 另 1 笔历史批量任务具有供应商成功 1 张的证据，但业务未保存图片；进入 needs_attention，12 积分 hold 保留，不直接退款。新版查询将其映射为客户端 error，停止 loading。
- 默认生成、编辑仍 gpt-image-2 → https://api.tdhcodex.com/v1；模型配置版本 2、计费版本 1 及配置摘要不变，STORAGE_DRIVER=s3。无 DDL 迁移。
- 公网 health / generate / canvas / suite / aplus 均 200，未授权任务查询 403。发布后观察到 1 笔用户自然提交任务成功，最新检查 pending 为 0。

## 发布过程及恢复

- 使用现有 deploy-release.sh，独立源码包和离线固定镜像，备份配置和 PostgreSQL（pg_restore --list 可读取）。正常在途任务排空后短暂维护发布。
- 首次排空检查识别到有部分成功证据的旧任务，暂停发布并恢复旧服务，再将其明确纳入停止等待但保留账务的核对范围。
- 第一次新镜像启动已完成旧任务关闭；恢复公网时 Nginx reload 后立即请求仍收到维护 503，触发了协调发布的恢复分支。记录保留，不将该尝试算作上线成功。
- 最终 finalize-production.sh 对已经准备好的发布再次排空、启动 app/worker，恢复原 Nginx 并重试确认维护状态消失；固定版本、公网健康、权限边界与不变配置全部通过，最终 exit 0。
- 生产 ROLLBACK.sh --check 已通过；一次协调回滚曾因核对中的模型任务而停在保护检查，最终已重新发布热修复。未声称生产完整回滚演练通过。独立源码副本逆向补丁演练通过，13 文件与生产基线逐字节相同，旧 pending 行为复现通过。

## 尚待人工核对

job-e9320e18-904c-42f7-a8e4-45b73c8f416f：批量 2 张，供应商 1 张 response-received / delivered=1，另一张 unknown；业务没有图片持久化，12 积分仍 hold。应核验原供应商结果和费用、补交已有图片或据证据结算，不重新提交生成。

## 证据

E:\Workspace\naumi\output\image-pending-release-20261008\VERIFICATION.txt 保存命令、输入、输出、退出状态、制品哈希、生产备份及回滚信息。原私钥未修改，临时副本验收后清理。数据库和 NAS 媒体未删除或恢复。
