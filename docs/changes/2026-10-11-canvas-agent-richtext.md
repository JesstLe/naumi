# 画布小球明暗适配与 Agent 富文本输出

## 调研与实现

- 用户参考：[lobe-editor](https://github.com/lobehub/lobe-editor)。2026-10-11读取官方 README、package.json及npm元数据：最新 @lobehub/editor 4.29.2 的 peer 要求 React/ReactDOM 19、Antd 6、Lobe UI 5；仓库为 Next 14 / React 18。它主要是 Lexical 编辑/输入组件。本轮是只读回复展示，采用兼容React18的 react-markdown 10.1.0、remark-gfm 4.0.1、rehype-highlight 7.0.2，不强行迁移框架或引入另一套设计系统。
- 独立 AssistantRichText 展示现有 Markdown：标题、粗斜体、删除线、段落、嵌套列表、任务列表、引用、分隔线、链接、表格和代码高亮；代码独立复制，表格/长代码局部横向滚动，不撑宽侧栏。明暗配色复用画布状态，用户消息仍为纯文本，整条复制仍保留原始Markdown。
- 流式未闭合代码块正常展示；旧 [[GEN]] 按钮保留，代码/内联代码/HTML中的字面标记不变成执行按钮，未闭合动作块暂不展示。渲染和历史恢复都不执行操作，真实生成仍经过原有按钮路径/报价/计费。
- 不执行原始HTML，过滤危险/协议相对URL。Markdown图片仅加载本站媒体路径，外部图片不自动请求；真正的产物卡片沿用现有路径。
- 小球从 lightCanvas 获取明暗：浅色石墨球/柔白眼，深色珍珠球/深色眼；状态标签和阴影同步。切主题不重挂位置组件、不清除账号位置、不改变真实Agent状态；SVG引擎沿用已有清理重建逻辑。
- 不改后端调度、SSE事件、数据库Schema、历史格式、供应配置、报价或积分逻辑。

## 验收与发布进度

- 开工基线：origin/main 9a7728a5c743e9eb8ac54b7e3469824dac67d01a；独立分支 codex/canvas-agent-richtext，复用本任务 clean worktree。新机实查运行5e4851fac70e9260a0cec800e101dc6a7c51ca68；磁盘79%/20GiB。
- 基线 CANVAS_AGENT_ORB=PASS checks=114；NAUMI_ORB=PASS checks=102。
- 富文本/主题契约247项（含186个逐字前缀）、原小球114/102项与TypeScript通过。隔离真实组件浏览器通过标题/列表/任务/引用/表格/代码高亮、复制反馈、逐字渲染、明暗切换，390px视口下表格352px在308px容器内横向滚动，360px侧栏没有溢出。切主题SVG仍只有1个、真实状态保持；代码复制返回成功且显示已复制，IAB剪贴板读取为空，未把跨接口读回记为通过。
- 新增富文本键盘可聚焦链接/表格/代码，窄屏原有焦点循环同步纳入这些元素。现有依赖版本全部保持，仅增加锁定的渲染依赖。
- Linux正式构建和新机发布验收待执行；最终结果与发布证据在此补齐。
- 发布仅120.27.162.85，全程deploy.lock与固定镜像回滚；旧机不连接/回传。视频/OSS和实体手机触摸实测不计入本轮完成项。

## 后续接手提示词

```text
复用 AssistantRichText 展示原始Markdown，不改SSE/历史/Agent工具与计费。
小球light取自lightCanvas，明暗切换不重置位置或真实任务状态。
新增格式先检查流式未闭合输入、URL/HTML处理和窄侧栏溢出。
发布刷新main与运行基线，持deploy.lock到浏览器/实际版本核验，禁止旧机回传。
```
