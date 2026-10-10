# Naumi Logo 方案集 01

## 方案

- A 胶囊 N：用户认可的黑标/白标方向作为同一套正反色方案，原标志路径和31/256笔画比例完全保留。此次完善导出，不改变轮廓。
- B 折面 N：硬朗、平面几何，更强的结构感。
- C 轨道 n：小写圆角 n 和独立轨道点，更柔和。
- D 开放光圈：四瓣非闭合光圈，强调视觉创作，不要求读成 N。
- E 负形印章：圆角块中镂空 N，更适合紧凑图标。
- F 小球印记：单色小球与两只负形胶囊眼睛，贴近助手形象。

六个方向用统一黑白、相同展示比例对比，避免只换颜色造成虚假选项。A 是保留方案，并非已经替换站点；B-F 是待比较的提案，不声称独占性或商标注册核验。

## 每套素材

- `symbol-black` / `symbol-white`：透明背景，SVG 与 512px PNG。
- `app-dark` / `app-light`：黑底白标/白底黑标圆角应用图标，SVG 与 512px PNG。
- `horizontal-black` / `horizontal-white`：横版标志 + Naumi 字标，透明底 SVG 与 PNG。
- `favicon-16/24/32/48/64.png`：真实像素尺寸导出。
- `scheme-preview.svg/png`：各方案展示板。
- 总览 `comparison.svg/png`，本地方案页 `index.html`，结构清单 `schemes.json`。

Logo 导出中的 Naumi 字标已经转为路径，不依赖接收方安装字体。A 沿用上一稿 Arial Bold 的字标风格；B-F 使用已有项目的 Geist，保留其 SIL Open Font License。未分发字体文件。展示板上的编号/说明为普通文本，Logo 资产本体没有文本/外链图片。

## 规范

- 主色：石墨黑 `#181b23` 与白色 `#ffffff`，荧光黄不进入本轮主 Logo。
- 图标画布：512方形；应用图标圆角半径24.5%，本体外层留白5%，其内部包含标志固有净空。
- 独立黑标用于浅色背景，独立白标用于深色背景。不要在白底直接摆透明白标。
- 单独保留16px导出用于可读性比较；当前是提案，不把所有方向的小尺寸试稿等同于正式品牌验收。

## 复现

```powershell
python scripts/design-naumi-logos.py
node scripts/render-naumi-logos.mjs
node scripts/preview-naumi-logos.mjs
```

SVG 为原生矢量设计；本轮没有调用付费模型接口，也不是前两次未返回结果的 image_gen 产物。脚本使用本机 fontTools 与项目 sharp；Python 字体路径可按实际环境调整。素材只作为版本化提案保存，不变更 `public/logo.png`、品牌运行配置、小球配色或服务器。

后续可按 A-F 指定喜欢的轮廓，再做字标、光学对齐、图标净空与更细尺寸修订；不因选择提案自动上线。
