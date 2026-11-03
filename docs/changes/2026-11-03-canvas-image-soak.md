# Canvas 图片长时重复浏览验收（2026-11-03）

## 模块与职责

本模块只增加本机验收脚本 `scripts/verify-canvas-image-soak.cjs`，不修改产品代码。它复用真实 `ReactFlow`、`CanvasImage`、`CachedImage`、浏览器图片缓存、驻留与原生 observer；HTTP 鉴权与图片字节使用显式 loopback fixture。没有服务器发布、业务数据库写入或供应商生成。

## 固定工作负载与接口边界

- Edge headless、1000×700 浏览器 viewport、900×600 ReactFlow；4 个真实图片节点不卸载，视口在 `x=0` 和 `x=-2400` 间反复平移。
- 4 张固定 3072×2048 PNG，每张 6,291,456 像素，总计 25,165,824 像素；理论 RGBA 为 96 MiB，此数字不是实测物理内存。源文件 SHA256 和压缩字节大小写入 `ASSETS.json`。
- 每版至少 20 轮，每轮离屏真实等待 15.3 秒再回访；不替换时钟、IntersectionObserver 或 ResizeObserver，不注入产品可见状态。
- `dfdec4f8a8b209d1a8f98f4908ac7da34cfd142c` 已含驻留释放。基线与当前不预期复现同一驻留缺陷，本验收用于固定负载回归对照，不能包装成新修复带来的内存降幅。
- 回访断言原生尺寸与 `original` 质量档不变、4 次初始字节传输后不再下载、离屏 live object URL 为 0／可见为 4、活动 DOM 数稳定。真实卸载并重新进入继续复用旧 bundle 和缓存。
- 切换 fixture 账户后立即清除旧像素，另一账户对相同资源返回 403；恢复原账户后重新鉴权。没有使用真实用户账号。

## 采样方法

`SAMPLES.jsonl` 保存每轮离屏／返回样本及检查点：

1. CDP `Performance.getMetrics`：JS heap used/total、节点、文档、监听器。
2. CDP `Memory.getDOMCounters` 与 DOM 查询：浏览器 DOM 计数及当前连接的元素／节点数量。
3. 仅包装 `URL.createObjectURL/revokeObjectURL` 记录 live Set 和累计计数，不保留已释放 URL 的浏览器端历史数组；验证累计创建增长并不等于长期存留引用增长。
4. CDP `SystemInfo.getProcessInfo` 获取**本次启动 Edge** 的 PID，Windows `Get-Process` 读取各 PID 的 `WorkingSet64`、`PrivateMemorySize64`。总 working set 可能重复计算共享页，不等同于 renderer 独占 RSS，也不测量 GPU 纹理。
5. 初始及第 5/10/15/20 轮显式 `HeapProfiler.collectGarbage`，逐条标记 `forcedGC`；原始未 GC 样本与受控 GC 检查点分别保存。固定工作负载的最终受控 GC heap 增幅门槛为 12 MiB，不把 GC 后 JS heap 变化等同于原生图片内存释放。

## 命令与证据层级

```powershell
node scripts/verify-canvas-image-soak.cjs --source-root output/browser-stability-goal-20261103/decode-baseline-source --output-root output/browser-stability-goal-20261103/soak/baseline --label dfdec4f8
node scripts/verify-canvas-image-soak.cjs --output-root output/browser-stability-goal-20261103/soak/current --label current
```

每次运行输出 `COMMAND.json`、`ASSETS.json`、`SAMPLES.jsonl`、`RESULT.json` 和实际 bundle；`RESULT.json.loaded` 列出实际加载的产品模块 SHA256，结束时再次校验期间未变。参数低于 20 轮或真实 15 秒时仅允许标成 `SMOKE_PASS`，不作为长时验收。

## 实际结果

两版串行执行，全部通过。每版保存 45 条完整样本，其中 12 条包含 Windows 本次 Edge 进程工作集；源图片 SHA256 与字节完全相同。

