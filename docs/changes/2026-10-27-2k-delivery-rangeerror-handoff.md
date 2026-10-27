# 交接：gpt-image-2 2K 任务交付管线 RangeError 故障（进行中）

日期：2026-10-27 10:30 北京 ｜ 交接方：ZCode 会话（诊断完成，根因修复移交）｜ 状态：**生产持续发生**

## 一句话

线上 a33ed3ae：`gpt-image-2` 的 **2K 分辨率任务约 75% 在本地交付阶段崩溃**（`RangeError @ output-processing`），供应商侧全部成功、图片完好存在 checkpoint 里；错误消息承诺"正在恢复交付"但恢复扫描不捞 error 状态任务，导致图扣在库里、积分预占不释放、用户看到失败。1K 完全正常。**仍在发生（截至 10:25）**。

## 影响快照（3 小时窗口，10:25 实测）

| 分组 | 结果 |
|---|---|
| gpt-image-2 1K | 98 done / 0 error |
| **gpt-image-2 2K** | **4 done / 12 error（75% 失败）** |
| 首例 | 2026-10-27 01:42 UTC（09:42 北京），此后每几分钟一笔 |
| 积分 | 每笔预占 8-12 未释放，合计约 120（`holds_on_finished` 持续增长） |

## 已确证的事实（每条附取证方法）

1. **供应商无罪**：失败任务的 supplier calls 全部 `apib-image:completed`；我取出了真实输出——`payload->paidOperations` 的 result 里是 5,230,746 字符 data URL，解码 3,923,041 字节 PNG，**1536×2048、channels=3、depth=uchar**（apib 原生 2K，图完好）。
2. **崩溃签名**：`snapshot->'deliveryFailure'` 全部为 `{"code":"DELIVERY_FAILED","name":"RangeError","stage":"output-processing"}`，`deliveryAttempts=3`（进程内 3 次重试全灭，确定性、按任务数据触发）。容器日志 `docker logs naumi47-web-creations-20261027-r1 | grep "delivery failed"` 有逐笔记录（catch 故意只记 name/stage/code，无 message/stack——见 route.ts:949-953 注释）。
3. **崩溃区间精确**：`src/app/api/generate-image/route.ts`（a33ed3ae）**804-836 行之间**。`deliveryStage` 在 739 行随调用初始化、804 置 output-processing、836 置 storage——记录值为 output-processing 说明真实抛点必在这 32 行内，不是误标。
4. **恢复承诺未兑现**：`recoverDurableImageJobsLocal`（含 recoverStoredDeliveries）每 20 秒在跑（scans_5m=20），但这些 error+checkpoint 任务的重试计数停在 3 不再增长——**恢复路径不认 error 状态的 stored checkpoint 任务**。这是第二个需修的点。
5. 12 笔失败父任务的错误消息均为"图片已生成，正在恢复交付"（route.ts:958）。

## 已排除项（别重复劳动）

- 上游无关：sunburst/flare 双上游成败混杂。
- 请求参数无关：ratio（1:1/3:4 两边都有）、origin（blank/canvas 两边都有）、transparent（两边都有）、参考图数（1-2 两边都有）。
- 后处理策略未启用：成功与失败任务的 `payload->modelExecutions` 均无 postprocess 配置 → 走 else 分支。
- **sharp 本身无罪**：我用真实失败图片在应用容器内复现了 metadata→resize(2048, lanczos3)→png→dataURL 全链路，全通（输出 5.8MB/7.8M chars 均正常）。注意该图 longSide=2048，scale=1.0，resize 实为 no-op 重编码。
- 以下函数均为内部全捕获或纯函数，不可能外抛 RangeError：`upscaleImages`（逐图 try/catch）、`enforceOutputShape`（tw/th=0 早退）、`attachImageDimensions`（逐图 try/catch）、`imageRatioMismatch`（纯算术）、`inspectImagegenPixels`/`decodeImagegenPixels`（受控 Error，且 transparent 仅 2/12）。

## 建议排查路径

1. **第一刀：拿到真实 stack**。catch（949 行）故意丢弃 message/stack——临时在 catch 里把 `e.stack` 写进 `deliveryFailure`（或 console.error 全栈）发一个诊断版，或本地起服务用下面的"复现坐标"重放 runJob 交付段。拿到 stack 后根因大概率五分钟内见分晓。
2. RangeError 常见来源对照该 32 行代码：`new Array(n)`/`Uint8Array(n)` 非法长度、`toFixed/toPrecision` 参数越界、`String.repeat`、超大 Buffer。怀疑与 2K 大图的数据依赖分支有关（1K 图不触发、4/12 的 2K 图不触发——找出成功 2K 与失败 2K 的图片差异：尺寸？channels？base64 长度？）。
3. **修复三件套**：① 根因修复；② 恢复路径补上 error+checkpoint 状态（"正在恢复交付"必须真的会恢复）；③ 12 笔卡单处置——图在 checkpoint 里，修好后应恢复交付给用户，或按业务口径退款（图已生成，参考 2026-10-26 晚"已出图让利"先例）。

## 复现坐标（47 库）

- 样例失败任务：`job-a42d7445-19c1-4cf7-a214-78233dc0f7e6`（父 `imagegen-af390e4a-cd98-5f9e-a97e-6a054652f36f`），2K / ratio 1:1 / refs=2 / origin=blank / transparent=false。
- 刷新统计：`SELECT (snapshot->>'status'), count(*) FROM app_image_jobs WHERE kind='generate' AND payload->'p'->>'resolution'='2K' AND updated_at>now()-interval '3 hours' GROUP BY 1;`
- 真图字节：`SELECT snapshot->'paidOperations' FROM app_image_jobs WHERE id LIKE 'job-a42d7445%'` 的 result[0].url（data URL）；服务器 `/tmp/fail-img.bin` 有我 dump 的副本（重启即失）。
- 环境：App `naumi47-web-creations-20261027-r1`（commit a33ed3ae，13118），Worker 同镜像健康；模型配置 v150；DB `naumi-staging-db-1`。

## 止血选项（需用户拍板，交给你时执行）

在根因修复落地前，可发 v151 将 gpt-image-2 的 **2K 档临时下架**（纯配置，模型配置 API 流程），用户只可选 1K，故障入口即关闭；修复发布后恢复 2K 并对 12 笔卡单跑交付恢复。若用户未明确授权下架，先做根因修复。

## 验收清单（修复发布后）

- [ ] 2K 任务连续 30 分钟零 RangeError（`deliveryFailure` 不再出现）
- [ ] 既有 12+ 笔卡单：图送达用户或积分释放（`holds_on_finished` 归零）
- [ ] 恢复扫描对 error+checkpoint 任务生效（人为构造一例，观察 20 秒内被捞起）
- [ ] 1K 回归无变化（对照发布前后各 30 分钟 done/error）
