# R7L 主线增量按模块归属整合

## 基线与交付状态

- 工作树：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 本片起点 `b2078323007194fa5b30918d4f1334034ad976ac`；普通整合固定 `origin/main e9ef9ff6df213b239d77dbe6325489eeb226fc4f`，共同基线 `a5fe1c67`。主线新增 51 路径，包含当前图片编辑输入、参考上传保留、成员维护和用量功能；这些业务修复归原主线作者，不冒充本片新开发。
- R7K 的固定完整镜像、core120、runtime177、产品浏览器37和媒体52检查已封存于 `output/refactor-r7k-20261029/DELIVERY.json`。本片是新的源码层，不把 R7K 镜像或结果改标为本片版本。
- 整体重构 ACTIVE，未合回 main、未部署，47 HOLD。分支已超过48小时，仍保留的原因是用户明确要求独立目录持续整体重构及最终整版交付；不把局部验收或同步主线当成整体交付。

## 职责、依赖与冲突迁移

两处真实冲突分别为 Canvas 页面和 BI repository，均按已有 owner 接入，不恢复旧单体实现。

### 图片引用与创作栏

- 当前图片与连线图片仍由 `input-references.ts` 收集；主线修复将当前图片作为普通原位编辑的默认目标。结果仍由原 image-version/task owner 写回，同一节点、原几何、原 operation 与报价合同不变。
- 参考 Files 和预览 URL 归 `use-image-reference-draft.ts` / `image-reference-drafts.ts`；编号、角色墓碑与显式隐藏归原节点草稿。actor、owner、workspace、project、node 隔离和卸载释放保留，不新增业务状态表或第二套任务系统。
- “恢复节点参考”通过窄 props 接入既有 `CanvasImageComposer`；页面只组装状态与动作，不把主线的整块内联 JSX 合回 Canvas，也不恢复旧选择状态和已迁出的请求函数。
- 原来的主线 verifier 抽取内联 `runGen`，已与重构职责不符。本片改为执行实际 Canvas 主动作适配器 → `executeCanvasImageCreation` → `prepareCanvasImageTask`，只替换图片字节读取和传输端口；所有当前图、连线图、上传图、编号、显式角色和落点断言保留。

### BI、成员与基础设施

- `bi/repository.ts` 保留查询职责；主线新增的企业目录关联依赖由 `bi/schema.ts` 调用 `enterprise/schema.ts`，继续使用已有按 pool 的 readiness，不恢复 repository 内 DDL、全局 ready 或导入 enterprise/server 的整包编排。
- 新增 `bi/usage-repository.ts` 直接依赖 `platform/db/pool` 和本模块 schema，不通过旧 `db.ts` 兼容 facade 或另一业务 repository 获取基础设施。
- 新增成员维护直接依赖 `billing/runtime` 和 `teams/errors`；企业事务、当前权限、角色 CAS、账本仍由原 owner 负责。主线的成员口令、积分、原生花名、历史归属与只读统计语义保持。
- 成员回归的历史 schema 比较改成内存执行原 `git show` 字节，不再把临时旧实现写进 `src/lib/bi`。这是验证资产归属修正，不是改写旧业务断言。

## 集中验证

`output/refactor-r7l-20261029/run-focused.mjs` 一次串行执行19组：全部 exit0，开始/结束源摘要一致。记录在 `FOCUSED_RESULTS.json` 与 `FOCUSED_SUMMARY.json`。

- 基线复现：当前A图被遗漏，连接时只提交B，无连接没有图片，取消选中清空上传；baseline exit0 表示准确复现旧问题，不是业务正常。
- 修改后40检查：A为编辑目标；A+B、A+B+上传U字节顺序；旧编号不重排、显式角色/删除保留；actor/workspace/node隔离、URL释放及版本目标保持。
- 实际React StrictMode/原hook/引用组件/客户端上传与plan适配器/服务器schema和prompt：14组通过；实测A/B/U像素、关闭/A→B→A/重复/失败保留、只读/旧回调/卸载释放、390px与页面异常0。
- 真实PG：用量SQL13检查，成员维护及历史19检查；原生花名、权限负例、密码撤权、并发单次扣款、透支回滚、历史精确定位和企业范围保留。
- 相邻原位生成、版本适配9、PG版本与真实生成pipeline、保存边界、平台池28组166检查、启动3组36检查、原main owner20检查通过。
- 用量实际React组件8组通过（不是完整Next/PG浏览器），完整tsc和lint exit0，lint39 warning原样保留；四类SCC均0，现有两个fixture lib→app与billing client→toast依赖仍在。
- 新增4个真实入口登记回原核心catalog（总数124），不另建框架。124入口库存不代表已全跑；本片不重复刚完成的R7K core120或完整镜像验收。

## 完整页面验收与环境证据

完整 Next Canvas 在权威源码的逐文件字节副本中运行，Next生成的配置/缓存不回写原工作树。首次 C盘源码＋E盘node_modules junction 的启动暴露 Geist 字体相对路径解析失败；字体真实文件存在，页面尚未加载，无生成/扣款。原 `NATIVE.log`、runtime和failure证据完整保留，不记成产品通过。

原依赖已复制进独占C盘fixture，完整Next页面正常加载；当前图/上传/切换/重复/失败与显式删除恢复六组原生检查通过，随后undo/redo暴露旧HTTP fixture只返回ok/persisted、不返回当前服务端已有的canonical artworkNodes，导致文档保持原revision而第二次动作不发出。fixture已按真实history合同补完整node/version/revision回执与operation幂等，仍要求两次真实undo/redo POST、同几何/同连线，不改产品history或放宽断言。两次原失败日志均保留。补正后完整页面8组原生验收全部通过：实测A/B/U输入像素、关闭/切换/重复/失败保留、显式移除与恢复、原版本undo/redo、同几何与连线、390px和页面异常0。权威2072个src/services文件在前后及隔离副本中逐字节相同；清理与完整字面结果统一见本片 `DELIVERY.json` / `VERIFICATION.txt`，不以此文预报结果，不改字体/节点/产品逻辑来跑绿。

### 截图人工复核保留的移动端问题

完整页面原生用例的390px断言只覆盖composer存在及document无横向溢出，不等于整屏操作可达。实际打开desktop/mobile截图后确认：PC引用/撤销链完整；390px图片创作栏的footer控件出现竖排与裁切，生成动作可达性尚未验收。此布局项保持OPEN，下一切片处理共享composer响应式布局，不能用8组PASS抹去视觉问题。

## 产物与未完成项

完整源码包、字节补丁、5045基线hash的独立副本回滚、后来编辑拦截与恢复后旧行为，以及固定merge SHA/远端核验，以本片四产物和 `DELIVERY.json` 为准；工作区保留整合后源码。

Canvas仍约5486行；剩余视图/命令编排、变化传播、同机同数据同构建的INP/混合容量、有效远端CI、最终main整版交付继续。`MEDIA_STATE_WRITE_FAILED`历史根因仍OPEN。没有服务器发布、业务重放或100k容量结论。
