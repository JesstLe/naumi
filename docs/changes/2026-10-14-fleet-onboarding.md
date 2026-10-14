# 中央端正式接入预检与私有PKI通道

## 范围与基线
- 承接完整fleet目标，不缩为只有代码；103中央、47企业独立数据/NAS。开工任务分支干净dc7c51e，fetch并快进origin/main至5bae420。共享codex/labs-workbench不切换、不覆盖。
- 上一模块已合main：实例身份/权限、用户/积分/功能指令及审计、20:00规划、Ed25519发布/root门槛。生产连接器/timer未启用。旧服务器不连接。

## 当前两站只读证据
- 103既有受保护DPAPI连接与已登记SSH host key可用；Strict RejectPolicy，不重新信任host key。Naumi/Hub两锁现场FREE，磁盘79%/25GiB，内存Available约1539MiB，swap接近满，任何旁路需再验容量/资源限额，不在103重型构建。
- 103网站三UI槽13039/40/41实际8af8ee6/1791975598；core13012及upload13038仍c05a923/1791911575。旧worker/旧槽继续运行，不把main源码当线上版本。
- 103 IP HTTPS证书是Cloudflare Origin CA，SAN只有naumi.top/www.naumi.top；直接IP普通TLS失败是预期，不能设rejectUnauthorized=false。域名公有edgeTLS可信但普通机器请求403，当前不能把它当连接器就绪。
- 47原证书为可信Let's Encrypt短期IP证书，但NAS3900仍未接通。原NAS会话已确认没有当前受保护NAS管理连接文件，已异步询问当前管理地址/配置路径；不再索要已存在S3密钥，不执行旧指向101的隧道脚本。

## 实现
- 连接器与release relay复用受控fleetFetch。默认仍平台fetch/TLS；仅管理员配置FLEET_CENTRAL_CA_FILE/FLEET_CENTRAL_RESOLVE_IP时用独立https.request。
- 可将HTTPS域名按管理员固定IP直连源站；URL域名/Host/SNI和证书主机验证保持，私有CA只对fleet请求生效，不改系统CA/全站TLS/Cloudflare WAF，不关闭TLS验证。配置不取自Agent输出、远端指令或浏览器输入。
- CA文件绝对路径、普通文件及各父目录、Linux root/进程所有且不可group/world写/非symlink，限20KB、最多4个有效CA证书；叶子证书/缺失/畸形/过期拒绝，不fail-open到另一条连接。兼容系统信任根但不自动信任对端证书。
- 自定义传输仅POST固定4条/api/fleet路径，48KB请求/响应（保留30位长中文用户名结果契约；不缩为16KB）、TLS1.2+、超时/redirect拒绝、元数据/回环/mappedIPv6地址拒绝，不提供任意URL或请求代理。
- 增加固定bundle preflight：无cookie/token、无生产写入核实证书/版本及匿名fleet拒绝。TLS/响应异常exit1，API未部署或鉴权形态错误exit2；不能靠404或网站version200声称中央已上线。

## 实测
- 官方Cloudflare公开Origin RSA根来自官方GitHub cloudflare/cloudflare-docs production/public/ssl/static/origin_ca_rsa_root.pem；SHA256 91a8a5567efa6bf941162aa806b3ba476aaddf7867640e53053b35fb225a5dae，1448字节。不是从103对端抓的证书临时信任。原developers.cloudflare.com下载403，正常官方GitHub来源成功，不改对方访问控制。
- 本机真实TLS fixture：自定义CA和IP路由成功，错误CA/错误hostname/缺CA/叶子CA拒绝，redirect/响应长度/timeout/元数据和凭据URL拒绝，普通系统信任分支未关闭验证。
- 真实103源站以naumi.top域名/SNI、固定103IP及官方CA验证通过，/api/version200实际8af8ee6/1791975598；/api/fleet/poll404 HTML，预检ready=false、exit2。没有发送实例凭据/用户cookie，没有配置或数据库写入。

## 待完成与交接
- 本模块类型/受影响lint均exit0；实际TLS自定义CA与错误CA/域名/缺CA回归、旧双库HTTP账本重试和release重试通过。固定LinuxNode24非root镜像验私有CA请求作用域、无凭据preflight、实际三槽/混版unknown、错token/证书/明文公网拒绝、真实指令，均通过。测试的公开fixture CA单独Linux只读层安装：Windowsreadonly bind被Docker报0777而被严格CA检查拒绝，未放宽生产检查。preflight fixture由异步子进程执行，避免spawnSync堵住同进程HTTPS server造成假超时。
- baseline5bae420、修改包及独立源码rollback治理回归均exit0、原hash恢复；业务库/媒体/secret不回灌，真实工作分支仍改后。四件套/字面命令/实际日志在output/fleet-onboarding；最后按Git回执更新整合版本。功能同步计数本模块1/3；开工/合main仍fetch，生产发布计数不变。
- 103中央网页/API仍待限定路由旁路部署与受控原生管理员验收；不全站切未完成main模块。43/47等其他站点现有服务不受影响。NAS当前管理连接和NAS→47通道、47真实E2E、现场7hooks/固定发布来源、生产20:00timer仍未完成，完整goal保持active。
- 不把私有PKI线路预检通过当作网站一般浏览器IPHTTPS证书已更换，也不把中央API404当作部署成功。
