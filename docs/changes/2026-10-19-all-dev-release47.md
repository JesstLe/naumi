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
## 切流前中断核对（2026-10-19）
首次事务已完成备份和导入，快照在app_image_jobs关系闭包扩展达到原5秒语句上限，未创建容器/控制Worker/切流。原releaseId及备份UUID7451dc3f、导入UUID4161dda7保持；新resume入口严格限定BASELINED+这两项ACK+无候选，重新核对canonical revision/digest、旧槽、配置、网关、历史事件、备份、镜像。
快照默认仍5秒；此次按已观察的查询成本允许显式15秒上限、全查询300秒上限，保持只读repeatable-read、1秒锁等待、行数/根数/字节上限和不可缺行校验，不跳过任务保全。image inspect实核Docker containerd标识为manifest-list9b43d564，archive config blob为de7cf68b，归档/源/构建/RootFS逐一核对并保留两种标识映射，禁止猜测镜像已加载。
这些是发布工具与只读验证修正，不修改已构建Web/Worker程序；运行候选仍固定源码5d7631a0/build1792383873。线上是否发布依最终验收回执。
### 首次切流的真实切回
2026-10-19首次切流后浏览器跨版保存/旧资源均通过，但新Worker尚无首次tick时lastTick=null，检查器触发AttributeError。发布器实际暂停并核实新槽无工作、恢复旧Web接收/旧Worker、逆向整closure CAS/nginx-t和平滑reload切回，journal=ROLLED_BACK，全部操作ACK；公网1852恢复，未回灌DB/重放任务。
失败候选在三锁下两次排空证明后仅停止其两个明确ID，旧生产仍服务。空tick现改为等待，增加None/缺字段/未知/完成四分支测试。r2使用全新normal journal/旁路槽身份，重做全链路验收，不将首轮浏览器成功冒称最终上线。静态union目录对Nginx显式0755，私有证据保持0700；首次因umask导致的读权限门禁失败也在切流前停下并按原UUID复核。
