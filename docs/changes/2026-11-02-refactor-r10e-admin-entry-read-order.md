# R10E：管理员入口成功认证与旧读取的时序归属

## 原始问题与证据层级

起点 `c2ab04139e262214e457dfbc86542ff33f9d0555`，5403 原始文件完整归档。原087 Image run41337432855 的管理UI有15PASS／1FAIL；`billing-ui.spec.ts:299` 的配置密码／深链接／退出用例超过原30000ms。Annotations已取得，但下载原始job日志／产物遇到EOF，最后等待点与唯一根因仍未确认。

本轮沿真实 `AdminClient + useAdminEntry + React` 和实际 loopback HTTP 复现了一个明确状态竞争，不能反过来把它认定为上述远端超时的唯一根因。

## 已实际复现的反例

1. 原密码表单发出一次 POST，fixture只暂停响应。
2. 相同账号的auth对象更新（email／ready不变）会触发原入口读取；此GET发出时浏览器尚未收到新cookie，响应快照为200未登录或503。
3. POST先成功，入口已显示认证后的原设置内容。
4. 旧GET最后到达，原读取serial仍有效，覆盖刚成功的状态：200退回登录框，503变为暂不可用。

原hook和全部2152产品文件未修改时，两种情况均已实际复现；扩展原模块脚本的 `--access-race-baseline` 只表达本次旧行为预期，不复用代表更早入口实现的 `--baseline` 兼容语义。该次原脚本仍输出其既有 `MODE=MODIFIED`，但 `localReadAfterPassword=OVERWROTE_ACCEPTED` 与新增断言明确是本次竞争基线，不把它当新行为通过。

## 模块职责与修改

管理员入口仍由原 `useAdminEntry` 拥有当前账号／挂载／读取epoch、密码表单及本地认证投影。React组件只呈现入口并绑定导航；服务端 `admin-auth` 和各API继续独立授权，未移动或放宽服务器密码、归属及角色检查。

仅在同一owner的密码POST成功并确认 `ok` 后推进原读取serial，使此前发出的读取失去UI写入权。没有新状态机、全局事件、缓存授权或新manager；没有增加GET、取消或重放POST。账号切换／A-B-A／卸载后的旧密码响应保护继续使用原owner，不用跨账号认证结果修补当前视图。

该改动收敛的是同一模块内“读取与成功认证谁拥有最终投影”的真实竞争，不因页面代码长短拆文件。成功认证之后新发出的正常读取仍可检查当前服务器状态，未把UI成功变成永久授权。

## 验证计划与实际记录

原模块的50项既有检查保留，新增两个真实HTTP时序案例；未给旧 `--baseline`／control-entry模式强加新源合同。原标记、cache key、TTL、邮箱身份、POST body和普通HTML投影保持，最终计数和结果以本轮VERIFICATION／DELIVERY实际记录为准。

本机原生产构建首轮因fixture未给构建进程配置合法 `VIDEO_WORKER_SECRET` 而退出1；保留原日志，补齐本机fixture输入，不关闭产品检查。原30s完整billing UI、管理入口模块、真实PG权限合同、全量类型／定向lint和copy-only回滚按最终记录分层，未执行结果不预填PASS。

## 未完成项

整体ACTIVE。本竞争的确定修复不替代原远端测试最后等待点定位、当前完整226同源CI、全仓语义耦合审阅、剩余故障矩阵或最终合main。本线程未部署，47决定保持独立；后续如原30s管理UI仍失败，继续按实际失败点处理，不加时或削弱断言。

## 原完整生产UI的实际失败点

原5403源码副本经过真实生产构建后，原16个billing UI按原顺序单次运行，得到15PASS／1FAIL、exit1：同一 `configured access password` 用例在原315行第一次错误密码登录点击超出30000ms。原始pw:api记录填入后按钮持续disabled，页面snapshot显示空密码框；在此之前没有密码POST。该本地复现明确定位到可编辑表单在AuthProvider初始null/ready=false期间过早出现，随后cookie身份hydrate改变owner，刚输入的draft被清空。

本地完整用例与远端失败名称／原时限一致，但远端原trace下载仍失败，不声称历史每次超时都只有这个原因。新增真实React/HTTP的初始null/ready=false→原账号ready场景独立复现上述表单清空。入口继续立即读取local access，只在原身份尚未就绪时暂不投影可编辑密码表单；服务器密码认证、本地已认证cookie、原访问检查及请求数不变，不增加人为等待时间或新的权限条件。

第一轮成功生产构建保留Windows依赖junction导致的Next traced-copy EPERM warning；原页面实际从原源码构建产物与同锁本机依赖运行，不将它称为完整Docker打包验证。原本缺worker secret的构建exit1也保留。

## 最终本机集中结果

应用执行源 `698e7f41` 的完整生产构建与原billing UI原顺序16项单次16PASS／0FAIL／0SKIP、exit0；原299用例约1.4秒完成，原30000ms test／5000ms expect和整个spec原始字节保持。它是本机Windows生产构建＋实际Edge／HTTP／PG，不将依赖junction的traced-copy warning写成完整Linux镜像打包通过；Web/Worker固定新镜像和同源完整CI另行验收。

原入口50项检查保留，新两种旧读覆盖＋初始身份表单三个反例：基线扩展61项复现旧行为，修改后含普通HTML与原报告精确对照共62项通过；两种旧GET不再覆盖成功投影，bootstrap期间不暴露会被清空的密码框，身份就绪后表单正常可用，密码POST每case仅一次。原30个assert/eq调用AST文本全部保留，新增6个调用；原billing spec／config raw一致。

原管理壳层15项通过；真实PG权限合同包括错误密码、原邮箱管理员／旧cookie拒绝、正确HttpOnly会话、跨站拒绝、密码轮换／过期／退出、受保护API及return URL，全部exit0。全项目非增量tsc0，5111编译输入及4配置绑定；定向lint0／2条原有warning，原c2ab hook经stdin lint实际复现相同2条warning，未关闭规则。

仅一个生产hook改变，其他2151产品文件raw保持。已知旧087远端Image失败保留；收尾另读c2ab的Image已SUCCESS，说明不能把旧失败都当每次必现，Core按实际状态保留。新最终head仍需同源完整226 CI，不借任一旧head标绿。

下一阶段优先固定候选做全仓语义耦合审阅与剩余矩阵集中验收、读取有效同源CI并完成普通main整合，不再按单个helper机械拆轮。四产物／5403原始hash回退与旧三个反例恢复，以本轮VERIFICATION／DELIVERY实际结果为准；整体ACTIVE、本线程部署0。
