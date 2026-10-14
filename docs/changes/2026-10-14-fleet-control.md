# 跨部署中央控制台

## 正式目标
103为总后台，47为首个企业部署；共用main、独立数据/凭据/存储，47使用NAS。中央后台经实例连接器管理用户、积分、功能和发布；连接器主动HTTPS轮询，不开数据库/SSH控制接口。不接收任意shell命令或任意远端URL。

## 开工
- 基线origin/main：6c7c120；共享checkout codex/labs-workbench保持原状。
- 独立分支codex/fleet-control-20261014，工作区C:/Users/13357/.codex/worktrees/fleet-control-20261014/naumi。
- 已创建正式目标。NAS适配由原会话完成，本任务不重复修改storage/media模块。
- 本轮先完成控制通道和受限业务指令，集中验证后再整合；47尚未开放Naumi，不因开发自动切换现有工作台。

## 计划及验收门槛
1. 实例注册、密钥一次交付、吊销/轮换，心跳与带签名指令、持久化队列、幂等结果、审计。
2. 复用既有用户、积分账本和功能权限；实例选择、离线状态和失败结果真实展示。禁用任意代码/SQL/shell、禁导出密钥。
3. 已验收不可变发布记录与每日20:00北京时间调度；只同步版本，不覆盖企业配置/DB/媒体；正式切流必须持锁、备份、47 E2E及回滚门槛。
4. 独立DB和模拟主站/企业站的真实HTTP及重试/越权/重放集中测试，类型和构建检查，独立回滚演练。
5. 推送并普通整合最新main。103控制台/47连接器正式部署与47 NAS端到端需独立验收，不以隔离测试替代。

## 当前状态
实施中；未部署、未创建真实企业连接凭据、未启动生产20:00调度。功能同步计数0/3；发布计数不变。

## 模块一：控制通道与用户管理
- 已实现部署管理浅色入口、一次性凭据、实例状态、受限用户查询/状态/积分/功能指令、密钥轮换/吊销。
- 企业连接器主动HTTPS，命令签名绑定实例与有效期、nonce拒绝重放、持久化队列/租约/回执。积分复用原账本幂等；模拟账本已提交但回执未落库的崩溃后重试仍仅增加500积分一次。功能版本冲突明确返回，保护企业管理员不被此普通用户指令停用。
- 本机隔离Postgres两独立DB+真实HTTP链路通过：中央用户余额未改变，企业余额按指令改变；断开ack后恢复、越权、签名篡改、重放、时间失效、轮换、审计通过；模型调用0/生产写入0。
- 真实Next生产构建+独立Chromium通过1440/390px：注册、关闭一次性凭据、离线指令保持“待执行”不伪装成功、刷新保留指令，无横向溢出/pageerror。
- 移动端实例改紧凑选择器，桌面实例列表限高；pending operationId保持页面与sessionStorage，回复丢失确认同一操作，不生成重复积分调整。
- 模块代码8225b1c，普通合入origin/main174ad1b后的固定候选c937286；仅后续测试脚本修正，不改变构建业务代码。git整合计数归零。
- 类型与受影响文件ESLint exit0；Next15.5.27生产构建88页exit0，原画布/缓存/视频Hook等既有lint警告保留。首次共享junction依赖缺字体，删除junction请求被执行工具拒绝，未换方法删除；改建独立build-copy并npm ci。早期build-copy继承父eslint/root导致冲突及Windows trace警告，最终按已合main root/tracing配置独立构建，不把前两次告警当作正式制品。
- 测试准备修正：SessionUser为camelCase且不含banned，新用户有30赠送积分，fixture改实查初始余额和banned；手机实例选择器label文字包含options，测试改combobox角色定位。以上早期失败日志不记录通过，最终集中回归结果独立留存。
- BASELINE/MODIFIED/ROLLBACK与原始hash、真实E2E/UI/构建日志、四件套在工作区output/fleet-control；回滚只在独立源码副本演练，业务DB/积分/媒体不回灌。

## 下一阶段与明确未完成
- 实例级委派运维角色与模型模板、积分流水/历史作品按授权查询，以及更完整审计UI。
- 20:00已验收版本发布目录/调度/执行器、固定连接器Linux制品与运行服务、后台管理本地主站实例的正式接入。
- 103中央可信HTTPS与受保护实例登记、47 NAS真实E2E与上线。当前未连接/发布两台，47旧工作台保持，不以本机隔离测试替代实机验收。
- 正式目标仍active；首模块通过不表示整个多部署管理目标已完成。

## 模块二：实例授权与夜间发布基础
- 增加实例运维grant：read/users/credits/features/release、到期与版本CAS；非总管理员看不到其他实例、密钥或授权管理。入队/发令时复核撤权；已租出结果未知保留blocked，不能假装未执行。
- 新发布目录严格接受三镜像固定GitHub manifest，管理员确认验收证据SHA，必须匹配新鲜主站实际运行SHA/版号；冻结后同ID篡改拒绝。
- 每企业每日Asia/Shanghai20:00唯一规划，主站状态过期/未验收/同版本/停用跳过，冻结目标基线并支持暂停/恢复CAS。只规划，不发shell/部署命令，执行器未启用。
- LinuxNode24非root固定连接器和调度制品已构建；真实HTTPS+信任fixture证书的Docker连接器完成入队→签名指令→企业独立DB→回执。错token/不受信证书/明文公网HTTP均拒绝，未连接生产。
- 隔离治理测试已覆盖授权范围、grant冲突/过期/撤销、在途未知回执、发布实际基线、冻结manifest、北京时间窗口、并发去重/同版本/未验收/过期跳过；既有双库积分幂等回归通过。
- 已补总后台运维授权/发布跟随/审计UI；非总管理员单独部署导航，不展示无权后台菜单。正式UI及模块最终回滚/固定制品核验见本模块证据，尚未安装生产timer。
- 当前计数2/3（控制与治理两个模块），合main前刷新归零。正式目标仍active：模型模板、自动切流执行器和47真实NAS/103线上接入未完成。
- 专用Linux运行包由实际bundle外部依赖清单派生，排除无关Agent/MCP/mail依赖，独立固定lock并npm ci。继承主项目全部依赖的早期候选audit为10项/含1critical，最小化后实际audit为3项（next中postcss与sharp既有项），critical为0；不伪称依赖零问题，不在本模块强制升级全站Next或sharp。生产开放前需继续处理这些依赖与受影响验收。

