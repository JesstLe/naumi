# 作品详情只显示真实提示词

## 问题与根因

上传接口将作品 `prompt` 保存为空字符串；作品详情灯箱对空提示词使用了中英文护肤品演示文案。因此上传作品也展示了与图片无关的示例内容，并非识图结果，也非上传时写入的提示词。

## 本轮实现

- `work-lightbox.tsx` 删除写死的演示提示词。
- `undefined`、空字符串和纯空白提示词不渲染提示词区域，不添加空状态解释文字。
- 真实非空提示词原文保留，既有“重做”仍传原始 `work.prompt` 和原图地址。
- 不修改上传接口、已有作品数据、积分、其他元信息默认值、画布或 Worker。

## 集中验收

- `node scripts/verify-work-lightbox-real-prompt.cjs`：直接执行真实 TSX，隔离 React hooks 和副作用；中英两语言各覆盖缺省、空、纯空白、中文真实词、英文真实词，共 10 组；确认重做参数、关闭调用、空作品及上传 route 空 prompt 契约。
- 基线使用同一脚本 `BASELINE.tsx baseline` 复现演示兜底；独立副本实际执行 `ROLLBACK.sh`，SHA256 恢复且同一基线测试通过。修改版保持修复状态。
- TypeScript 全量 `tsc --noEmit --incremental false` 通过（Next 15 / React 19 依赖）。
- `scripts/serve-work-lightbox-real-prompt-fixture.cjs` 渲染实际 WorkLightbox、LocaleProvider、Media 及生产 Tailwind 样式，仅 Next router 替换为本机记录器。T3 浏览器确认无词上传、真实提示词、重做和英文空白；原图解码 800×1000。
- Fixture 首次启动因 browser `process` 缺省空屏，已修 fixture bundler 环境定义后重新导航验收通过，未当作产品缺陷或通过证据。
- 供应商调用 0，无生产数据库、SSH、候选容器、Worker、Nginx 或线上动作。

## 状态与交接

基于 `origin/main=e997b290b39fc9df63e4c3b6387fa008b7b0e18d`，独立 `codex/work-lightbox-real-prompt-20261017`。本轮本地模块完成，功能迭代计数 1/3；提交前刷新 main。共享 checkout 未提交内容保持。修复分支提交推送不代表合 main 或上线；交统一整合/发布线程按最新 main 与蓝绿门槛处理。

完整命令、输入、字面输出、退出码、原始/修改 hash 与可执行回退材料在本 worktree `output/work-lightbox-real-prompt-20261017/VERIFICATION.txt`；实际本地浏览器截图 `upload-fixed.png` 与 `real-prompt-fixed.png`，不是线上截图。
