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

原模块的52项既有检查保留，新增两个真实HTTP时序案例；未给旧 `--baseline`／control-entry模式强加新源合同。原标记、cache key、TTL、邮箱身份、POST body和普通HTML投影保持，最终计数和结果以本轮VERIFICATION／DELIVERY实际记录为准。

本机原生产构建首轮因fixture未给构建进程配置合法 `VIDEO_WORKER_SECRET` 而退出1；保留原日志，补齐本机fixture输入，不关闭产品检查。原30s完整billing UI、管理入口模块、真实PG权限合同、全量类型／定向lint和copy-only回滚按最终记录分层，未执行结果不预填PASS。

## 未完成项

整体ACTIVE。本竞争的确定修复不替代原远端测试最后等待点定位、当前完整226同源CI、全仓语义耦合审阅、剩余故障矩阵或最终合main。本线程未部署，47决定保持独立；后续如原30s管理UI仍失败，继续按实际失败点处理，不加时或削弱断言。
