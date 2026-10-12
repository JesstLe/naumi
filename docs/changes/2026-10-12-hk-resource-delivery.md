# 2026-10-12 香港5Mbps资源加载优化

用户要求解决香港打开卡顿/资源加载慢，确认香港带宽5Mbps；随后优先恢复120并明确两台暂且独立。120原生服务已恢复（见2026-10-12-restore-120-independent.md），本轮优化仅香港网关，未停用任一端或同步两边数据库。

## 瓶颈与最终效果

香港CPU/内存空闲、应用本机响应毫秒级，JS/CSS原本已gzip。实际冷浏览首页60个资源，两张PNG示例图合计2,041,365字节，占主要下载量。同一Playwright浏览器关闭缓存前后各测一次，首个HTML约0.4–0.5秒，完整load从17,431ms降至2,909ms；资源传输从2,441,138降至507,337字节（约79.2%减少），请求数保持60。这是该测试网络的首页观测，不承诺所有用户/页面相同用时，也不是5Mbps扩容。

| 示例图 | 原PNG字节 | 浏览器WebP字节 | 减少 |
|---|---:|---:|---:|
| hero-after | 1,286,459 | 88,968 | 93.1% |
| hero-before | 754,906 | 28,042 | 96.3% |

## 已上线改动

scripts/staging/optimize-public-delivery.py对现有Nginx生成候选配置，严格识别既有本机App上游/worker禁用保护和唯一插入点，拒绝直接覆盖原文件或重复安装。仅/demos安全命名PNG/JPEG在浏览器支持WebP、没有查询参数和Range时，使用既有Next图像优化器生成1080宽度上限、quality80的预览；维持原URL与源文件，Vary: Accept、浏览器缓存1小时，优化失败回退原静态资源。fetch/download默认Accept */*、显式query或Range仍取原图。未压缩覆盖业务媒体，未修改模型输入、用户上传、下载接口或数据库。

网关补充CSS/JS/JSON/SVG的gzip，沿用已有Next压缩；HTML/API不新增共享缓存，通用proxy_buffering off保持，SSE不纳入新增gzip类型。压缩预览响应带X-Naumi-Delivery: demo-preview-v1。只reload公共Nginx，App/Worker/DB配置、启动时间和镜像指纹前后相同；无需重新构建固定业务镜像。

## 验收、备份、回滚与交接

香港Naumi/Hub deploy.lock全程持有，切换前核对e04ce4b固定Image ID，备份最新可读pg_dump/TOC、env/Compose和原网关；候选nginx -t通过。两示例WebP可显示且保持1024×1024，默认fetch原图与私有App原图逐字节一致，Range206/16字节、query返回PNG、缺失文件404、worker公网403、/.env404、静态展示网站Host200。公网页面和实际版本通过，匿名积分目录401为原有鉴权结果；新增付费模型调用0。脚本失败自动恢复旧网关，不恢复数据库。

业务镜像/版号保持e04ce4bcd218bc464889bb64dea61071d1c67b3d / v2026.10.11-172206；Image ID sha256:91b7e82abc9c5109a5a28fce66bc76ea57c89ba3143f9ca0f9becbc60e8d3e08。证据/opt/naumi-staging/evidence/hk-resource-delivery-20261012，包括deploy-delivery.sh、nginx.before.conf/nginx.candidate.conf、备份、前后容器指纹、delivery-bytes.json和DELIVERY_COMPLETE/FINAL_ACCEPTANCE_COMPLETE。回退只恢复nginx.before.conf到公共服务配置并nginx -t/reload，绝不回灌数据。最终进程退出、Naumi/Hub锁可取得。

两台暂且独立运行决定保持；120上游127.0.0.1:13012，香港也使用自己的127.0.0.1:13012。域名未改，OSS/NAS未接，旧101未连接。香港成功发布计数1→2，120恢复计数仍1；香港磁盘40%/约29GiB可用，无需清理业务数据，未prune或删除volume。只清除本轮/tmp临时脚本/诊断指纹，完整有效凭据与回滚备份保留。迁移heartbeat仍PAUSED。本轮没有实现业务作品列表本地缩略图、减少路由预取或双地域数据共享，不能将它们记作已完成。
