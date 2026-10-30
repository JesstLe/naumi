# 浏览器缓存恢复与复用效率验证

## 模块与职责

`scripts/verify-browser-cache-efficiency.cjs` 对明确的 `--source-root` 打包实际缓存、存储与 React 图片组件；使用真实 Edge、IndexedDB、Blob 与浏览器图片解码。身份头、媒体/授权 HTTP 数据和存储故障是显式本地 fixture，不访问线上数据库、供应商或付费接口。

- 基线：`bbc8f784251f74f37f76fd04d1db5019948cd559` 的完整归档。
- 支持 `--source-root`、`--output-root`、`--baseline`；实际加载路径与 SHA256 记录于 `RESULT.json`，结束再次计算，防止测试中版本漂移。
- 临时 HTTP 使用本机随机端口；Edge 上下文和 HTTP server 在退出时关闭。
- 冷却验证使用 Playwright `page.clock` 推进浏览器时间；不重写产品定时常数，不用真实等待数分钟制造“性能”数据。

## 覆盖的 12 项

1. 短暂存储故障后冷却期直接旁路；冷却结束时 8 个并发请求只触发一次恢复 open 和一笔 probe transaction，恢复后原持久数据可读；旧 generation 的 error/abort/complete 晚回调不关闭新连接。
2. 连续失败按 15、30、60、120 秒退避且上限 120；时间流逝本身不启动后台探测，必须有新需求；一次成功恢复将下一故障的退避重置为 15 秒。
3. 非 SHA 图片在写盘不可用时，真实 `CachedImage` 挂载/卸载/重开三次；检查自然尺寸和实际媒体请求次数。
4. SHA 已验证热内存命中不先进入无关的 IDB 读取等待。
5. 相同非 SHA version、不同 source 的字节不共享。
6. 明确 bypass 只重新取一次图，随后普通请求复用新字节。
7. 热内存存在仍每次请求新鲜授权，403 不返回旧字节、不绕过到媒体。
8. owner 或版本变化重新取回对应字节，不命中旧身份/版本。
9. SHA 相同且分别授权的两个 source 保留内容去重。
10. 真实内存池通过小容量构造参数验证字节/项目上限和 LRU、超大条目不缓存、clear 后重新加载；这不是默认 32MiB 容量压力测试。
11. 下载取消后不交付像素。
12. pageerror、外部网络、供应商调用、生产写入均为 0。

## 实际命令与结果

```powershell
node scripts/verify-browser-cache-efficiency.cjs --source-root E:/Workspace/naumi/output/cache-efficiency-20261030/baseline-source --output-root E:/Workspace/naumi/output/cache-efficiency-20261030/tests/baseline-final --baseline
node scripts/verify-browser-cache-efficiency.cjs --source-root E:/Workspace/naumi-cache-efficiency-20261030 --output-root E:/Workspace/naumi/output/cache-efficiency-20261030/tests/modified-final
```

```text
BROWSER_CACHE_EFFICIENCY=REPRODUCED CASES=12 FAILED=5 OLD_DEFECTS=5 CONTROL_FAILURES=0 REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=1
BROWSER_CACHE_EFFICIENCY=PASS CASES=12 FAILED=0 OLD_DEFECTS=0 CONTROL_FAILURES=0 REAL_BROWSER=YES SUPPLIER_CALLS=0 EXIT=0
```

基线实际 exit1 是预期原缺口复现；7 个正控均通过，没有把缺少新接口当基线失败。修改版实际 exit0。初轮 baseline-r1 记录单独保留，最终报告未改写历史结果。

关键实际结果：

- 同一非 SHA 图真实组件重开 3 次：基线媒体传输 3 次，修改版 1 次；两者每次仍有新鲜授权，修改版 manifest=3。
- 恢复时 8 个同时请求：1 个通过探测取得原 IDB 数据，7 个立即 fallback；open 总数 1→2、transaction 总数 2→3。后续两次正常读取仍使用该连接，旧回调没有触发重开。
- 已验证 SHA 热图第二次读取没有 IDB readonly 事务，仍真实 decode 为 32×24；本轮 fixture 记录 17ms，只作为本机测试观测，不作为线上延迟承诺。
- 修改前后实际加载源码起止哈希一致；所有媒体均为 32×24 本地测试图片，不代表实际用户图或供应商生成验收。

报告路径：`output/cache-efficiency-20261030/tests/{baseline-final,modified-final}/RESULT.json`。目录下 `nonhash-reopened-image.png` 是真实组件截图，故意只展示测试色块，不作为产品设计图。

## 交接与边界

本测试子任务仅新增本脚本和本材料，不改产品、不提交、不合并、不部署、不接触服务器。最终回滚副本、四制品、主线整合由父任务统一执行。用户当次“清缓存后恢复”的具体线上故障类型仍未直接取证，本地故障恢复能力不等于线上事故根因已确认。


## 父收尾增量：来源B持久化正控

父按窄审边界补了有界warmSources标记，首次访问同SHA另一来源B仍保留其磁盘路径。新增 `SHA_NEW_SOURCE_PERSISTS_BEFORE_RELOAD_WITHOUT_EXTRA_DOWNLOAD`：真实读取A/B仅1次媒体传输，等B真实IDB条目出现后reload只开B，仍无新增媒体传输。该项在bbc8旧基线也通过，不以新增功能当旧缺陷。

最终脚本为13项，新增正控后baseline-v2 REPRODUCED/5旧缺口/8正控/exit1，modified-v2 PASS13/exit0。前述12项报告及hash为历史轮次，保留不覆盖；最终逐源码hash见 tests/modified-v2/RESULT.json，精确命令与字面stdout/exit见 FINAL_TEST_EXECUTIONS.json。后续副本回滚使用同一13项runner。
