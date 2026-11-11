# naumi.top SEO / GEO

## 模块与职责

SEO 是搜索发现、理解和索引；GEO 是生成式搜索对公开资料的检索、理解和引用。本模块只发布可公开核实的产品资料，不读取用户作品、提示词、账号信息或管理配置，不以机器可读文件代替真实页面。

- `src/lib/seo/catalog.ts`：公开页面白名单、产品描述、三篇使用指南、问答及实际编辑日期，作为唯一事实源。
- `src/lib/seo/server.ts`：服务端域名与部署身份判断、Metadata 适配；只读取 Host 与部署身份，不信任转发域名，不查询数据库。
- `src/app/guides/`：服务端直接输出完整指南正文、目录、问答、操作入口与相关指南。浅色布局，不增加首页弹窗或大段营销文案。
- `src/app/robots.ts`、`sitemap.ts`、`llms.txt/route.ts`：由同一事实源派生抓取入口。
- `JsonLd`：输出转义后的 Schema.org 数据，阻止正文中的 `<` 终止 script 标签。

依赖方向为「公开事实 → Metadata / 页面 / XML / 文本 / JSON-LD」，不反向依赖任务、供应商或计费执行。无数据库迁移、价格变更、生成行为变更或付费请求。

## 技术 SEO

1. 首页、关于、联系、隐私、条款、指南列表及三篇指南，共 9 个公开 URL，分别配置标题、描述、自引用 canonical、Open Graph 与 Twitter 分享字段。
2. 所有 canonical 指向 `https://naumi.top`；请求中的跟踪参数不进入 canonical。Next 可能将根 URL 序列化为不带尾斜杠的域名，两种形式的 URL 归一化一致。
3. 站点地图只列入公开白名单，不列后台、API、私有作品、画布项目、工作台和登录页。仅指南携带真实编辑日期，不用每次请求的时间伪造更新。
4. 全站默认 `noindex,nofollow`，白名单页面显式开启索引。robots 允许白名单精确路径以及公开品牌/Next 资源，其他路径不作为抓取目标。robots 不是鉴权，现有账号/素材权限保持；已经收录的历史 URL 还需通过站长平台核对移除，不把禁止抓取当作历史索引已删除的证明。
5. 仅 `naumi.top` / `www.naumi.top` 且非独立企业站、非 Fleet 模式启用公开 SEO。非本站域名输出空 sitemap 和禁止抓取规则，指南/llms 返回 404，不输出 Naumi 产品 JSON-LD；保留自部署站的原品牌标题。
6. 首页发布 Organization、WebSite、WebPage、SoftwareApplication；指南发布 Article、BreadcrumbList 和与可见正文一致的 FAQPage。不编造评分、评论、用户数、价格、套餐、采购渠道或效果保证。FAQ 标注不等于搜索引擎承诺展示富结果。
7. Next 保留原有 HTML-limited 爬虫集合，并补充 AI 检索 User-Agent 的阻塞 Metadata：这些客户端在初始 `<head>` 就能读取 canonical/描述，普通浏览器保留流式渲染。Next 升级时核对该正则是否覆盖新默认集合。
8. 分享图为真实 1200×630 PNG，位于 `public/brand/naumi/social-card.png`。

## GEO 内容

- `/guides/ai-product-images`：商品图用途、参考图、需求描述与结果核对。
- `/guides/product-backgrounds`：白底/透明底/场景图差异、抠图与实际文件检查。
- `/guides/creative-canvas`：文字编辑与生成动作的区别、实际输入连接、方案比较。

每篇具备直接回答、具体操作、结果核对和真实限制，正文 SSR 可读，无需登录或执行 JavaScript 后才出现。页脚提供可抓取入口；指南之间互链，并连接现有工具。

`/llms.txt` 提供官方站点、产品简介和公开资料链接，并说明信息边界。它是补充性发现文件，不是 Google/Bing 的索引条件，也不保证任一 AI 搜索会读取或引用。公开网页的质量、抓取可达性和真实性仍然是基础。

## 集中验证

```powershell
$env:SEO_EVIDENCE='E:\Workspace\naumi\output\seo-geo-20261111'
node --import tsx scripts/verify-seo-geo.mjs --production # 先完成 NEXT_DIST_DIR=.next-seo-build 的构建
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

HTTP 检查启动本任务独立 Next 开发进程，使用本地虚拟配置而非线上数据，逐页检查 canonical、Metadata、H1、SSR 正文、JSON-LD、可见问答一致性、sitemap 白名单、robots 私有路径排除、未知路由 404、其他域名隔离、查询参数归一化与分享图。结束时停止该进程。

公开域名通过真实 Host 匹配，测试以本机 HTTP Host 请求验证；生产反向代理必须保留原始 `Host`，不得将转发头当作索引开关。

## 上线后闭环

- 先完成 103 当前发布的排空/收尾，再按发布手册从已整合 main 的固定提交做蓝绿发布。47 继续保持既有暂缓发布决定。
- 验收公网 9 个页面、robots、sitemap、llms、分享图，同时检查 Web/Worker 版本统一与旧版本素材兼容。Cloudflare 实际 robots 响应可能包含其托管前缀，必须检查最终组合后的抓取规则，而不仅检查源站文件。
- 在 Google Search Console、Bing Webmaster Tools 及需要的百度站长平台核验站点所有权并提交 `https://naumi.top/sitemap.xml`。账号内的提交回执分别记录；代码推送不等于已经提交或收录。
- 记录搜索曝光、点击、索引页数及实际 AI 引用来源。按品牌词、AI 商品图、透明底处理、创作画布分别查看，而不是用一次手动搜索排名当成增长证据。
- 用固定问题观察生成式搜索是否提到/引用本站：Naumi 是什么；如何用 AI 做商品场景图；PNG 为什么不一定透明；文字节点打字是否自动生图。记录日期、引擎、原问题、回答链接与真实引用 URL。没有引用时保留未观察到，不编造结果。
- 后续优先补真实、经授权的案例，包含输入、步骤、输出和失败修正。不得把演示素材当客户案例，或为铺关键词批量生成内容高度相同的页面。

## 可复用内容维护提示词

```text
根据 Naumi 当前已验证的产品行为，维护一篇中文使用指南。
目标问题：<用户真实问题>
已验证的行为与证据：<代码/实际界面/测试回执>
正文结构：直接回答 → 准备材料 → 实际操作 → 结果核对 → 两个真实问答。
不编造价格、用户数、排名、效果保证、模型能力或未上线功能。
不加入口号、重复标签、隐藏关键词或只对爬虫显示的内容。
先修改 src/lib/seo/catalog.ts，再检查页面、llms、sitemap 和 JSON-LD 是否一致。
只有正文实际更新时修改 modified 日期；完成模块后集中运行 verify-seo-geo。
```

## 参考入口

- Google Search Central，AI features and your website：<https://developers.google.com/search/docs/appearance/ai-features>
- Google Search Central，robots.txt：<https://developers.google.com/search/docs/crawling-indexing/robots/intro>
- Google Search Central，FAQPage：<https://developers.google.com/search/docs/appearance/structured-data/faqpage>
- Bing Webmaster Tools：<https://www.bing.com/webmasters/>

各搜索引擎的索引与展示规则可能变化，后续运营以其当前控制台及文档为准。
