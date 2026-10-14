# 大画布整理保存500：诊断与恢复核验

## 当前状态

目标103；从origin/main37e6895独立codex/canvas-arrange-save-20261014分支排查。未修改用户节点、账号、积分、数据库或在途任务，未占用/接管其他任务部署锁。当前线上故障已恢复并核验，用户已确认防复发设计；两个发布脚本完成隔离修复，103真实Nginx集中验证通过。

## 实际根因

Nginx access/error日志一致记录2026-10-14 10:24:20及10:24:24（Asia/Shanghai）POST /api/canvas/history返回500，并出现open() /var/lib/nginx/body/0000000018、0000000019 failed (13: Permission denied)。请求未到达应用history事务；不是整理算法、数据库批量SQL或400节点上限报错。

少量节点请求在内存缓冲内，大量坐标请求超过client_body_buffer_size后写临时文件，因此表现为大项目偶发。应用history捕获事务异常返回409，格式检查返回400；不能通过改应用的返回码掩盖网关500。

## 恢复与一次集中验证

排查时目录元数据已于10:25:20发生变化；实际body目录uid33（www-data）、gid0、0700，上级root0755，Nginx worker实际www-data。另一个发布流程在本任务检查前已恢复权限，本任务未冒充执行chown。worker身份写入/遍历检查均通过。

真实原生admin登录后向同一保存接口发送16477、65629、262237字节JSON；operations为空，应用明确返回400“画布操作格式不正确”，三个请求均通过网关落盘链路，不创建history记录、不移动节点。结果保存在忽略目录output/imagegen-capabilities-20261013/release/arrange-large-body-evidence.json，不记录Cookie或密码。真实业务有内容的节点保存尚未在本轮主动执行，以免修改原画布；不能将无写入网关验证当作整理/撤销完整业务验收。

## 防复发设计与完成情况

scripts/deploy-image-cache-slots.py和scripts/deploy-canvas-performance-slots.py目前用events/http最小配置执行nginx -t -c；配置缺少user及独立body/proxy/fastcgi/uwsgi/scgi临时路径，会落到编译默认共享目录。主Nginx明确user www-data，编译参数没有显式user/group覆盖。root执行最小校验可能重新初始化共享目录的权限，属于潜在复发来源；现有证据不足以断言某个同事执行的具体命令造成10:24故障。

建议共用隔离语法校验辅助函数：只在任务证据目录创建临时路径/日志/pid，校验候选及回滚配置；不启动网关、不写生产临时目录，不通过扩大缓冲回避落盘。实际完整生产nginx -t/reload保持现有流程。一次Linux实际检查比较生产各临时目录uid/gid/mode前后相同，再验证大请求与回滚语法。只修改已确认脚本和新增辅助/检查文件，保留固定业务镜像和现行网关，不重建应用，不重复收费调用。

当前其他任务仍持部署锁，不能覆盖它的正在运行的控制器。若获确认，仓库修复通过普通提交整合，部署用辅助脚本仅在锁协议允许的阶段应用，不偷换他人的脚本。
## 实现与集中验收

- 新增scripts/nginx_syntax.py共用语法检查；每次在调用者证据目录建立独立nginx-check-*，body/proxy/fastcgi/uwsgi/scgi五类临时目录、pid、lock和error日志均独立，access_log关闭。候选及回滚检查使用同一帮助函数；真正生产nginx -t/reload流程保持。
- 校验标签拒绝目录穿越，网关内容若再次声明temp_path则主动拒绝，避免覆盖独立目录。没有扩大缓冲或把权限改为777；没有启动测试网关或重启应用。
- deploy-image-cache-slots.py与deploy-canvas-performance-slots.py全部四处最小配置检查替换为隔离函数；新增辅助函数导入。复制独立部署脚本到服务器时必须同时复制同目录nginx_syntax.py，缺少辅助文件会在执行阶段前失败，不降级到旧校验。
- Python编译及git diff检查通过。103真实nginx -t分别核对当前实际候选/回滚网关，错误指令配置按预期失败；目录穿越与共享临时路径覆盖均拒绝。/var/lib/nginx的五类目录uid/gid/mode和实际网关SHA在所有检查前后完全相等。测试未修改节点/数据、未消费模型、未触发真实切流；不得把故意非法配置的失败当产品失败。
- Linux证据在/opt/naumi-staging/evidence/canvas-arrange-save-20261014，辅助与验证脚本在其scripts/目录，可重新核查nginx-syntax-regression.json。当前正在运行的另一发布控制器未被覆盖；修复经main整合，由后续发布从已提交源码携带辅助文件，历史控制器不得再次使用未隔离校验。
- 本轮不是新应用镜像发布，不增加成功发布计数；维护次数仍按主线最新发布记录累计。原私有媒体/账号/积分/网关/固定App与Worker保持。本任务不占两把部署锁，也不释放其他任务持有的锁。
