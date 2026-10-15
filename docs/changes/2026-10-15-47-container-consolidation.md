# 47 容器收敛与在线用户连续性（2026-10-15）

## 状态与范围

用户要求“开始吧，注意，本次优化不要影响用户的使用，他们正在用”。本次只对47.105.59.142执行第一阶段资源收敛，不切换程序版本、不改变公网路由、不重启在线App/Worker/Hub/数据库，不操作103或其他主机。变更后30分钟复核窗口已完成；第二阶段统一版本及第三阶段业务切换尚未执行。

## 直接证据与协作

- 4核、7270MiB内存；此前16:14 MemAvailable约169MiB，负载52.18，53个阻塞任务，16:12–16:17反复memory pressure，16:17主机重启。触发进程、重启来源仍未确认。
- 开工刷新origin/main，独立分支codex/ssh47-consolidation-20261015，worktree基线c2634fb。读取该基线AGENTS和RELEASE_RUNBOOK，遵守47三把部署锁与蓝绿/排空约定。
- 向当前相关开发线程发出协作通知，避免并行发布和退役；并发线程交接只读依赖盘点，APIB线程明确要求保留13072/13073候选。没有创建子Agent或委派新的并行任务。
- 核实完整nginx -T及map、systemd/cron/配置、运行容器Env引用、容器网络连接、后台角色、DB任务/租约及现有备份可读性。Router运行环境仍引用13052容量回调，必须保留。

## 已执行的变化

全程共同持有：
- /opt/naumi-staging/releases/deploy.lock
- /opt/naumi-reverse-hub/releases/deploy.lock
- /opt/reference-workbench/deploy.lock

以下7个旧Web经4轮、每轮间隔15秒检查无活动连接、无路由/配置/Env依赖、NAUMI_VIDEO_WORKER=0后，逐个设置restart=no并正常stop。每个完成后检查5个公网入口及13个受保护实例。没有docker rm旧业务容器，没有删镜像或volume。

1. naumi47-blue-geeknowenv（13056）
2. naumi47-model-family-4f20af1df696（13057）
3. naumi47-skills-curation-f4b3df127f2f（13055）
4. naumi47-enterprise-skills-183dff86a8a8（13054）
5. naumi47-dashboard-87d23d2ccf7a（13053）
6. naumi47-chat-plan-r4-20261015（13066，保留近期回滚材料）
7. naumi47-r2-image-native-20261015（13069，保留近期回滚材料）

保留主站13070、参考工作台13071、画布13068、登录13063、Router容量回调13052、独立候选13072/13073、Worker和5个基础服务；原工作台/Router/Mihomo等systemd服务同样保留。

另追加4GiB应急Swap：/swapfile.naumi-emergency，0600，priority10；/etc/fstab仅追加自身挂载行，保存原件与哈希，候选fstab已findmnt --verify验证。没有修改vm.swappiness（仍0），没有为了验收主动制造内存压力。当前Swap使用0。

## 验收与回滚

- 运行容器20→13。事务前MemAvailable2077592KiB（1.98GiB），事务后3537640KiB（3.37GiB），释放约1426MiB可用余量；后续活跃业务时约3.1GiB。
- 事务内70/70入口GET返回200，覆盖health/version/dashboard/canvas/native-workbench。6项带短时测试会话的GET通过：登录态、模型目录、原生鉴权、原生设置、功能权限、视频任务列表。未记录Cookie/密钥或用户响应正文，未创建收费请求。
- 13个受保护实例ID、Image ID、StartedAt及重启策略完全相同；网关字节/哈希保持77afe920f852a805ae2e8803e0e2c3b7016241c5e5d6009838c15b557c4a275b。没有nginx reload或业务版本切换。
- 外网20次串行真实SSH认证均成功，输出SSH_OK，exit0，最大0.573秒。
- 两份回滚副本恢复原manifest/fstab字节且哈希一致；独立32MiB、network=none的Docker fixture真实调用同一个rollback_execute函数，恢复running=true、restart=unless-stopped和原ID/镜像，随后移除临时fixture。没有恢复/重启七个旧业务实例，也没有回灌数据库。
- 合并集中离线契约12项通过，包括受保护/未知实例拒绝、原件不变、替换身份拒绝、配置扫描不读数据库页、fstab重复项拒绝和回滚副本。
- 初版预检误将二进制数据库页中数字当依赖，在任何停止前终止；修正为仅扫描配置文本后重新核实。主机swapon不支持--json，在任何Swap修改前改为解析/proc/swaps。Windows离线测试发现路径分隔符导致重复项判断不一致，改用as_posix；Linux实际变更本身不受此差异影响。没有绕过有效依赖检查。

