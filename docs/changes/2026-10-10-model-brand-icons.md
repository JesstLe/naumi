# 模型品牌图标统一识别（2026-10-10）

## 状态
- 分支 `codex/model-brand-icons`，开发基线 `365878e012d39e5137fc12217c69661f0941fb10`。
- 图片中 `gpt6Astra` 未命中原 `gpt-` 正则；文字选择器只传ID，不传显示名称。
- 本轮只开发、验收、提交并推送任务分支，不合并/部署新机，不操作旧机。

## 实现
- `src/lib/model-brand.ts`：统一展示识别层，17种品牌；与请求路由/计费/模型能力严格分离。
- 优先级：显式 `brand` > 公开别名表 > 模型ID家族规则 > 显示名称家族规则 > 通用星芒。
- 标准化大小写、全角字符与连接号；支持 `gpt6Astra`、GPT版本、OpenAI reasoning、provider/model命名空间、中英文常见品牌前缀。
- 精确公开别名集中维护；规则以品牌前缀及边界匹配，不用全文包含，避免 `gptastic`、`metaphor`、`grokking` 等误判。
- 已识别ID优先于名称；不因显示名称被改成另一个品牌而覆盖明确ID。完全不透明的自定义名需维护公开别名表或显式brand，前端不泄露真实上游ID。
- `ModelIcon` 为共享展示组件：文字节点下拉触发器/选项、画布图片模型触发器/选项、生图页选项/触发标签统一传入名称。尺寸与品牌资源分开维护。
- 未增加数据库brand字段或后台设置页；未来需要后台配置时将受限brand枚举接到已预留属性，不使用任意远程URL。

## 图标来源
- 来源为用户指定的 https://lobehub.com/zh/icons，对应 npm `@lobehub/icons@5.23.0`，MIT。
- 最新包 peer React19/Antd6/同系UI，而本站React18。因此本地封装17项SVG，几何路径逐项与固定包比对；不安装整包，不在页面加载第三方CDN。
- 保留已有14项验证过的LobeHub路径，补Gemini/Wenxin/Hunyuan，移除字母徽标兜底。
- `docs/licenses/lobehub-icons/LICENSE` 保留原MIT许可；`sources.json` 记录固定版本、来源成员、包/成员/几何SHA256。
- 这是LobeHub品牌资源，不把来源库等同于各厂商官方发布。

## 验收与交接
- 原始组件实际render复现gpt6Astra通用图标/显示名称不生效。
- 51例规则与优先级、17项真实SVG渲染、未知模型中性兜底、源路径hash检查通过。
- 三个调用方除ModelIcon名称属性外逐字一致，路由/生成参数/模型选择逻辑/计费均未变更。
- TypeScript及本轮组件lint通过。`next build`退出0、编译/类型检查及88页生成通过；已有annotate-editor img警告保留。Windows依赖junction导致standalone symlink EPERM告警，未把该本地standalone作为可部署镜像。
- 交接前刷新origin/main为`3552607d0acb185ba284beffab4801af7e4dcb97`，新增提交仅发布记录，与本轮源码范围无差异；分支未自行合并。
- 实际TextModelSelect/TextModelProvider浏览器验收（本地HTTP目录fixture）：gpt6Astra触发按钮与菜单为OpenAI；不透明ID+GPT显示名识别，切换后图标正确。
- 浏览器验收是隔离真实组件+本地目录，不是完整画布/线上验收，模型消费0。
- 回滚仅作用于带标记的独立源码副本，恢复原文件hash与原始通用图标；实际分支保持新实现。
- 证据 `E:\Workspace\naumi\output\model-brand-icons-20261010`。

```text
接手先阅读AGENTS.md、docs/AGENT_COLLABORATION.md与本文。
刷新origin/main，整合codex/model-brand-icons；不要覆盖同事的canvas-client改动。
执行node scripts/verify-model-brand-icons.mjs及typecheck/build。
统一新机发布前验收文字节点gpt6Astra、图片品牌、菜单和未知模型兜底；旧机禁止自动回传。
```

