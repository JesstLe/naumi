# 浏览器缓存异常恢复：回归验证

## 模块与职责

`scripts/verify-browser-cache-resilience.cjs` 打包指定 `--source-root` 下完整产品模块 `browser-image-cache.ts`、`browser-data-cache.ts`、`CachedImage` 及其实际依赖，在真实 Edge/React/IndexedDB 中验证缓存异常恢复。测试仅替换 `authHeader` 与显式本地 HTTP 响应；无生产 DB、供应商调用、服务器发布。

## 覆盖与证据边界

- 图片 IDB readonly/readwrite 事务无 complete/error/abort 事件：读缓存与下载后写缓存均应有界结束，最终图片真实 decode 成功。
- 作品列表 IDB readonly/readwrite 卡住：服务器作品列表仍可返回，身份/余额等非作品字段不进入返回缓存。
- 真实 IDB 中非 SHA 版本的等长损坏 Blob：实际 CachedImage 一次重新授权取图，显示可解码像素；重新打开不再重复命中坏记录。
- 网络也返回坏图时单次恢复后明确失败，不递归重试。
- 授权拒绝不旁路媒体、QuotaExceeded 不阻止显示、账号切换及取消不发布旧图片。
- 正常冷加载一次图片传输，重开与刷新不再次传输。

故障注入只作用于浏览器标准 IDB 事务边界，不改写产品源码：指定 DB/模式返回不会发事件的事务以模拟存储阻塞；正常与损坏条目使用真实 IndexedDB。此类故障能证明代码恢复能力，不单独证明用户截图的生产根因。截图“正在读取工作流”属于工作流导入 POST/流，不计作缓存根因。

## 命令

```powershell
node scripts/verify-browser-cache-resilience.cjs --source-root E:/Workspace/naumi/output/browser-cache-resilience-20261030/baseline-source --output-root E:/Workspace/naumi/output/browser-cache-resilience-20261030/tests/baseline-final --baseline
node scripts/verify-browser-cache-resilience.cjs --source-root E:/Workspace/naumi-browser-cache-resilience-20261030 --output-root E:/Workspace/naumi/output/browser-cache-resilience-20261030/tests/modified-final
```

原始基线固定 `b3a04f35f7ef612010617ddf835f41f5f2cf2485`；baseline 成功复现退出 1，modified 全通过退出 0。实际结果与逐加载 hash 登记在各输出目录 `RESULT.json`；父负责最终副本回滚及封存。

## 当前进度

已实际执行同一脚本的 baseline 与 SOURCE_STABLE 修改版：

```text
BROWSER_CACHE_RESILIENCE=REPRODUCED CASES=14 FAILED=7 OLD_DEFECTS=7 CONTROL_FAILURES=0 REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=1
BROWSER_CACHE_RESILIENCE=PASS CASES=14 FAILED=0 OLD_DEFECTS=0 CONTROL_FAILURES=0 REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=0
```

基线实际 exit1 为预期复现；修改版实际 exit0。七项复现明确是图片 read/write 事务挂起、作品列表 read/write 事务挂起、非SHA等长坏缓存无法自修复、同一图片批次waiters及作品多查询无法结束。普通quota、账户隔离、取消、健康缓存、授权拒绝等原有正控均未故意破坏，基线7正控通过。

修改版报告逐项保存真实输出、耗时与接口次数，所有实际加载产品源码起止hash相同。`tests/modified-final/repaired-image.png` 是真实 CachedImage 修复损坏Blob后的截图；图片naturalWidth为32、第一次恢复只有1次媒体传输、重开0新增传输。此处测试图片故意是32×24纯色图，用于字节/解码契约，不冒称用户实际生产画布截图。

测试自建本机随机端口与Edge上下文并已关闭，无服务器发布、供应商调用、生产写入。父任务仍负责最终副本回滚、整合与制品封存。

最终加测：6张图同批次全结束、3个作品查询全结束；连接被判为异常后，后继新图/新query直接旁路该连接，不再额外等1.5秒。坏Blob修复后实际reload仍0新增媒体传输，证明修复的是持久记录而不只同页内存。原12项首轮输出独立保留于tests/baseline及tests/modified。
