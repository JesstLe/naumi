# 浏览器缓存恢复后的效率优化

基线：bbc8f784251f74f37f76fd04d1db5019948cd559，包含前轮存储有界/坏图片自愈修复。

## 职责与实现

1. BrowserCacheStorage：原先一次异常后整页永久绕过IDB。改为按需恢复，冷却15秒开始，持续失败倍增至120秒。冷却时不碰IDB；到期首个调用探测open+一笔transaction，其他调用直接走回源而不等待probe。成功恢复正常缓存；generation隔离旧事务/旧连接迟到事件。没有后台定时扫描。
2. browser-image-content：沿用既有32MiB/400项内存LRU，增加peek/forget和精确source授权key。非SHA版本不能跨source共享；SHA内容仍按原规则去重。
3. browser-image-cache：每次先取得新鲜授权，再读同owner/epoch/version/source的内存字节，减少热图IDB读取、重复hash，以及异步写盘期间的重复下载。bypass明确失效当前内存key，单次新鲜认证下载。

不增加磁盘/内存预算，不改草稿、会话身份、生成、任务、供应商、收费或工作流导入。不是增加固定缓存清理周期，也不对外承诺网络下载上限。

## 验证进度

真实浏览器最终13项PASS；基线5缺口复现+8正控PASS。实际组件三次重开仅1次媒体传输、每次授权保留；8并发只有1个恢复probe；退避/旧事件隔离/内存预算/跨source及owner-version隔离通过。新增来源B持久化正控通过。

最终集中回归：前轮resilience14、图片focus21、作品data18全部PASS；完整tsc exit0。独立静态窄审初版无新增确定P1/P2，提醒来源B持久化边界后由父补warmSources和真实reload正控；该小增量未冒称另跑独立审阅。审阅撤回的旧读反写候选未当作已证缺陷。

真实副本回滚、补丁重放与main整合证据由 E:/Workspace/naumi/output/cache-efficiency-20261030/artifacts/VERIFICATION.txt 和 FINAL_STATUS.json记录。保持服务器未部署。缓存异步落盘并非业务数据持久化，立即关页仍可能使下次多取一次图，不承诺任意刷新零传输。

## 热图来源持久化保留

审阅指出纯内存早返回会跳过首次出现的同SHA另一来源B的IDB记录。本轮保留400项有界source标记；只有已走过该精确来源磁盘路径的图才直接热返回。首次B仍检查自己的IDB，缺失则复用已授权同SHA字节并异步持久化，不重下图片、不每次重写Blob。新增B真实持久条目+刷新只开B的正控，基线应通过，避免优化引入回归。
