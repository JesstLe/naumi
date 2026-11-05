# R6C：完整产品浏览器联动与公开模型读取边界

## 本轮进展

独立工作区 `E:/Workspace/naumi-refactor-20261024`，原始基线 `d2a20c381eacaf6924361474c74ac298fef52d9e`，4475原文件哈希及完整原字节归档。整体目标仍为持续整体重构，不合main、不部署。

本轮从完整R6A镜像、真实Web/Worker/PG与两份headless Edge会话开始，不使用fixture页面、HTTP桥接、route.fulfill或替代auth provider。浏览器才暴露公开目录仍依赖管理组装：`/api/config`、`/api/models`、`/api/text-models`在管理凭据错误时500/503，导致前端会话hydrate失败。旧镜像失败截图/响应/日志留在`browser-2`，不是只看结构推断。

## 实际重构

- `catalog-query.ts`读取已发布模型与必要的计费快照；公开读不再创建Router、credentials writer或发布runtime。
- `catalog-pricing.ts`抽出已有`publicCatalog`价格投影，管理runtime和公开查询共同调用，避免拆出第二份priceHint算法。
- 三个真实消费者改绑；`/api/models`独立抠图兼容分支复用同一snapshot，不再为判断空binding创建管理实例。
- `modelConfigurationEnabled`在已存在published pointer时保持managed模式；管理连接缺失不迫使目录/直接通道进入legacy，也不伪造空目录。管理写入、pool外部投影仍由原管理/执行链检查自身连接。
- `verify-model-catalog-read-pg.ts`完整源码真实PG/HTTP adapter对照：坏管理凭据/缺管理地址/正常管理地址；原16检查复现读取失败，新24检查公开读取保持、原6积分hint、写SQL0、外部调用0。此回归进入既有core catalog。
- 既有整包运行编排增加browser suite：只发布自有Web到127.0.0.1临时端口，PG/供应商/Worker不发布端口；Browser直接使用真实Web。普通runtime suite仍用internal network。

## 集中结果

固定应用候选 `b79f4776537c936b01ebc4fa1584813b6ea228dc` 的完整Linux镜像已构建，Image ID `sha256:c98c0f832c420c4961f739aab5c6922fc3d9b2fb55bcb3d3f7159f16aebd042f`。相同完整源码摘要 `f9b9c2bdeb08e5582af9f815ec5dd1a6c199b2f01586b9d492b7084055f89c06` 的 **22 项 core PASS/exit0**，新增catalog回归已包含；全项目tsc及本轮lint通过，emitted静态/全literal导入SCC仍0，三消费者到管理server的运行边4→0。

`browser-4`实际完整产品9组通过、exit0：两份独立认证浏览器上下文；图片改名冲突/保留两份/明确解决/undo-redo，文字冲突保留草稿/使用服务器版本，真实空白节点显示6积分→Web受理不执行→Worker调用合成供应商→完整作品落地，参考图走真实edit通道，再刷新原文档。恰好2张新图、2笔12积分，确认弹窗0、页面异常0、外部页面请求0；仅两个预期冲突接口返回409。

持续混合读取181.68秒、16轮（health/account/projects/text-nodes）后仍只有原2次生成和原2笔扣款；Web容器内存首336.4MiB、末338.6MiB；Worker首148MiB、末135.1MiB。数值为Docker memory usage，不是RSS或容量证明。原报告字段`mixedReadMs`实际包含docker stats采样时间，不应解释为HTTP耗时；后续代码已改名`sampleCycleMs`，原报告未改写。未将该标签修正当作重跑180秒。

真实Worker完成tick后drain、SIGTERM exit0；五个本轮容器及网络全部清理。完整图片原生样式截图已打开检查（`browser-4/full-product-canvas.png`），浅色布局保持。四产物、4475hash副本回滚、旧16项行为恢复、patch精确复放与最终Git远端绑定以DELIVERY为准。

前两次失败分别为Docker internal bridge不发布host port及旧应用目录管理耦合；`browser-3`新应用能加载后，测试观察器误用text表`width`字段而失败，改为已有text-node repository读取，未修改产品SQL或降低断言。最终测试helper与封版文档提交可能晚于b79f：明确区分被测应用SHA、验收脚本SHA，验证全部生产src/services字节相同，不冒充重新构建。首次tsc的脚本`this`类型错误也保留。

旧writer核对：主图片交互已不调用rename/mark/canvas-size/groups旧URL；position仍被结果落点、导入、恢复和其它明确消费者使用，不可凭字符串“旧”一删了之。独立raw接口与内部定位writer的统一留给后续闭合模块，未在本轮顺手改掉。

```powershell
python scripts/verify-refactor-runtime.py --suite browser --soak-seconds 180 --image-manifest IMAGE_MANIFEST --out output/refactor-r6c-browser-next
```

本轮为main同步后的第3模块；封版后普通整合origin/main并将计数归零，未将任务分支合main或部署。3分钟、两browser的小样本仅证明本机联动与资源观察；不是10万活跃容量、生产、外网供应商或远端required CI证据。旧writer、外围UI/测试资产整理、长时混合生成负载及依赖漏洞、最终完整候选仍未完成，整体保持active。
