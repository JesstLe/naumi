# 参考图上传请求体竞态修复

## 现象与来源

103 2026-10-14 10:33:12、10:34:04、10:34:13 UTC，POST /api/imagegen/inputs 返回500/HTML986字节。正式核心c05a923报NextRequestAdapter.fromNodeNextRequest的Response body object should not be disturbed or locked；generate-image同类日志存在。UI仍3bbebee，原核心/Worker未重启。

固定Next15.5.27的CJS/ESM next-server.js均调用异步requestData.body.finalize()而不await，路由可能先读取原始流。对应官方源码修复vercel/next.js#85418；不绕过功能权限中间件、不扩大素材或请求上限。

## 实现

- 安装/固定镜像构建时对固定依赖的CJS/ESM补await；实现漂移则拒绝构建，已修版本不重复补丁。
- 生图客户端统一解析响应，HTML/纯文本/空体不暴露原始页面和解析错误；保留accepted三态及按原操作号恢复，绝不自动重发不确定的收费提交。
- 已同步main d6f53dc，整合同事已完成的工作台原生模块/独立聊天页面/企业别名开户分支266c993。部署不启动47、不导入企业花名或改103账号。
- 性能分支尚在测量，NAS模块最新最终构建仍待完成，视频整模块未验收；不将这些候选混入正式创作运行时。

## 验收与发布（待完成）

集中验证HTTP响应/依赖补丁、真实分段multipart基线与修复对照、正常参考图上传及鉴权、实际生图回执/唯一计费、固定镜像、公网版本/健康/旧资源。103旁路修复槽仅承接持久化生图接口，原Agent/SSE及Worker继续原实例，保留回滚与两锁。当前未上线，不凭健康200声称生图通过。
