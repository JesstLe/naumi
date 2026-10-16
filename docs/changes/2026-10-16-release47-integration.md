# 47 主站集中候选与内存保护 / 2026-10-16

## 用户要求与目标
- 等其他线程结束，再把最近完成工作发布到 47.105.59.142；用户进一步强调保护内存。
- 只涉及 47，不连接或更新默认103及历史服务器。共享checkout的18项未提交后台/UI改动保留。
- 其他项目线程已结束。独立分支 codex/release47-integrated-20261016，不在共享checkout切分支或提交他人文件。

## 已整合
- 包装策略Skill、账号内文件导入/拖放、独立交互包装页及Agent失败处理。
- 企业共享Skills/精选电商Skill/完整商品预览、工作台输入布局和上传限制，避免整站候选回退已部署功能。
- 画布手动位置/百分比进度/选中批量运行/选择平移模式。
- 图片focus保留与重新鉴权、完整返回画幅/显式尺寸contain及恢复入口修复。
- BI输入输出/前端显示名称到上游尝试链路、企业作品权限一致性。
- 通道实时禁用/已接单原路GET恢复、供应商编辑能力证据、后台模型健康模块。
- 公开更新记录与生命周期/Worker控制模块。健康模块代码纳入，不启动额外自动付费探测Worker。
- 吉祥物只完成设计；底部Dock去重在别人的未提交暂存区，均未擅自导入。

## 合并处理
- canvas-client冲突同时保留账号epoch取消检查与手动拖放位置记录。
- ModelExecutionScope同时保留frontendModel与channelGuard；不扩展冻结ExecutionModel序列化格式。
- Skills企业共享与上传组件保留两者；直接导入仍为仅当前账号私有，返回真实作者及canEdit，避免导入命中企业共享副本。
- 修正集中fixture：BI在独立数据库建立真实active config供通道门槛读取；健康子进程带react-server条件；供应商超时测试不使用过紧的80ms；更新记录测试检查原目录字节不变。

## 实时47检查（13:11北京时间，三锁同持）
- 主机7270MiB RAM，MemAvailable2110MiB；4GiB Swap未使用，Swap不计候选容量。
- 主Web当前2309890048字节（约2203MiB），历史峰值2518638592字节（约2402MiB）；cgroup max事件5321，oom/oom_kill均0。没有调整在线内存上限或重启。
- 13个运行容器；主入口13070、画布13068、登录13063、原生工作台13071、Worker恢复App13052。网关仍有canvas sub_filter历史覆盖。
- Worker仍legacy runner直连13052，无已部署的暂停/排空控制。app_agent_sessions没有实例归属字段，真实运行Agent计数未知。
- generate pending8/有效租约1，imagegen pending1/有效租约1；为父子计数，不是独立用户数。provider有效租约0不代表全链路排空。
- public /api/version = f4b3df127f2fcaf37f9cd866a480f3c6fd4b2358 / 1791989816；模型配置117；DB健康通过。
- nginx -T SHA256 f854851f4c836f2bd4e12425e5ea0944c23c9fd44a7021fa81912b00f37a97e8。
- 现场诊断三锁已释放。未在服务器构建、上传制品、创建容器、改数据库、改配置、切流、暂停任务或停任何容器。

## 内存门槛与发布阶段
- 早期预检按新Web1536 + Worker保留256 + 最低可用1024 = 2816MiB已HOLD。
- 读到在线主Web真实2402MiB峰值后，保守调整规划为Web2560 + Worker256 + 最低可用1024 = 3840MiB；现有2110MiB差1730MiB。该数是发布容量规划，不是已测候选业务峰值。
- 当前状态：LOCAL_CANDIDATE / HOLD_MEMORY_AND_LEGACY_DRAIN，**没有上线，不标发布完成**。
- 后续先补足真实双槽内存余量，补齐旧Web活动Agent/已接任务归属和旧Worker可控交接，再在同一三锁期备份、启动唯一同镜像候选Web/Worker、旁路真实验收、nginx平滑切流、排空并停止已核实旧槽。旧静态资源/旧客户端协议须覆盖。
- 新受控Worker在UNKNOWN时仍缺服务端tick核对解除流程，不单独装入线上开启；不以测试fixture代替业务排空。

## 验证与证据
- 匹配锁定Next15.5.27/React19.3.0依赖的完整TypeScript退出0。
- 本机专用PG192MiB/0.5CPU，测试串行；Linux构建器固定6GiB RAM、同额Swap上限（不额外使用Swap）、2CPU，Node堆4GiB。47无构建负载。
- 首次24套集中回归16通过/8失败；失败包括未准备原始fixture、遗漏测试参数、Windows SIGTERM行为及实际合并后的fixture适配。保留所有原始失败日志。
- 修正/补齐后逐项重验，完整结果与本地Linux不可变镜像/回滚证据见 output/release47 与 E:/Workspace/naumi/output/release47-integrated-20261016/VERIFICATION.txt。Linux进程交接与生产Worker交接分开记录。
- 原始业务source与最近候选均保留，回滚只在独立源码副本演练；没有生产DB回灌或重放收费任务。
- 本轮发布次数0；功能整合已fetch同步，main保持c2634fb，候选推独立远端分支，不把未发布候选合入main称生产版本。
