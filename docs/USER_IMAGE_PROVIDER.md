# 用户自定义图片生成接口

## 本轮实现

- 普通登录用户可从头像菜单或「我的会员」进入 `/account/image-provider`。
- 配置按登录邮箱隔离，保存 Base URL、API Key、协议、模型列表和默认模型。
- API Key 在浏览器使用 RSA-OAEP 加密后提交，服务端再使用 AES-256-GCM 加密落库；读取时只返回掩码。
- 支持两种 OpenAI 兼容协议：
  - `OpenAI Images API`：调用 `/images/generations` 或 `/images/edits`。
  - `Chat Completions 生图`：调用 `/chat/completions`，支持文字与参考图内容。
- 配置页可直接测试 `/models` 并导入模型名，不必先启用配置。
- 用户模型以 `byok:<上游模型名>` 作为内部 ID，只向前端暴露「自定义 · 模型名」，不暴露 Base URL 或 API Key。
- 独立生图页和无线画布会读取当前登录用户的模型目录；启用后默认选中该账号配置的默认模型。
- 生图请求重新校验真实登录态、账号配置和允许模型，不信任客户端提交的邮箱，也不会回退到其他账号的配置。

## 数据表

`app_user_image_providers` 以 `email` 为主键并关联 `app_users`，包含：

- `enabled`
- `protocol`
- `base_url_enc`
- `api_key_enc`
- `models`
- `default_model`
- `updated_at`

## 网络地址约束

- 开发环境允许连接本机或局域网图片站，便于本地联调。
- 生产环境默认拒绝 localhost、链路本地和内网地址，减少服务端请求伪造风险。
- 自托管生产环境确需连接局域网服务时，显式设置：

```env
USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK=true
```

## 当前范围

本轮已接入 `/generate` 和 `/canvas` 共用的 `/api/generate-image`。A+ 和一键套图仍只展示并使用站点模型，避免出现可选择但无法执行的用户模型。
