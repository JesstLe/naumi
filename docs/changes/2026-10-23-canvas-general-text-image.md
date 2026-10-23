# 文字节点通用生图（2026-10-23）

## 用户目标与基线
- 用户确认无限画布应服务通用创作，本轮只优化文字节点“生成图片”入口。
- 撤销即梦借鉴已保留；不重新引入大纲、创意预设、布局模块或其样式。
- 独立分支 `codex/canvas-general-text-to-image-20261023`，当前工作区由回退提交 `dafe5c19` 普通合并 `origin/main=9ae4edff`，模块基线 `179355d25800a3de3718d303959c4c57d30cf742`。
- 不修改共享依赖、后台优化、模型执行/计费/收据比较语义，不在本任务连接服务器或发布。

## 现有问题（源码核对）
原 `generateImagesFromTextNodes` 强制每个文字节点绑定首张产品图，正文还会剥除开头 @ 行；模式窗口只提供“仅产品图/复刻竞品构图”。这使入口偏商品场景，未绑定产品图的普通创作被阻断。

## 本轮实现边界（进行中）
- 通用模式：文字可单独创作，正文为空时使用节点草稿/原始prompt，任何内容不注入电商语义。
- 图片参考可选，采用当前项目已选/连入的实际图片；文字与上游文字合并，去重与环保护。
- 多文字支持合并创作或逐条创作；每个请求沿用当前图片模型、数量、画幅、清晰度和原报价执行链。
- 商品模式保留为可选，原产品第一和竞品构图约束保留。
- 启动前验证输入，超出引用数/提示词长度明确提示，不截断或静默丢引用。
- 复用现有 `generatePend`、任务收据、结果回挂与连线；不新建执行器。

## 验证与交付状态
待模块稳定后集中执行：纯helper、实际Canvas回调AST、既有生图Canvas/历史回归、TypeScript、真实本地UI；原始字节备份与独立副本回滚。
本地UI证据与模拟HTTP/AST契约分开记录，不把未调用供应商的测试记为真实生图验收。

## 纯文字首图项目归属补充
- 实际链路发现旧Canvas FormData的projectGroupId不会经imagegen adapter自动传入child；仅改UI会使首张图脱离文字项目。
- 文字入口无图片时明确以原文字ID作为sourceNodeId；core按精确owner+text ID读取所属项目，并与冻结parentContext核对，只补child的项目位置元数据，不改prompt/模型/报价/供应商调用。
- tree项目沿用groupId；既有batch套图项目沿用owned套图根血缘，不把该图作为参考输入。
- 对没有output proof的personal文字项目，在preview/accept前仅依据owned text存在固定project scope；receipt读取不创建绑定、未知tenant项目仍拒绝，原scope严格比较不放宽。
- 提示词上限服从现有imagegen schema 6000字；超限保留输入并提示精简/逐条创作。

## 最终本地验收
- 纯输入helper：67组命名用例通过，0供应商调用。
- 实际Canvas回调AST集成：101项 / 403断言通过；旧基线3项 / 11断言复现无产品阻断，真实generatePend边界被截获，不是付费出图验收。
- scope：8项真实本机PostgreSQL临时表验证通过；缺proof personal文字项目在preview固定parent，receipt不写新绑定，tenant和跨owner拒绝。
- 原画布生图回归：138 cases / 1208 assertions；scoped history：11 cases，均通过。
- 完整Next 15构建退出0（Windows standalone symlink告警按本地运行边界记录，不代表Linux发布包）；最终6份源码与E盘构建副本SHA256完全一致。
- 真实本地UI：纯文字入口、参考图开关、多文字合并/逐条、混选文本+图片入口、商品模式折叠、Escape关闭和焦点恢复均实际操作通过；没有点击付费生成按钮。
- 专用本地示例账号新增1张代码合成本地山景图、2段文字用于可视验证；不是模型生成样例，未导入生产用户素材。
- 原始4文件raw SHA保存；独立rollback-copy恢复4份原文件、移除6份新增文件，恢复后baseline3/11再次通过。工作区保持MODIFIED，回滚未对live运行。
- 截图和完整stdout/exit、MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh均在`output/canvas-general-text-image-20261023`。

## 交付状态
- 新版真实本地入口：http://127.0.0.1:57934/canvas（旧57932保留对照）。
- 本轮只提交独立任务分支，不合并main、不连接服务器、不持发布锁、不发布；供应商调用0。
- 功能迭代累计1/3；开工和提交前已刷新main，固定9ae4edff，不整合他人的后台未合入分支。
- 当前仅优化文字节点生成图片，不声称全画布所有商品专用入口均已通用化。