## 模块三：发布执行通道（开发中，默认关闭）
- 中央Ed25519签冻结manifest/实例/租约/有效期，企业只持公钥；非rootrelay主动HTTPS搬运，不持Docker socket/root私钥。root本机执行器仅允许现场固定hash hooks，不接受远端shell/path/URL。
- 原租约信封持久化，丢poll重发同字节；relay已有信封不重复写。root started/result防重复部署、重启未知阻断；丢ack重报结果，blocked相同回执不重复审计。
- 七hook、真实可读备份、兼容迁移、NAS、双部署锁、基线/env/gateway指纹、旁路三槽、Nginx平滑reload、postaccept/worker与失败回退实现。旧槽/DB/媒体/配置保留，不用源码回滚撤销业务积分。
- 复核修正连续发布固定端口冲突：改本机root限定范围选真实空闲端口；root只读statusFile让连接器验切后实际三槽版本，文件错误/混版/断网unknown。不能把fleet镜像SOURCE_COMMIT当网站实际版本。
- 本轮真实HTTP丢poll/ack、签名、隔离实例、回执幂等；Linux执行合同和真实Nginx六HTTP容器切流测试通过。Docker/业务hooks合同仍模拟，Nginx容器不含Naumi/NAS，未声称47正式E2E。
- 原NAS会话已找到真实历史配置production.env及隧道/保活脚本，不打印/复制密钥、不连接旧服务器；47 NAS现场网络/密钥有效性仍需确认。详情主文档历史NAS定位。
- 开工已fetch，origin/main已从690f6e8推进b277224；本模块未提交前保留任务现场，提交后普通整合，不覆盖共享codex/labs-workbench。
- 待本轮最终构建/UI/Linux固定制品、四件套回滚与合main；103/47现网均未变更、未安装生产timer。正式目标active，模型模板/正式接入仍未完成。
- 同事最新main已记录47 Naumi公开运行（5fc5efe/1791976273，local媒体，旧工作台保留）；该变化由其独立授权及发布完成，不归本任务功劳。此前本任务“47未开站”的描述仅历史，本任务继续保护已运行47，不把NAS/fleet阶段自动接上生产，也不连接废弃旧机。

### 模块三集中验收与当前交接
- 业务代码9a1d71d，已普通整合远端86b06ac为2cd4fd4；之后仅修systemd relay写权限和测试/文档，最新main f9ca769已再次普通整合为ef2afe2。最终main整合及推送SHA以本轮Git回执为准；功能同步计数归零，发布计数不变。
- Next15.5.27固定2cd4fd4 / BUILD_VERSION1791985000生产构建88静态页exit0；受影响类型/ESLint exit0，既有画布/缓存/视频Hook lint警告不隐藏。固定Node24非root镜像naumi-fleet:2cd4fd4，ID sha256:f38e3b31aec82197e0d1603e7f39c32210379a64dde1a952ab25669c5b8c6306，通过真实TLS、错token/不信任证书/公网HTTP拒绝、真实指令与三实际站点版本/混版unknown验收。
- 真实Next浏览器1440/390注册/凭据关闭/离线队列/刷新/授权/跟随/非root导航通过，无横溢出/pageerror；用户查询、积分调整、停用与启用、功能权限保存的真实浏览器→企业连接器→独立DB通过，中央同邮箱余额未变。截图已打开核验，不伪称生产UI已上线。
- 修正验收fixture：此前Linux测试企业fixture库不存在导致RETRY_PENDING；新建独立库后通过。业务UI的初始inspect需先建app_fleet_applied，fixture seed补schema后通过。早期失败日志不计通过。首次Git schannel握手失败，使用正常OpenSSL证书验证fetch成功，未关闭TLS验证。
- Nginx真实Linux六HTTP容器100探测错误0、旧在途/旧静态/三flavor切流及回退通过，任务隔离容器已按label移除。Python root合同的Docker/业务hook模拟边界保留；root所有权/父目录/公钥及hook hash、锁、下一轮端口、持久化回执/中断unknown另有实际合同断言。
- 已生成baseline690f6e8及独立源码rollback副本；治理BASELINE/MODIFIED/ROLLBACK均exit0，原hash恢复、发布模块新增源码回滚移除、模块二保留，真实工作分支保持改后。制品/完整命令及字面输出在output/fleet-executor，最终重开核验。
- 本轮47只读实查当前公开UI/desktop版本183dff86/1791984787，enterprise公开version404；3900无监听，两网关probe000。没有发布/改服务/NAS/配置或DB。NAS会话收到配置路径和真实网络缺项，47 NAS/fleet生产接入仍待现场验收；正式目标active，103控制台上线与每天20:00正式调度尚未启用。
