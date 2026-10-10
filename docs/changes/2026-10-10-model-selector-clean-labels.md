# 模型列表去除参考报价杂项

## 范围
- 用户指出工作台工具的模型名称后重复出现“参考标准1K xx积分”，要求清掉多余展示。
- 独立分支 `codex/model-selector-clean-labels`，基于最新 `origin/main`：`b6d226ebeeba525169d4f289a12de79c8b29153d`；不混入前一画布任务，不发布新机、不回传旧机。

## 原因与修复
- `/api/models` 提供兼容字段 `creditHint`，共享 `FeatureModelSelect` 把它直接拼到模型名称后；独立生图页也把它作为第二行展示。这是前端额外渲染，不是模型名称本身。
- 删除这两处展示，不用 tooltip/脚注等形式换地方重加；品牌图标、后台配置名称、选择顺序和已选标记保留。
- 提交按钮保留当前模型/质量/分辨率/数量的实际报价；后台积分配置和兼容 API 字段保留，未改计费、模型路由、供应商、存储或数据库。
- 后台设置积分说明移除已不成立的“前端模型选项显示标准1K参考价”一句；相关前端价格验收从“模型项带价格”改为“模型项干净、提交报价保持”。

## 验收与证据
- 完整本地 Next/Edge 浏览器使用返回参考价/预估价的受管模型 fixture，逐一扫描全部 26 个工作台工具，覆盖 1440/1024/390 三种宽度；检测已选模型和展开菜单，选择第二模型再切回。
- 基线 26 工具中共检查 66 次模型菜单，复现价格说明杂项；有些工具本就没有模型选择器，不强加新入口。
- 修复后 26 工具、三视口、66 次模型菜单检查通过，参考价杂项为 0；模型切换、品牌图标和当前规格报价 8→16 积分保持。
- TypeScript、定向 ESLint、现有工作台 45+13 项契约与 33 品牌图标/51 规则用例通过。
- 源码回滚在独立副本恢复四个原文件 SHA-256，并再次跑 26 工具基线浏览器复现原展示；候选分支保持修复。
- 更新的完整后台积分 UI 脚本本轮仅完成类型检查，未执行其真实数据库流程；本轮不改价格。
- 收尾刷新 origin/main 为 `f3ff2e6268e7e69ee4fd5908186232623eb46cff`，没有自动合并或发布。
- 完整证据最终以 `E:/Workspace/naumi/output/model-selector-clean-labels-20261010/VERIFICATION.txt` 为准。
- AST 扫描用户端 JSX，禁止渲染 `creditHint`；与原基线逐字对比确保产品组件仅删除上述展示和旧说明，品牌、选择、实际报价和后端核心文件保持。
- 隔离 mock 不代表真实供应商出图；本轮供应商调用 0，未改线上配置。

## 接手与回归
```text
node scripts/verify-model-selector-clean-labels.mjs
node scripts/verify-model-selector-clean-labels-browser.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```
```text
按提交整合 codex/model-selector-clean-labels，先刷新 origin/main。
模型列表不渲染参考质量、参考分辨率、参考积分或预估报价，不在其他位置重复添加说明。
保留现有品牌图标、后台显示名、有效能力限制与提交前实际报价；不改计费和模型配置。
本任务只提交分支，统一整合者合并与发布。
```
