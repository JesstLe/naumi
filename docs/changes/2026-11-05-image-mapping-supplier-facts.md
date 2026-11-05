# P1-b 统一参数映射：供应商资料可见、停用通道不再卡住保存（2026-11-05）

依据：[管理后台评估](../design/admin-architecture-review-20261105.md) U2—U4、[约定优先方案](../design/image-parameter-conventional-contract-20261105.md) 3.4。基线 main `c814a023`。

## 解决的问题

- **最初目的没有体现在界面上**：供应商支持哪些值原来藏在折叠区最后一行，显示的还是前端档位。现在每个通道顶部直接列出"供应商资料：质量 … · 分辨率 …（来源，核对日期）"，使用的是资料库里供应商的真实取值（`metadataDefaults.nativeValues`）。
- **103 上 GPT-Image-2.5 映射无法保存**：弹窗把没配过分辨率策略的通道（已停用的 Geeknow）强制显示成"映射"模式且全部为空，结果整行都无法保存。
  - 现在这类通道显示为"沿用协议（不覆盖）"，保存时提交 `resolution: null`，服务端随之删除分辨率覆盖。
  - APIMart 契约要求必须有分辨率策略，这类通道不提供这个选项。

## 本次实现

- 输入框通过 datalist 提供资料里的取值作为候选，仍然可以自由填写。
- 填写的值不在资料中，或者开了开关、留空且该档不在资料中时，格子标黄并给出简短说明。**只提示，不阻止保存。**
- "按资料填充空格"按钮：用资料库已经算好的建议映射（例如 4K→2k）填入空格，点保存才生效。
- 通道标题旁显示汇总，例如"6 格已映射 · 3 格按默认 · 1 处提示"。
- 已停用的通道默认折叠到"已停用通道（n）"；如果其中有通道未填完整或预览报错，则自动展开。
- 服务端：`parameterSources` 增加 `enabled` 字段；映射编辑器的 `resolution` 允许为 `null`。

## 验证（零外网、零供应商调用）

- 新增 `npm run verify:image-mapping-ui`：按 103 上 GPT-Image-2.5 的结构构造数据，用真实 ModelEditor 在 1440 和 390 两种宽度下验证：
  - 停用通道不再卡住保存；
  - 停用通道默认折叠，并显示为"沿用协议"；
  - 供应商资料和日期可见，候选值正确；
  - 填写 8k 时标黄但仍可保存；
  - 停用通道开开关后按资料填充 4K→2k；
  - 提交内容正确；不做修改直接保存时停用通道仍为 `null`；
  - 无横向溢出、无页面报错、无网络请求。
- `verify:image-parameter-contract`：35 项（新增"沿用协议"删除覆盖并通过发布校验）。
- 回归通过：`verify:image-parameter-contract-ui`、`verify-image-parameter-plan-ui`、`verify-model-management`、`verify-image-parameter-plan-pg`、`verify-model-management-ui`（整页浏览器），以及 tsc、eslint。
- 证据层级：真实组件在本机浏览器中验证，加隔离数据库回归；**未发布**。

## 未完成

- 4 个参数入口（统一参数映射、参数设置、分辨率设置、图像高级参数）尚未合并为一个。
- 尚未改成"行 = 前端档位、列 = 通道"的矩阵布局。
- 上游拒收后在格子上标红（方案 3.5）尚未实现。

## 交接

```text
模块与职责：后台统一参数映射弹窗（components/admin/model-management/image-mapping-editor.tsx）与映射保存（lib/model-config/image-mapping-editor.ts）。
公共接口、依赖方向、数据/状态/事务归属：ImageMappingEditorInput.routes[].resolution 可为 null（删除覆盖）；parameterSources[].enabled；供应商资料只读、只作提示。
本次实现与迁移状态：见上；4 个入口的合并与矩阵布局进入下一轮。
验证命令、结果及证据层级：见上。
未完成项与下一步：P1-c 最终生效价显示；随后合并参数入口。
```
