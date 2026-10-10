# 正式采用 A / 胶囊 N

用户确认使用第一套方案作为新 Logo。本轮直接复用 A 的路径，不重新设计轮廓。

## 实现

- 默认导航、登录和小球页采用透明石墨黑 N；顶栏方形标、明暗画布及浏览器图标采用黑底白 N。
- 共享 Logo 组件的默认单色标在深色主题反白；自定义品牌图片不被主题滤镜改变。favicon 使用 512px PNG，同时兼容 Apple touch icon。
- 资源统一保存在 `public/brand/naumi`，同时替换旧 `public/logo.png` 兼容已有路径。
- 黑白透明标及横版字标保存为 SVG，文字已经转为路径。站内采用纯符号加现有品牌名，不重复字标。
- 新的默认资源路径避免浏览器继续使用旧 Logo 缓存；保留环境变量及后台自定义 Logo，不重写用户白标配置。
- 不修改小球动效、数据库、模型、积分或媒体。

## 验收记录

原基线 `1ee48c9`，原 `public/logo.png` SHA256 为 `bafa660a949822e5f3cdf4ef36772d2f9eb6ac75982a17d4e29ac809fb7967f3`。
基线品牌检查 46 项通过。集中验证品牌回退、素材字节与轮廓、透明度/无荧光黄、类型检查及浏览器图像加载。
本轮修改包、diff、实际输出与副本回滚演练保存于 `output/naumi-logo-adoption-20261010`，与旧方案探索证据分开。

## 接手提示

```text
使用方案 A，不改 M73 179 L96 77 L160 179 L183 77 轮廓。
浅色 UI 用 symbol-black；需要黑底白标时用 app-dark；保留显式白标配置。
运行 node scripts/verify-brand-config.mjs 与 node scripts/verify-naumi-logo.mjs。
发布仅针对新机，遵守共享 deploy.lock 与最新版本检查，旧机不回传。
```

发布及最终验收结果将在实际完成后补充，不把设计文件或本地结果记为线上发布。