## 现有业务问题，独立记录

观察期间发现/api/artworks/parents两次500和媒体一次客户端取消499。无退役端口upstream错误；同期数据库错误是既有STAGING_IMPORTED_HISTORY_READ_ONLY保护，变更前已有93条，16:50统计变更后35条，未出现其他SQL ERROR类别。不将其归为“零业务错误”或声称全部UI功能已验收。本次没有更改该触发器或重试用户操作。

## 后续待办

1. 在线版本分散仍需整合；先合入已完成分支、完成受影响模块集中验收，核实main/native差异及旧页面协议兼容，再单候选蓝绿。用户在途会话和任务未排空前不切换/停用在用实例。
2. 明确常态Web/Worker/必要native及单候选容量预算，接入发布脚本门禁；本次一次性退役工具不等于所有发布入口已自动受控。
3. 13052承担Router回调；若要取消，另做兼容接口迁移和蓝绿，不能仅因“旧容器”而停止。
4. 根据真实业务压力决定是否扩内存；Swap不是扩容替代品。没有为凑7–8个目标数量强停仍在用或他人候选。

## 证据与计数

本地产物：E:/Workspace/naumi/output/ssh47-optimization-20261015/
- MODIFIED_FILE.json、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh
- ORIGINAL_FILE.json、ORIGINAL_SHA256.txt、ROLLBACK_COPY.json
- SWAP_*、result.json、user-continuity.json、external-ssh20.json、各检查脚本/日志

服务器：/opt/naumi-staging/evidence/ssh47-optimization-20261015/，retirement-v2和swap分别保存可执行0700回滚脚本；--copy已执行，--execute仅在隔离Docker fixture测试，业务现场保留优化后状态。

维护计数：无版本发布，不增加成功发布次数；没有清理构建缓存/有效备份/镜像，不虚记空间维护归零。功能迭代同步计数：运维收敛非业务功能迭代，未增加；源基线c2634fb，最终fetch仍c2634fb；本分支只包含运维脚本与交接文档，不修改业务代码。共享checkout分支和未提交工作保持。

## 最终复核与发布交接

- 事务完成08:43:55UTC，复核结束2026-10-15T09:13:56.136229+00:00，自动采样实际2026-10-15T08:51:38.515214+00:00至2026-10-15T09:13:55.913637+00:00，46轮、230/230入口响应200；前段由逐实例验收、Swap/登录态/SSH检查覆盖，不将自动采样误记为完整30分钟。
- 自动采样MemAvailable最低3.06GiB，所有受保护容器和网关保持原值，Swap仍未使用。13个业务/候选/基础实例保持运行，7个旧实例保持停止/restart=no。
- 三锁释放；已向协作线程确认可以安排下一发布窗口，但其仍需重新获取三锁、核对实时在线基线与资源容量；仅generate-image蓝绿变更也要保留画布13068、Router回调13052、登录13063、API适配和Worker，并尊重13072/13073候选所有者。
- 本次阶段A完成不等于阶段B/C统一业务版本或所有未来发布入口容量门禁已实现。
- 运维源码9154cbf已推送origin/codex/ssh47-consolidation-20261015，本次只补最终观测交接，不重复服务器操作。
