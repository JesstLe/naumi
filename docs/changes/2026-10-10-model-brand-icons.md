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
