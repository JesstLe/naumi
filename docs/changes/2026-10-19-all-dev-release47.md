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
## 最终程序上线验收（2026-10-19 12:49:46 北京时间）
- normal releaseId=release47-alldev-20261019-r2，phase=COMPLETE，canonical revision144；三锁已释放。
- 运行SOURCE_COMMIT=5d7631a06cb3ca64b036641ba85eddf72fb5d3fa，BUILD_VERSION=1792383873；Web/Worker同image sha256:9b43d564c51fd26a45d8d8129f1e1faac21459f2337272b7651ca015a588deb2。后续提交仅修正运维工具及归档，不冒称重新构建业务程序。
- 新Web4a06a3cd/13102、Workerbe57dedc直连新Web，首次真实服务端tick完成并有receipt hash；旧1852 Web d11e2580/Worker483d9bb9两次综合排空后停止、restart=no，保留旧镜像/容器/备份。
- 切流UUID23010fb8-b103-4121-a145-32cb81500ea4；Nginx完整SHA8acd9eec…；运行7容器（统一Web/同镜像Worker/5基础服务），参考工作台保持。
- 真实浏览器：既有登录、画布/3D WebGL、旧页document/编辑保存读回、16旧静态hash、390px、pageerror0；QA临时节点删除。线上图片Dock共用header/footer/无重复面板通过。
- 真实只读planImagegen：canvas/edit、1张有权参考、gemini-3.0-pro-image-three-four、medium/1K/3:4/PNG/n1，HTTP200，modelVersion118/billingVersion8/6积分，eligible=[geeknow-nano-banana-pro]；未提交生成。
- 任务快照preservationVerified=true、noMissingJobs/noOriginalSupplierMutation=true、violations/unknownTables均空；配置v118/计费v8 hash不变。152次连续健康HTTP200/db.ok=true。
- normal rollback check PASS，可读DB备份/旧槽/逆向网关hash核对通过；r2未执行生产切回，首轮真实切回另有回执。root历史MIGRATED_CLEANUP_PENDING/legacyDrainProven=false及两未结事件原样保留，付费任务未重放/退款/补扣。
- 最后MemAvailable4472MiB，Swap用780KiB，磁盘空11336298496bytes/使用80.2%；仅过滤72小时前构建缓存，实际释放0B，不删除有效回滚镜像/业务数据。
- APIB启用新授权已接手，但尚无新模型publication，当前v118新来源仍禁用；负责人仅本地准备精确可启用契约/最小diff，统一线程后继三锁CAS单独发布，不恢复收费验收/自动收费巡检。企业独立服务激活仍HOLD。

本地证据output/all-dev-release47-20261019；远端/opt/naumi-staging/evidence/all-dev-release47-20261019-r2。后者ROLLBACK.sh默认只读核对（可加--check），--apply为显式程序/入口切回，不回灌DB，不重放任务。
