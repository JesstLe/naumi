# G59 任务中心顶部页签与布局修复

## 问题与边界

用户确认缺陷为“顶部页签或布局显示异常”。按原18482入口复现，不切换演示/正式工作空间，不导入或改写任务，不调整人员授权、业务状态或数据库；本轮没有连接或发布47。

基线任务中心直接复用全局 `.tabs/.tab`，页签高度26px、字体10px、距面板顶部1px，缺少独立头部间距；看板模式又把整个面板背景和边框移除。工作台概览的通用页签另有上下文，不作全局替换。

## 实现

- `demo.js`：任务中心使用独立 `task-center-panel/tabs/tab/toolbar/board` 结构；列表和看板保留白色面板头；原 `data-tab/data-task/data-action` 和过滤语义保持。
- `tasks.css`：44px页签点击区、13px实测顶部间距、13px桌面字号、计数pill、选中下划线；筛选栏对齐/换行，窄屏四页签完整显示，看板内容在自身容器内横向滚动。
- `tasks-ui.js`：正式员工页面复用相同的局部样式，不更改正式API、权限、分页或任务生命周期。
- `bindTaskScopeKeyboard`：任务页签增加tablist/tab/tabpanel、aria-selected和单一tab停靠点；支持左右方向键、Home/End，重绘后恢复对应按钮焦点。
- `preview.html`：通过现有bundle-spec/assemble完整重建，保留30个扩展模块，不以简化Demo覆盖完整产品。

## 集中验证

`scripts/verify-task-center-layout.mjs` 使用仓库既有独立无头浏览器工作流，不附着用户Chrome。20项检查覆盖面板间距、页签语义、待认领/待验收、类型筛选、搜索、详情、四列看板、键盘/焦点、任务与绩效事实不变、1614px桌面/390px手机无页面横向溢出、工作台原样式隔离、正式员工渲染器布局和键盘行为及页面JS错误0。

正式员工布局检查使用实际 `realTasksPage()` 与空内存状态，不模拟线上员工验收，不调用正式任务写接口。原本机服务不重启；服务逐请求读取重建后的preview.html。

基线exit2为缺陷成功复现，不把它写成测试通过；修改后浏览器exit0。release-check集中通过static/model36+32/source12/documents5/acceptance50。独立副本回滚恢复原始文件字节与26px/1px旧行为，改后工作区仍保留修复。

## 交付与待办

证据目录：`E:/Workspace/naumi/output/enterprise-task-center-fix-g59-20261019`。四件交付为 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`；实际命令、字面输出、退出码和哈希见VERIFICATION。

本轮仅交付G59本机UI缺陷修复，不将企业整体目标标为完成，不触发企业独立服务部署或历史事件处理。后续发布整合方应使用本轮新提交，而非仅合入旧cefd7748。功能迭代计数按G58已归零后本模块记1；提交前刷新origin/main，不改共享checkout。
