# geeknow 备用生图通道接入（47）

## 背景与决策

2026-10-15 上午 gpt-image-2 唯一启用通道 platform-images（tdhcodex）持续闪断（200-无图/超时），三连败熔断导致 09:31–09:42 全站该模型 429。备用通道 APImart（mvp-a2bcf3b8）因欠费已于 10-13 停用，无兜底。用户指定：接入 geeknow 作为备用通道顶上，同时把 geeknow 的香蕉模型加到现有香蕉模型（Nano Banana Pro / Nano Banana 2 两族）的供应通道里；上线遵循蓝绿原则。

网络前提：47 直连 www.geeknow.top 被出口 TLS 重置（复现于本机与服务器）；经现有 Router 模型代理 172.18.0.1:17897 可达（models/images 均 200）。响应图域名 www.aicost.me 47 直连可达（适配器按 origin 独立取图，无需代理）。

## 变更内容

1. **App 容器蓝绿重建（仅环境变量）**：`MODEL_CONFIG_PROXY_ORIGINS` 增加 `https://www.geeknow.top`（原值仅 apimart）。新容器 `naumi47-blue-geeknowenv`（同镜像 f4b3df127f2f / 同挂载 / 同三网络 / 2.4G 内存）起于 loopback 13056，健康检查通过后 nginx `sites-enabled/reference-workbench` 七处 13055→13056 原位平滑切换。旧容器 `naumi47-skills-curation-f4b3df127f2f` 保留运行于 13055，切回=恢复备份 nginx 配置 + reload，秒级回退。
2. **模型配置 v111 → v112**（publication 07e37a78，phase=applied，validate diff 干净：+1 供应商 +3 upstream +11 公共模型加通道）：
   - 新增供应商 `geeknow-images`（openai-images 协议，https://www.geeknow.top/v1，timeout 280s / 并发 4），密钥经管理端 RSA-OAEP 公钥加密入库（凭据 id 18819fb3），未落日志或代码。
   - 新增 upstream：`geeknow-gpt-image-2`（wire gpt-image-2）、`geeknow-nano-banana-2`（wire gemini-nano-banana-2.1）、`geeknow-nano-banana-pro`（wire gemini-3-pro-image-preview），能力/参数映射克隆自同族现行通道，imagegen 证据字段改注“geeknow 目录 SKU；47 通道实测 2026-10-15 已通过”。
   - gpt-image-2 与 Nano Banana Pro（gemini-3.0-pro-image-* 五变体）、Nano Banana 2（gemini-3.1-flash-image-* 五变体）共 11 个公共模型各加 geeknow 通道：enabled、priority=2、weight=3；主通道 weight 7/priority 1 不变，APImart 保持停用。计费/展示不变。
3. **供应商元数据**：catalog API 实拉 geeknow 目录 258 模型入 `app_model_provider_catalog`（fetchedAt 2026-10-15，metadataSaved=true）。报价未能取得（站点管理接口需单独访问令牌，sk- key 不适用），按约定记未知，待有管理令牌后补录。

## 真实验收（3 次真实消费，事后管理员调整积分 +18 补回，admin 余额还原 998,656）

- gpt-image-2 → geeknow-images 直接命中 200（02:17 两次 response-received），artwork `art-job-0eb4d454` 1024×1024 落私有媒体。
- Nano Banana 2：主通道 prompt-hubs 429 → 调度器秒切 geeknow `gemini-nano-banana-2.1` 200（02:18:53），artwork `art-job-048ed97c`。
- Nano Banana Pro：主通道 429 → geeknow `gemini-3-pro-image-preview` 200（02:20:41），artwork `art-job-449bfcbd`。
- 计费：三笔各 -6 积分正常入账；通道健康表 geeknow 三个 key 均新增 200 成功记录；prompt-hubs key failures=10（其上游本身不稳，当日香蕉流量实际由 geeknow 承接）。

## 回滚路径

- 配置：管理后台版本历史 restore targetVersion=111（或 admin API restore），秒级。
- 容器/入口：`cp backup/nginx-before-swap.conf → sites-enabled/reference-workbench && nginx -t && systemctl reload nginx`（旧容器仍在 13055 运行）。
- 全部备份（23 张模型表 pg_dump、切换前后 nginx、容器 inspect、docker ps）在 `47:/opt/naumi-staging/evidence/geeknow-channels-20261015/backup/`，副本在本机 `output/geeknow-channels-20261015/`。

## 运维注意

- 发布全程持 `/opt/naumi-staging/releases/deploy.lock`，已释放（FREE）。临时密钥/会话文件已清理（服务器 /root/.geeknow-work 与本机 /tmp 副本均已删除）。
- 本轮 0 次业务发布（无镜像变更，版本仍 f4b3df1 / 1791989816）；两台独立约定不变，120/179/103 未连接。
- 遗留观察：tdhcodex 主通道当日闪断建议向其反馈；prompt-hubs（香蕉主通道）当日持续 429，geeknow 备用已在实际承接。
