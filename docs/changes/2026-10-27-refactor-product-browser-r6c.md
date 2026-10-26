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

## 尚在验证

新完整镜像构建、完整产品两tab创作/冲突/刷新、持续混合读取与资源观察、core/类型/lint、独立副本回滚及提交收尾，以`output/refactor-r6c-20261026/`为准。前两次失败分别为Docker internal bridge不发布host port及旧应用目录管理耦合，原始结果保留。

旧writer核对：主图片交互已不调用rename/mark/canvas-size/groups旧URL；position仍被结果落点、导入、恢复和其它明确消费者使用，不可凭字符串“旧”一删了之。独立raw接口与内部定位writer的统一留给后续闭合模块，未在本轮顺手改掉。

```powershell
python scripts/verify-refactor-runtime.py --suite browser --soak-seconds 180 --image-manifest IMAGE_MANIFEST --out output/refactor-r6c-browser-next
```

3分钟、两browser的小样本仅证明本机联动与资源观察；不是10万活跃容量、生产、外网供应商或远端required CI证据。