## 彩色版本补齐（2026-10-10，后续修正）
- 基线提交 `8ce0367f33f3c644bc53fa938d81703d92a5acf0`，沿用 `codex/model-brand-icons`，仍只推分支不发布。
- 上版Gemini选用了Mono，部分标为Color的旧资源只取了路径、漏了渐变，因此千问和即梦也呈黑色。
- 按相同固定LobeHub 5.23.0源补齐10种Color版本：Gemini、Qwen、Kimi、Jimeng、MiniMax、Mistral、Zhipu、Meta、Wenxin、Hunyuan。
- Gemini恢复蓝色底形与绿/红/黄三组渐变；所有图层、clipPath、渐变颜色及几何均保留。不是给单色SVG任意套颜色。
- 渐变/裁切ID采用React useId，各实例独立，防止节点/菜单同时显示时串色；Kimi原Color使用白色K，配源品牌#000底板保证浅色UI可读。
- OpenAI和Grok在此版本库只有Mono，保留黑白标识，其余品牌维持已有彩色。
- 模型识别、ID/显示名优先级、三个选择器、生成路由与计费未改变，逐字对照通过。
- 原始单色复现、10种Color颜色断言、多个同品牌SVG引用唯一性、17品牌回归、TypeScript和组件lint通过。
- 实际浏览器组件预览检查Gemini 16/24/32px及品牌网格，颜色正确、4个实例各自渐变ID，无控制台错误；这不是线上验收。本轮未重跑完整生产构建。
- 回滚仅在带标记源码副本恢复5个原文件hash和原Gemini Mono，实际分支保留彩色修复。
- 本轮证据：`E:\Workspace\naumi\output\model-brand-colors-20261010`。
- 统一合并后运行 `node scripts/verify-model-brand-icons.mjs`、`node scripts/verify-model-brand-colors.mjs` 与构建，再验收真实节点/菜单图标。

## 覆盖补充与彩色优先（2026-10-10）
- 基线 `1ccf8a9eff483a3ea9e967083c3c083fb0d2dbd7`；沿用 `codex/model-brand-icons`，不自行合并或发布。
- 从17种扩大到33种品牌/产品家族标识，固定LobeHub 5.23.0中有Color的优先完整采用：25项Color、8项Mono。
- 新增16项源资源：ByteDance、FLUX、Stability AI、Ideogram、Recraft、Sora、Kling、Hailuo、Alibaba、PixVerse、Runway、Stepfun、Yi、InternLM、Cohere、Midjourney。
- 生图补Seedream/FLUX/SDXL与Stable Diffusion/Ideogram/Recraft/Midjourney；视频补Seedance/Sora/可灵/海螺/万相/PixVerse/Runway；文字补阶跃星辰/零一万物/InternLM/Cohere及Command别名。
- 固定库没有Seedream/Seedance/Wan专用标识，因此分别采用已验证的母公司ByteDance/Alibaba彩色标识；不把母公司标识说成产品专用logo。
- 彩色优先不是随意染色：OpenAI、Grok、FLUX、Ideogram、Recraft、Runway、Stepfun、Midjourney此版库只有Mono，原样保留。未来源库提供Color再替换。
- 识别支持ID/显示名称、中英文前缀、版本号、provider/model命名空间；产品规则排在母公司规则之前，如doubao-seedream归ByteDance，minimax-hailuo归Hailuo。
- 仅扩展示层，不改变模型启用、上游配置、能力/参数、消费预算、生成或计费；新增图标不代表对应模型已经接入。
- 新脚本 `scripts/verify-model-brand-coverage.mjs`：原17项缺口真实render复现、129项ID/显示名/反例检查、33品牌渲染、25项Color源色断言、同品牌多实例渐变引用检查通过。
- `verify-model-brand-icons`来源/路径hash计数改为动态，33项源资源通过；此前Gemini彩色回归、TypeScript、组件lint通过。
- 浏览器隔离真实ModelIcon预览33身份+未知兜底、42实例，Sora/可灵16/24/32px与Gemini等渐变显示正确，无重复ID或控制台错误。不是线上验收，无供应商消费。
- `next build`退出0，编译/类型检查/88页生成通过，已有img警告保留；Windows依赖junction的standalone复制告警不作为服务器部署包成功。
- 源码副本回滚恢复6个原文件hash和17项注册表，实际分支保留33项实现。
- 证据 `E:\Workspace\naumi\output\model-brand-coverage-20261010`。

```text
接手刷新origin/main，整合codex/model-brand-icons全部提交，不覆盖同事canvas改动。
执行node scripts/verify-model-brand-icons.mjs、node scripts/verify-model-brand-colors.mjs、node scripts/verify-model-brand-coverage.mjs及构建。
验收模型触发标签/菜单中新增产品及彩色SVG多实例；只有图标更新，未启用任何新模型。
统一部署新机时遵守deploy.lock与备份回滚；本任务仍不自动回传旧机。
```
