# 大画布整理保存500：诊断与恢复核验

## 当前状态

目标103；从origin/main37e6895独立codex/canvas-arrange-save-20261014分支排查。未修改用户节点、账号、积分、数据库或在途任务，未占用/接管其他任务部署锁。当前线上故障已恢复并核验，发布脚本防复发修复等待简短设计确认。

## 实际根因

Nginx access/error日志一致记录2026-10-14 10:24:20及10:24:24（Asia/Shanghai）POST /api/canvas/history返回500，并出现open() /var/lib/nginx/body/0000000018、0000000019 failed (13: Permission denied)。请求未到达应用history事务；不是整理算法、数据库批量SQL或400节点上限报错。

少量节点请求在内存缓冲内，大量坐标请求超过client_body_buffer_size后写临时文件，因此表现为大项目偶发。应用history捕获事务异常返回409，格式检查返回400；不能通过改应用的返回码掩盖网关500。

## 恢复与一次集中验证

排查时目录元数据已于10:25:20发生变化；实际body目录uid33（www-data）、gid0、0700，上级root0755，Nginx worker实际www-data。另一个发布流程在本任务检查前已恢复权限，本任务未冒充执行chown。worker身份写入/遍历检查均通过。

真实原生admin登录后向同一保存接口发送16477、65629、262237字节JSON；operations为空，应用明确返回400“画布操作格式不正确”，三个请求均通过网关落盘链路，不创建history记录、不移动节点。结果保存在忽略目录output/imagegen-capabilities-20261013/release/arrange-large-body-evidence.json，不记录Cookie或密码。真实业务有内容的节点保存尚未在本轮主动执行，以免修改原画布；不能将无写入网关验证当作整理/撤销完整业务验收。

## 防复发设计（待确认）

scripts/deploy-image-cache-slots.py和scripts/deploy-canvas-performance-slots.py目前用events/http最小配置执行nginx -t -c；配置缺少user及独立body/proxy/fastcgi/uwsgi/scgi临时路径，会落到编译默认共享目录。主Nginx明确user www-data，编译参数没有显式user/group覆盖。root执行最小校验可能重新初始化共享目录的权限，属于潜在复发来源；现有证据不足以断言某个同事执行的具体命令造成10:24故障。

建议共用隔离语法校验辅助函数：只在任务证据目录创建临时路径/日志/pid，校验候选及回滚配置；不启动网关、不写生产临时目录，不通过扩大缓冲回避落盘。实际完整生产nginx -t/reload保持现有流程。一次Linux实际检查比较生产各临时目录uid/gid/mode前后相同，再验证大请求与回滚语法。只修改已确认脚本和新增辅助/检查文件，保留固定业务镜像和现行网关，不重建应用，不重复收费调用。

当前其他任务仍持部署锁，不能覆盖它的正在运行的控制器。若获确认，仓库修复通过普通提交整合，部署用辅助脚本仅在锁协议允许的阶段应用，不偷换他人的脚本。