# 主线整合后的固定视频运行候选

## 来源与完成范围

本轮先 fetch origin/main，任务分支与 a6a87ec 主线一致。固定业务源码为 63df208771f91a98d21384c99b320f2d5e869811，版本 1792219221；后续文档提交不改变候选。三界面 Linux 镜像已全部构建，原构建会话26668正常退出。普通镜像 sha256:2534baf3247937eb510a72bb9ed31368418a610da7162ce2bc1de16367bc0151。归档源码 SHA c694efb6ea5b32cf80e61c7416294a1051e0f9dd190d77060f6108ee45443917。

实际运行 React/DOM19.3.0、Next15.5.27、Node24.21.0。SDK与候选的 Node 二进制 SHA 同为 7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c，package-lock匹配；测试脚本和源码从本次固定归档只读装入，启动的是新候选的 standalone server.js。

## 集中验收

- 实际编译 App 的 workflow-freeze 与 tasks 通过。首轮协议组失败：隔离测试 PostgreSQL256MiB/tmpfs384MiB出现两次真实OOM，证据及原失败结果保留。没有将该失败记为成功。
- 仅重跑失败的 application-protocols，隔离 PG 改为768MiB/tmpfs512MiB。41个profile、53个协议场景全部通过，会话4088正常退出，结束时PG OOMKilled=false。已通过的两组未重复运行。生产资源设置未修改。
- 同一新编译 Web 进程承载普通/桌面/企业界面，实际浏览器2569项通过，1176份三前缀静态请求核对；登录、私有媒体、跨账号隔离、中文画布保存与刷新通过，页面及静态错误0。Web限制896MiB，峰值439619584字节，cgroup OOM事件0。两个截图已查看，fixture已清理。
- 真实Linux Nginx集中验证通过：51类原路由、Fleet9类、TLS/转发头、4251份静态资源字节及MIME、维护503和恢复原配置。原旧静态资源保持。此网关fixture后端仅验证路由；实际App/DB结论来自上述独立应用测试。

全部使用本机独立模拟供应商、测试数据库及素材，生产连接和外部供应商调用均为0。真实视频API额度与视频质量没有验收。

## 证据与交付边界

外部证据根目录为 E:/workspace/naumi/output/canvas-video-fusion-20261013/：

- candidate-63df208771f91a98d21384c99b320f2d5e869811：三镜像元数据、构建日志、固定归档。
- compiled-app-63df208-20261017：首轮两组通过、协议失败及OOM原始证据。
- compiled-app-63df208-protocols-v2-20261017：53项成功日志、COMPLETE/RESULTS、结束状态与CLEANUP。
- unified-browser-63df208-20261017：浏览器断言、截图、内存与清理回执。
- prepared-63df208-video-unified-20261017：候选定义及部署包；最终封存状态以 FINAL_PACKAGE_REPORT.json 为准。

网关本机结果位于 /var/tmp/nginx63-5e46340276f84a8ab2981e9648fef1cc/results.json；需与本次4251资源及三份精确源配置绑定后封存，未完成封存不作已交付部署包。

103未安装此候选、未切流、未停止历史UI、未增加发布计数，也未持发布锁。此前e997包的私有暂存属于旧候选。当前容量不足，明确的维护退役边界或扩容选择仍待用户答复；不将历史观察冒充旧boot完整排空证明。运行回滚的旧e997实际证据仍与本轮新编译应用证据分别记录，最终发布及线上验收尚未完成。
