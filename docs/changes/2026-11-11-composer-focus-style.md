# 创作输入框聚焦描边修复（2026-11-11）

## 模块与职责
- `src/components/home/creation-composer.tsx` + `creation-workbench.module.css`：首页创作工作台与原生对话共用的创作输入框（CreationComposer）。

## 调研结论
- 用户反馈：点击输入框（光标选中）时出现两个框——textarea 周围一圈 2px 青色描边、外层大卡边框变青色。
- 来源：模块内全局焦点规则 `.root textarea:focus-visible{outline:2px solid var(--cr-accent);outline-offset:3px}`（textarea 聚焦恒匹配 focus-visible）+ `.composer:focus-within{border-color:var(--cr-accent)}`。

## 实现内容
- 删除 `.composer:focus-within` 边框变色；外层卡片恢复恒定 `--cr-border` 中性边框。
- 新增 `.composer textarea:focus,.composer textarea:focus-visible{outline:none}`，与全局规则同优先级且在文件中靠后，覆盖生效。
- 首页（dashboard-composer）与对话（chat-composer）共用同一组件与样式模块，一处修复两处生效；其余控件的 focus-visible 描边保留（键盘可达性不受影响，仅创作 textarea 例外）。

## 验证
- 纯样式修改：diff 逐行核验（仅 1 行改动，新增 1 条规则、删除 1 条规则），grep 确认 `focus-within` 在该模块内已无残留、新规则存在。
- 未跑业务链路：不涉及逻辑与数据；下次发布从 main 构建后可在首页/对话实测。

## 未完成项与下一步
- 合入 main；发布后实测首页与对话的输入框聚焦态。
- 如需保留键盘用户的焦点指示，后续可在外层卡片上以低显著度方式（如阴影）补回，待用户反馈。
