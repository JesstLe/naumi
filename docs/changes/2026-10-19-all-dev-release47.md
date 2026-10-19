# 2026-10-19 全开发分支统一发布47

## 范围及当前阶段
- 最新用户授权：合并所有分支，然后上线服务器，退役旧容器。
- 目标仅47；全部已完成开发分支普通整合，历史备份、回滚兼容分支保留，不提交他人未提交内容。
- 已整合精确比例462d39aa、草稿94589b26/反馈7fa6da22、统一Dock9a1b2941、APIB异步e6ce5a28、企业源码cefd7748。
- 企业独立服务激活仍HOLD，不启动独立服务或配置身份。APIB所有新增来源维持禁用、收费验收PAUSED，不运行登记/启用脚本。
- 本文件首次提交时：线上1852b21c/build1792297790，模型v118、计费v8；尚未创建服务器候选、切流、退役。

## 新常规后继执行器
- normal policy/controller/rollback使用新normalBlueGreenReleases journal，保留历史blueGreenSuccessor对象与legacyDrainProven=false。
- 完整事务持三锁；canonical/gateway/容器/配置CAS；固定镜像、可读备份、双槽资源门槛、暂停Worker旁路、鉴权/DB/浏览器跨版保存/旧静态验收，平滑切流、两次当前排空证明后仅停止本轮旧Web/Worker。
- 当前unknown必须0；两笔历史main7bd事件单独逐字节保护，不声称已解决。未知付费任务不重提、不退款、不补扣。
- 独立normal rollback：默认只检查固定旧镜像、旧槽、DB备份、完整网关逆向hash；--apply需显式参数、暂停并核实新槽无任务，只恢复程序/入口，绝不回灌DB或重放付费任务。UNKNOWN必须按原UUID核对。
- 仅过滤72小时前构建缓存，不清镜像、volume或业务数据，导入后保留10GiB空间。资源不足就不创建候选。

## 验证与证据
本机合并后集中验证及运行记录位于output/all-dev-release47-20261019。实际切流、退役与最终版本以后续签名/哈希证据为准，不将本记录或源码合并当作已上线。

## 同步计数
开工和合并后fetch origin/main=f4bf7935，无共享checkout更改。下次构建和切流前再次fetch复核；本轮集中同步后功能计数0。
