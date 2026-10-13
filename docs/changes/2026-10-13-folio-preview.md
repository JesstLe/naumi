# Naumi Folio 浅色预览

## 本轮交付

- 用户请求：参照 https://folio-topaz-delta.vercel.app/ 做一版项目样式供预览，不替换正式首页。
- 独立 worktree / 分支 `codex/folio-preview-20261013`，基于开工刷新后的 `origin/main`：`3f1aa4a`。共享 checkout 保持 `codex/labs-workbench`，没有切分支、提交其内容或覆盖文件。
- 新增 `design/folio-preview/index.html` 与本地 assets，直接双击 HTML 或通过本地预览服务器访问。无打包依赖，不读取环境变量、数据库或线上用户数据。
- 参考站实际浏览：白底、衬线大标题、居中首屏、淡色背景光晕、黑色按钮、大幅工作空间展示、Bento 功能区及 FAQ。保留 Naumi 自有标志和项目已有商品示例，未复制第三方客户背书、定价或业务数据。
- 本轮提供首页、作品展示、画布/套图面板、工具卡片、可拖动原图对比、工作区弹窗、作品详情、移动导航、FAQ 与键盘标签切换。
- 页面仅展示交互示例，新建创作切换到画布示例，不调用生成接口。此工作未接入真实登录、上传、生成与保存流程，后续正式首页集成属于下一阶段。

## 运行

在此独立工作副本执行：

```powershell
node scripts/folio-preview-server.mjs
# http://127.0.0.1:4317/
node scripts/verify-folio-preview.mjs modified
node scripts/record-folio-preview.mjs
```

预览服务器只监听本机。`index.html` 与 `assets` 同目录保留，可离线打开。

## 集中验收

- 当前正式首页 `src/components/home/landing.tsx` 保持 SHA256 `bc5dd07a499f5d05d6ec298ceae443f664ed3924f0df028aa1ec4605b55b99c2`，原件另存证据目录。
- BASELINE/MODIFIED/ROLLBACK 针对独立新增预览；基线为预览文件不存在，回滚在第二份复制件上移除预览 HTML，正式工作副本保留新样式。不是生产环境回滚演练。
- 本地浏览器真实验证标签页、键盘 Home、弹窗及无重复 ID、作品详情、对比 0%/100%、FAQ、390px 手机菜单/画布弹窗。
- 320/390/768px 视口无横向溢出；桌面加载图片无缺失，控制台 error/warn `[]`。只代表本机内置浏览器，不冒充原生设备全面验收。
- `output/folio-preview-20261013/` 保存 DIFF_FILE.patch、VERIFICATION.txt、可执行 ROLLBACK.sh、原首页副本、桌面/手机截图；不提交忽略目录。
- 未构建正式应用、连接服务器、部署或修改配置/DB/业务媒体。发布与空间维护计数不增加。本轮独立预览模块计数 1（自最新主线起），未达 3 次功能迭代同步门槛；交付前仍刷新 origin/main，必要时普通合并。

## 后续复用提示词

```text
继续 Naumi Folio 浅色预览，先读 docs/changes/2026-10-13-folio-preview.md。
保留参考站的白底、衬线标题、柔和光晕与黑色按钮，复用项目品牌和示例素材。
改动 design/folio-preview/index.html，不直接替换正式首页；交互不调用收费模型。
完成模块后集中运行静态检查、浏览器桌面/手机验收并更新文档与证据。
只有用户确认正式集成时，再将视觉模块接入已有路由、鉴权和真实数据。
```