| 指标 | dfdec4f8 基线 | 当前代码 |
| --- | ---: | ---: |
| 真实连续循环数 | 20 | 20 |
| 循环耗时 | 311,712 ms | 311,943 ms |
| 每轮真实离屏等待 | 15,300 ms | 15,300 ms |
| 20 轮总图片字节请求 | 4 次 / 681,399 bytes | 4 次 / 681,399 bytes |
| 每轮离屏 live URL | 0 | 0 |
| 每轮返回 live URL | 4 | 4 |
| 连接 DOM 元素数 | 34（恒定） | 34（恒定） |
| GC 检查点 DOM nodes / listeners | 45 / 221（恒定） | 45 / 221（恒定） |
| 起始 → 第 20 轮 post-GC JS heap | 4,167,148 → 4,667,812 bytes | 4,139,260 → 4,661,704 bytes |
| 采样 JS heap 最小 / 最大 | 4,167,148 / 5,457,808 bytes | 4,139,260 / 5,464,244 bytes |
| Edge 进程工作集采样最小 / 最大 | 832,212,992 / 1,151,676,416 bytes | 860,573,696 / 1,128,611,840 bytes |
| 外部网络 / pageerror / 供应商调用 | 0 / 0 / 0 | 0 / 0 / 0 |

两版都通过原图尺寸/档位保留、回访缓存命中、旧 bundle 卸载重入及账户切换拒绝旧像素；没有因为长期循环而持续增加活跃 object URL、连接 DOM 或受控 GC 后的 DOM/监听器。JS heap 有约 0.5 MiB 的预热增长，记录原值，不声称所有内存完全不增长。

Windows 工作集不会在每次租约释放后立即回到冷启动值；本次数据没有证明 RSS/GPU 降低，也不支持把前后两个峰值之差宣传成优化百分比。它证明的是该固定负载超过 5 分钟的引用与交互回归通过，并保留了真实进程内存观察。

字面最终输出（两次退出码均为 `0`）：

```text
CANVAS_IMAGE_SOAK=PASS LABEL=dfdec4f8 CYCLES=20 DURATION_MS=311712 SUPPLIER_CALLS=0 EXIT=0
CANVAS_IMAGE_SOAK=PASS LABEL=current CYCLES=20 DURATION_MS=311943 SUPPLIER_CALLS=0 EXIT=0
```

实际加载源文件对照：基线 16 个模块逐一对 `git show dfdec4f8:<path>` 校验 SHA256；当前 17 个模块，只有以下差异：

- `cached-image.tsx`：接入 Canvas 解码队列，SHA256 `49696135d5193fa9c8ce0cef18b732f315af8efd04aeefbf7273105a8eefa848`。
- `canvas-image.tsx`：父线程移除独立 20 秒假失败定时器及无用 settled 状态，由有界实际读取/解码结果回报错误，SHA256 `197997d28b57ee653abd26beac568da472723e3f33af41d089034bd7ec1b6947`。
- 新增 `image-decode-queue.ts`，SHA256 `fa81b7c8fac6f8ea95bcf8679bad5cd08188967a4cbf4c717dcc2a6e16d52217`。

这不是只有 queue 的单变量性能实验，而是上述完整当前候选对固定基线的长时回归。测试本身 SHA256 为 `872c14d6dfeb6dc7ad31476c2fb40b101087f047fa1642d8907d3fdcb02c9502`。

完整证据目录：`output/browser-stability-goal-20261103/soak/`；其中 `BASELINE_SOURCE_CHECK.json`、`COMPARISON.json` 和两套 `baseline/`、`current/` 可独立复核。运行结束已重新读取 JSON 和样本，产品加载模块哈希均保持。

## 未完成与边界

- 本机固定工作负载不是 10 万用户容量、跨项目无限增长、所有图片格式或实际用户浏览器崩溃率验证。
- 质量断言核对原始响应字节/源文件 SHA256、实际解码 3072×2048 尺寸和原图档位；没有进行浏览器屏幕颜色／像素级差异测量。
- 引用及时释放不证明浏览器工作集或 GPU 内存立即下降；本报告只展示真实采样，不承诺浏览器内存归还策略。
- 无服务器部署或付费生成；生产状态由独立发布任务验证。
