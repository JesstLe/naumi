# SaaS 后台47实际发布与验收

用户授权：本机验收通过、整合已完成业务分支后，上线47进行真实验收。本文为最新交付记录；早期066、25c候选和“尚未发布”描述均为历史过程，不作为当前放行依据。

## 实际程序与发布

| 项目 | 实际值 |
| --- | --- |
| 发布 | `release47-saas-20261023-r1` |
| 完整源码 | `5b8489d9ec989ea803eb37280c65e2f18529babb` |
| Web/Worker共同镜像 | `sha256:db8004f1ba69c702ec2adb3f2045fb402e4f38b62ef9df63126b043fe2ea4166` |
| BUILD_VERSION | `1792705393`，页面 `v2026.10.23-054313` |
| 完成时间 | 2026-10-23 06:15:17 CST |
| canonical | revision `728`，该时刻原始SHA `0e7092c9d0e19f5f251890a352e760b603f6b63e82fd75a7c622bd80741e9846` |
| 当前Web | `naumi47-web-saas-20261023-r1`，loopback13114，2048MiB |
| 当前Worker | `naumi47-worker-video-family-saas-20261023-r1`，1024MiB，同固定镜像 |

发布全程共持Naumi/Hub/原生参考工作台三锁，通过统一 `deploy-release.sh --lifecycle publish47-saas` 执行。旁路真实就绪、整站切流、原请求/任务/Agent/租约排空、真实新Worker完成tick后，旧R2 Web和Worker正常停止且 `restart=no`，最后释放三锁。没有并行遗留本轮第二套业务Web。当前与最近两个成功版本的镜像和恢复材料已核对可读。

历史根状态的两笔旧事件及 `MIGRATED_CLEANUP_PENDING` 未被清除；本轮COMPLETE仅表示此次SaaS发布闭环，不宣称历史债务已全部解决。

## 本机最终固定镜像验收

最终证据在忽略目录 `output/saas-linux-integrated-final-20261023/`，`LOCAL_ACCEPTANCE.json` 绑定上述源码、版号和镜像；旧候选不能替代此证据。

- 原Dockerfile完整Linux构建、正式类型和公开更新说明校验通过。通用ops230项PASS；bulk中一项缺DSN的PG class明确skip，另行使用真实隔离Postgres执行15项全部PASS，其中14项真PG。
- 同镜像真实Web＋新PG＋combined Worker，18/18 HTTP组通过，覆盖密码登录、所有者/管理者/离职/跨企业/双cookie、UUID详情、签名媒体、真实Web扫描tick、重启、排空和UNKNOWN拒绝恢复。fixture数据库没有复制到47。
- 真实既有视频完整解码、隔离native进程、幂等、重启及零OOM通过；该组扫描接收器为mock，不冒称真实App或供应商受理。7个真实Node进程、38断言及60秒退休collector通过，仅该组engine为fixture。
- 新后缀与旧裸签名素材GET/HEAD/Range通过；原字节篡改503、跨owner404及严格错后缀404通过。受控维护真实Nginx/TLS原52组合及同生产prover68项通过，均为本机隔离检查。

上述本机组供应商调用0、47连接0；实际生产检查另列。

## 47真实验收

| 范围 | 实际结论 |
| --- | --- |
| 平台与租户 | 公网HTTPS真实管理员会话打开总览、现有租户及成员/权益/创作等入口，实际版号与固定源码一致；真实有效人数包含所有者，非设计图示例常量 |
| 历史全链路 | 在历史业务任务经resolver打开实际图片任务；4份输入、1份结果均可预览，原要求、参数及原报价/实扣可见；历史缺项显示“未记录” |
| 旧数据 | 既有BI仍可查询10,563条历史业务任务；新确认归属创作指标初始为0，不据当前任职反推旧企业归属，也没有把本机fixture同步线上 |
| 只读HTTP | 10 PASS、0 FAIL、4 unavailable，`ok=true/complete=false`；当前平台管理员无企业membership，因此生产企业所有者正向页面与密码登录未验证。跨租户拒绝、双cookie不提权通过；本机正向18组已覆盖，不把它当作生产所有者证据 |
| 公网参考素材 | 实际上传/材质化、GET200/HEAD200/Range206/冻结SHA/私有401/错误404通过；完整原生H264解码10.125秒通过，验证素材与行精确清理，既有原视频保持，供应商调用0 |
| 视频目录与设置 | 独立负责人在本次固定程序真实GUI完成冷加载禁创建、503后显式重试、不自动创建，以及唯一新节点默认模型/参数；7个profile桌面及390px设置保存重载通过。仅8次设置PATCH，0新增重复节点、0生成意图和0收费调用 |

生产只读HTTP、公网参考素材与浏览器记录分别为服务器证据根的 `HTTP_READONLY_CANDIDATE.json`、`PUBLIC_REFERENCE_ACCEPTANCE.json`、`browser-before.json/browser-after.json`；私有业务正文不写入仓库。公网参考验收UUID `9b8dac40-3496-46b1-ac30-8f33b34f87d0`，回执SHA `95b8bd4b6d3feadd6b44ff9bec49d6c772505ba0e5da7a5172d6f59cb62dabcf`。最终视频GUI回执SHA `2974d7c1eb7f17b5034277705fc361474a36a8e7a80e6ec563e4489274465c46`。

## 历史任务和配置保护

原05仍是 `needs_attention/creation_unknown`、无上游ID、费用及结算pending。用户已选择跳过费用调查，本轮不重投、不退款、不改0、不清状态。原8表逐列、原PG JSONB文本SHA、补充关联及活动/租约保护在建立、候选就绪、切流前、每次退役前、完成前全部MATCH。原不可变基线SHA `512245689fb9884732d6f9f9c7d479ca1481bfe2570b4fa4356fd947b572b041`。原7组付费证据仍仅6 PASS＋05 UNKNOWN，属于旧R2程序，不能改称本次SaaS七组实付通过。

当前模型配置135、积分规则8及各自hash保持；本轮没有激活/覆盖模型或改变客户售价。原已接受任务继续使用冻结事实。恢复采用理解新权限的受控维护降级，已准备并校验完整入口闭包；生产未实际触发紧急维护，不声称无感回滚演练通过。

## 收尾发现的独立遗留问题

实际执行图复核发现Router进程的容量回调仍为loopback13052，端口无监听，安全GET实测连接拒绝；历史旧Web退休后未保留兼容入口。此项不以视频直连成功替代验证。当前正在追加三锁私有回调兼容绑定，仅将精确内部路径接到同一新Web，保留Router与应用进程、固定镜像、历史任务和配置；实际结果将在对应模块记录及本文追加，不提前宣称修复通过。
