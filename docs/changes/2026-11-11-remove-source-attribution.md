# 移除视频模块来源标注（2026-11-11）

## 模块与职责

画布视频设置弹窗、视频工作台、视频供应商协议层、视频文案/i18n。本次为纯文案与注释清理，不改变任何执行行为、数据或接口。

## 公共接口、依赖方向

- 删除公共组件 `VideoSourceAttribution`（`src/components/canvas/video/source-attribution.tsx`），它仅被视频设置弹窗和视频工作台两处引用，无其他调用方；依赖方向无变化。

## 本次实现

- 删除 UI 中的"来源标注"折叠块（指向两个外部参考项目的许可标注链接）：
  - 删除组件文件 `source-attribution.tsx`；
  - `settings-dialog.tsx` 移除 import 与 footer 使用点，footer 按钮改为右对齐单行；
  - `video-studio-session.tsx` 移除 import 与表单底部使用点；
  - `src/lib/i18n/video.ts` 删除来源标注对应的 i18n 词条（英文译文 `Open source`）。
- 删除/改写代码中的来源注释（`src/lib/video/`）：
  - `camera-presets.ts` 删除头部来源标注；
  - `production-prompt.ts` 头部注释改写为仅保留 Naumi 行为约定；
  - `ark/gemini/kie/tokendance/compshare/tfrouter` 删除来源标注行；
  - `apimart/autodl/openai-compatible` 保留纯行为说明（拒绝超限、InputRules 不静默收拢、三种独立 wire 形态），移除来源引用。
- 保留项（非来源标注）：`source-dialogs.tsx` 的参考供应商网关功能性地址；`templates-data.ts` 为模板库授权说明，均与本标注无关。
- 文档清理由同日后续任务承接，见 [来源标注相关文档清理](2026-11-11-remove-attribution-docs.md)。

## 验证命令、结果及证据层级

- 全量 grep：`src/` 下来源标识（项目名/仓库路径/固定提交哈希/许可名/组件名/词条）均为 0 命中（仅剩功能性网关地址 1 处，属保留项）。
- esbuild transform 校验全部 14 个改动文件：`SYNTAX_OK_ALL_FILES=14`（语法级，非全量类型检查；worktree 未装依赖，发布前 next build 仍会做全量校验）。
- 证据层级：本地静态校验通过；未跑浏览器端到端（纯文案/注释删除，无行为面）。

## 未完成项与下一步

- 提示：若相关代码确为外部许可证衍生，对外分发/开放网络访问时按许可证需保留来源与许可声明。是否保留由后续决策。
- 文档清理已于同日后续任务执行，见 [来源标注相关文档清理](2026-11-11-remove-attribution-docs.md)。
