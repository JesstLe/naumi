# VOSS A+ 图片交付

生成时间：2026-09-12

生成链路：本项目 `POST /api/aplus`。

最终横版任务 ID：`aplus-1789223294162-556126`。

## 目录

- `source/`：从当前 Codex 任务恢复的 3 张用户原始实拍图。
- `generated-final/white-source-*.png`：项目先生成的 3 张白底商品母图。
- `generated-final/aplus-*.png`：项目基于白底母图生成的 6 张 1536×1024 横版 A+ 模块图。
- `generated-final/detail-long.png`：将 6 张 A+ 模块按首屏、卖点、场景、多角度、故事、参数的顺序无裁切纵向拼接成完整电商详情长图。
- `generated-final/detail-two-column.png`：在第 3、4 个模块之间换列，左列为模块 1–3，右列为模块 4–6；只在模块边界分栏，单张图片不截断。
- `generated-final/showcase.png`：默认双列分栏总览，适合在常规屏幕内完整展示。
- `generated-final/showcase-single-column.png`：单列详情长图总览，用于切换查看原始电商详情页阅读顺序。
- `generated-final/manifest.json`：最终任务 ID、项目接口、源文件和模块文件清单。
- `generated/`：首次调用的比例异常对照稿，仅在生成机器本地保留，不纳入 Git；跨机器复用请使用 `generated-final/`。

## 使用提醒

当前图片属于 AI 生成初稿。瓶身小字、条码、配料/矿物质参数和画面营销文案在正式上架前必须与真实包装及商品资料逐项核对，不应直接作为已审核的商品信息发布。
