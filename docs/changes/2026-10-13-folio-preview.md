# Naumi Folio 浅色预览

## 2026-10-13 最新修订：103 顶部与底部不变，只更新中间

- 用户最终要求以两张截图为准，保留 103 顶部及底部布局；中间参考 Folio，并使用 Naumi 原创新素材。
- 已真实只读查看 `http://103.30.76.93/`、`/retouch`、`/suite`，运行页面显示 `v2026.10.13-144426`。此前没有核对线上、沿用旧香水/抱枕/衬衫/风扇图的初稿已被替代，以下初稿说明仅为历史。
- 直接读取 103 已渲染顶部/底部 DOM 和实际 CSS，存到 `assets/shell/`，通过 Shadow DOM 隔离：保留原导航顺序、创作下拉、右侧积分/兑换码/头像，以及底部产品/资源/关于三栏、版权/隐私/条款/语言。不是重新设计顶部或底部。
- 展示余额/头像来自截图对照值，属于静态预览，不同步账号。控件保留样式，点击只进入预览面板或显示提示；未绑定生产兑换、支付或账户操作。390px 保留原品牌/右侧控件，折叠桌面导航以避免溢出。
- 删除初稿中六个旧图片副本及全部旧图引用，没有重新复制旧图。当前 10 张素材均来自 `public/demos/workbench-v2`：茶壶精修、随行杯场景、音箱换色、咖啡机套图；从原始 manifest 核对逐项 SHA256 和原生生成来源，另存不含账号细节的子清单。未生成新图片，不冒充工具效果实测。
- 仅改独立预览；正式 `site-header.tsx` / `site-footer.tsx` / `landing.tsx` 都保持原哈希。没有修改 103 服务、配置、数据库或真实作品。
- 原清空版本保存在 `output/folio-shell-20261013/original`。新 `scripts/record-folio-shell.mjs` 执行 BASELINE/MODIFIED/ROLLBACK，在另一个副本中恢复旧空白版本、移除新素材，实际预览保留最终样式。`record-folio-preview.mjs` 已指向新记录器。
- 浏览器：顶部 60px / 原导航与右侧布局、底部三栏、所有已加载图、标签页/三节点画布/四图套图、详情图640px、比较0%/100%、弹窗/无重复ID、控制台 error/warn=[] 通过。390px 视口实际 clientWidth375，无横向溢出；手机截图接口本轮失败，未将桌面截图标为手机。桌面整页和顶部/底部截图已保存。
- 初稿1模块 + 清空1模块 + 当前最终修订1模块达到3次，交付前已 `git fetch origin main` 并整合最新 `3f1aa4a`（无需新增合并，已包含）；功能计数归零。没有正式发布，服务器维护计数不变。

复验：`node scripts/verify-folio-preview.mjs modified`；证据生成：`node scripts/record-folio-shell.mjs`。

```text
继续此预览时，保留 assets/shell/ 中103实际顶部/底部的DOM和样式，不重排两端。
仅编辑中间内容；图片只来自 assets/workbench-v2 且核对来源清单，不复用旧香水/抱枕/风扇等案例。
保留 Shadow DOM 隔离，保持正式站点源组件不变。模块完成后集中验证并更新当前记录。
```

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
