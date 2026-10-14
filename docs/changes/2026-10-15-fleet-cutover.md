# 中央管理限定路由切换与回退

## 现状与目标
103 private portal继续ef08d3d / 1791994700、loopback13062；主站8af8ee6 / 1791975598不变，两锁FREE、备份可读。本轮不重启/升级该sidecar，不开放47或启用生产20:00同步。开工main db91aad，任务分支独立。上一轮是实际代码/镜像/103私有准备进展，不是完整目标完成。

当前资料缺口：原NAS会话只找到旧S3秘密和历史安装路径，缺NAS当前管理连接；当前103管理员历史登录一次401，已异步询问当前受保护资料，不修改密码、不伪造cookie。二者未取得前，不声称生产管理/47 NAS验收完成。

## 实现
- `scripts/fleet-portal-cutover.py`默认dry-run，必须root本机执行，复用受保护父目录/文件检查和两锁。核prepared摘要、固定portal Image/source/只读fs/非root/worker和dispatch/scheduler0、主站实际版本、旧gateway完整SHA。不能覆盖同事后来更改的网关。
- 仅向单server配置插8条精确fleet/admin路径和独立/fleet-assets/_next资源映射；全站业务api/version、画布、生成、Agent、media和原静态资源维持旧后端。多server/重复插入拒绝，由现场明确布局而非猜位置。
- Nginx字段覆盖Host/protocol/IP，不信任客户端伪造CF-Connecting-IP或X-Forwarded-For；不关闭鉴权/Cloudflare、不改证书/路由器/数据库。
- 未给真实管理员cookie时dry-run仅输出ROUTES_READY，--execute拒绝。受保护cookie需目标portal原鉴权验证root=true；cookie不写验收日志，记录仅root/时间/固定source。普通用户/委派read角色不等于中央root。
- --execute同时需要官方OriginCA本机文件，固定官方SHA，保留系统信任与域名/SNI校验，直连103源站443；切前和切后真实HTTPS检查主站实际版本及管理员API/页面，不以本机HTTP或404称公网通过。候选nginx语法使用独立五类temp目录，真实reload失败/公网验收失败恢复旧网关，不停原App/Worker、不回灌DB/媒体。
- 显式--rollback仅在当前gateway仍匹配本次cutover记录时恢复；拒绝覆盖同事的新发布。--rollback默认只检查，不恢复旧业务库/积分/媒体。原sidecar和旧业务容器均保留。

## 集中证据与边界
- 隔离Linux root合同：无cookie/非root角色拒绝、dry-run无切、公网失败回退、成功记录、显式回退、重复/多server配置拒绝，旧App/Worker无restart；HTTP/TLS/Nginx在此合同中模拟。
- 真实Linux Nginx+两HTTP后端：生产同一renderer插入算法，8条精准路由和资源前缀正确，100次持续业务探测错误0、旧在途完成；生图/Agent/media/既有静态及desktop/enterprise版本仍旧后端；真实reload回退验证。容器为本任务独立label，已精确清理，不冒充Naumi/47 NAS生产业务。
- 真实103只做dry-run语法/摘要复核，缺管理员资料时不执行切换；完整目标仍active。本模块无线上成功发布，发布维护计数不变。

## 复用命令（在103；先刷新真实基线）
```bash
# 不传cookie仅渲染/语法检查；不切流。
python3 /opt/naumi-control/scripts/fleet-portal-cutover.py --evidence /opt/naumi-staging/evidence/fleet-portal-20261015/prepared
# 提供真实登录产生的root管理cookie受保护文件；先默认dry-run验管理身份。
python3 /opt/naumi-control/scripts/fleet-portal-cutover.py --evidence /opt/naumi-staging/evidence/fleet-portal-20261015/prepared --admin-cookie-file /run/naumi-fleet-admin.cookie
# 只有管理/业务/备份/兼容门槛真实通过，再显式执行并核HTTPS。
python3 /opt/naumi-control/scripts/fleet-portal-cutover.py --evidence /opt/naumi-staging/evidence/fleet-portal-20261015/prepared --admin-cookie-file /run/naumi-fleet-admin.cookie --ca-file /etc/naumi/fleet-origin-root.pem --execute
```
接手不要重建已验证的private portal或复制103库到47。先提供/验证当前管理员与NAS连接；公网可用不等于NAS已通或夜间自动更新已启用。
