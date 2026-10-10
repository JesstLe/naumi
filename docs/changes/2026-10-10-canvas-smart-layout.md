# 复杂画布整理

## 范围与 Git

- 分支 `codex/canvas-smart-layout`，开工基线 `6446fab68aaccc6cccdfa8217bbaebed95d27ac9`。
- 只修改整理操作和独立布局模块，不调整生成、模型、积分、节点内容、媒体或血缘。
- 用户明确分支交付，由其他 agent 集中合并发布；本轮不合入 main、不连接服务器、不发布。

## 实现

用户参考图是多产品创作链、多个参考输入、长文字节点的混合画布。本轮按同等级拓扑构建30节点、60连线的隔离样例，不把重建样例冒充用户原始画布。

1. `src/lib/canvas/smart-layout.ts`：纯函数、确定性布局，所有可见图文和全部实际连线参与。
2. 迭代强连通分量合并历史循环，DAG最长路径分层；不递归、不删除循环/悬空连线的业务数据。
3. 双向重心排序降低分支交叉，保序等距投影按每个节点实际宽高避让，再松弛父子中心对齐。
4. 连通创作链各自形成排版面板；已有手工组保持同面板，不伪造新的生成血缘。比较多个装箱宽度，平衡全图长宽比与留白。
5. 锁定、临时、运行中占位节点原地不动；有固定参考的创作链先就近排版，其他链整块避让，避免固定参考跨越多个产品区拉长连线。既有两个锁定节点的重叠不强行解除。
6. `tidyLayout()` 从React Flow实时坐标/尺寸/连线规划图文位置，保存采用现有 `/api/canvas/history` 事务。保存成功才应用界面状态并入一个 `move-many` 撤销步骤；失败保留原状态。
7. 等待文字保存队列，未保存内容存在时停止整理；属性/文字载入未完成时禁用按钮。保存中沿用现有遮罩，防止重复操作。
8. 一次移动上限沿用历史事务的400条限制，超过时给出错误而不是分批产生不完整撤销。
9. 不改变初次载入的旧 `layoutGraph()` 默认行为，整理升级限定在显式点击操作。
10. 保存后等待React Flow实时位置与目标一致再fitView，修复原来提前适配旧位置导致整理后的节点跑到屏幕外。

## 已验证/待验证

- 布局单测已通过：原重叠428px复现；改后混排零矩形重叠、稳定重复、锁定位置保持、循环、悬空边、手工组、20个随机80节点图及400节点压力样例。
- AST比对保护160个非整理函数逐字一致，旧节点编辑与底部工具栏契约测试通过。
- TypeScript与相关文件ESLint已通过。
- 实际本地Next.js + 隔离PostgreSQL + Edge Chromium浏览器验收通过：30节点、60连线；图文零矩形重叠、自动适应视图不裁切、重复稳定、一键撤销/重做、刷新位置恢复、模拟保存失败不改UI/数据库/撤销栈、真实数据库事务中途失败整体回滚、390px无横向溢出；模型调用0。
- 完整生产构建92页exit0；既有annotate-editor的img lint警告与Windows共享node_modules junction产生的standalone复制EPERM警告仍存在。本地编译通过不作为可部署Docker镜像证据。
- 旧节点编辑静态验收从检查已废弃的`laid.filter`改为检查新布局的锁定/临时节点fixed条件；实际浏览器另外验证固定坐标未变。
- 未在用户实际画布上点击整理，未上线；不宣称任意图的连线都零交叉。极端多输入或固定锚点可能有交叉/较长连线；同尺寸大量并列分支仍需要纵向空间。
- 验收证据：`E:\Workspace\naumi\output\canvas-smart-layout-20261010`；交接包`MODIFIED_FILE.tar.gz`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。回滚脚本只恢复本轮修改文件，须传入目标checkout目录；优先在副本上演练，不回滚其他agent的发布或新改动。

## 接手命令

```powershell
git fetch origin
git switch codex/canvas-smart-layout
node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-smart-layout.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-smart-layout-browser.ts
node node_modules/typescript/bin/tsc --noEmit
```

浏览器脚本需要Docker与本地Edge/Chrome，创建随机临时数据库与独立Next缓存；finally清理自己的容器、应用进程和浏览器。测试不连接新旧服务器、不调用供应商。合并前刷新origin/main，只整合此任务提交；线上受影响功能验收需由发布agent另做。
