# 47 默认 Dashboard 与 Skills 输入框布局

## 请求与范围

2026-10-14 用户明确首页应是 Naumi 的 `/dashboard`，不是营销首页或参考图工作台；Skills 标志不应挤占会话输入正文。

- 仅47，本任务不连接103、120、香港旧机或101。
- 当前运行5fc5efe、App13052与旧工作台17847保持，候选旁路13053，测试通过后Nginx平滑切流。
- 根路径将302到`/dashboard`并保留查询参数，因此登录弹窗、checkout/redirect参数不丢失；Naumi工作台本身可匿名显示，付费操作继续原鉴权。
- 首页正文改整行输入；附件/Skills/历史/发送位于下方工具栏。
- dashboard会话及画布会话的Skills移到下方工具栏；compact变为32px图标按钮，保留Skills可访问名称、悬浮提示、键盘焦点、弹窗/选中项/取消选择。
- 源码与Nginx保留基线副本，创建可执行回退脚本；不改数据库结构、账户、积分、媒体或供应商配置，不因UI验收真实消费。

## 远端整合

开工fetch至origin/main b277224；workbench/SkillBook文件与main一致，没有遗漏同文件同事改动。已完成canvas视频恢复结果布局修复a35817e/b2cc41c按origin/main最终文件整合至候选；fleet独立阶段模块仍未完整交付，不混入本次UI发布。合并/切流前再fetch检查。维护功能计数：本轮两个模块，未达累计3次同步门槛；本轮已开工刷新远端。

## 当前进度

代码已改，尚待固定Linux完整构建、当前组件/桌面390px浏览器集中验收、登录和Skills选中/取消/会话正文几何测量、回退副本、持续可用切流以及版本/锁释放核验。完成前不记上线。

## 最终上线与收尾

- 固定业务87d23d2ccf7ab930d3cecacddf7e1b1b0c3cce02 / version1791982745 / imagec6d3d00319a5；App13053。此次仅UI修改，旧Worker及13052 App保留，不新启第二个Worker或中断已接受任务。
- HTTPS根路径302到/dashboard，查询参数完整保留，公网标题工作台。没有把参考工作台设置为首页。
- Next15.5.27完整Linux生产构建/类型/88页通过，既有lint警告保留；源码结构20项、Skills权限/API/Postgres隔离100项、当前画布会话组件1093/390px五项均通过。
- 实际公网1440/390 dashboard/对话，普通员工登录99999、匿名打开工作台/登录弹窗、Skills选中/取消且不覆盖输入、全文宽度和无横向溢出通过；pageerrors0。验收Agent SSE及会话写入由浏览器拦截模拟，供应商调用0、真实会话写入0。
- 首页正文宽度桌面734→830px，390px手机224→320px；卡片高度166→149px。画布会话Skills也不再占额外的正文上方行。
- 持三锁备份、语法检查、旁路验收、Nginx平滑切流；60次持续HTTP请求错误0。旧Next静态资源无覆盖补入新容器，旧App/参考工作台仍运行。完整旧DB可读备份保护保留，未改账号/积分/媒体、未回灌。
- MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行LF ROLLBACK.sh双端重开/摘要一致；独立网关副本实际恢复原摘要949e242ecebe17fd1847666e37b33cbecb7ce49d17c7136067cb862124f7cfeb，公网/dashboard保持。没有实际切回公网。
- 切流前origin/main2f3773e、切流后86b06ac，仅新增比较证据/文档，当前工作台文件没有新业务遗漏。主共享checkout不切分支、不覆盖同事未提交改动。
- 扩展非本次验收项如实记录：现有Skills对话IME-Escape草稿保护测试未通过；额外Skills执行fixture在画布步骤返回项目不存在/无权限。本轮不将这些声明通过或已修复；此前fixture process.env及CLI server-only/DB启动条件已定位，详细失败保留证据中。
- 三部署锁正常释放并flock验证FREE；专用18453 SSH隧道及本任务独立测试DB已清理。应用发布累计2次，47磁盘63%/25GiB可用；没有无筛选prune或删业务数据/他人产物。
- 全部证据E:/Workspace/naumi/output/naumi47-dashboard-20261014；服务器/opt/naumi-staging/evidence/dashboard47-20261014。可复用结构验收`node scripts/verify-composer-layout.mjs`；完整网关无密钥示例deploy/examples/naumi47-dashboard-nginx.conf。
