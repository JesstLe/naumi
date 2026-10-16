# 版号旁的公开更新说明

## 本地实现，未发布
- 独立 `codex/public-update-history-20261016`，基线/开工fetch `c2634fba41fd50a117f9af93e63d865e446f7394`。
- 原版号旁新增更新说明按钮，轻量浅色弹层中按版本展示优化/修复；支持中英文、空记录、加载失败重试、键盘关闭/焦点返回、移动端滚动。
- 专用公开JSON、公开API、严格字段/内容校验和人工复核维护流程；不读取内部Git/文档，不显示模型、供应商、后台改造或个人信息，版本UI删除源码提交号。
- 当前公开目录为空：此前比例修复、位置、百分比和BI任务尚未上线，不捏造为已发布历史。候选准备时按真实构建版号追加经审核文案；维护规范 `docs/PUBLIC_RELEASE_NOTES.md` 并加入AGENTS约定。
- 不改现有版号锚点位置，不变更画布/生图/Worker/BI/后台页面；共享checkout的未提交内容保持。本轮无服务器连接、无锁/候选/切流。

## 集中验收
- `node scripts/verify-public-release-notes.cjs BASELINE/MODIFIED <output>`：基线仅版号；修改后严格字段、常见隐私内容、版号上限、人工复核追加/旧版不可重复、公开API/拒绝错误不回显原文通过。
- `node scripts/maintain-public-release-notes.cjs check`：正式公开目录0条，检查通过；prebuild已接入内容检查，`check --version`是用户可见候选的人工发布门槛，未自动改部署控制器。
- 真实SiteVersion组件浏览器fixture通过：惰性拉取、展开/关闭、Escape、外部点击、焦点返回、失败重试、空记录、原版本检查/刷新入口、desktop路径、内部commit不显示；390px实测left16/right382，无横向溢出，console错误0。组件依赖/HTTP响应为隔离fixture，不等于线上交互验收。
- 完整TypeScript退出0；500/390px HTML预览无console错误，效果图已保存并打开；演示条目不进入正式公开目录。
- 输出证据/制品/副本回退：`E:/Workspace/naumi/output/public-update-history-20261016/VERIFICATION.txt`。

## 待完成
- 统一候选真实版号与公开说明文案的绑定，发布线程持三锁蓝绿与公网验收；不因该任务本地提交自动部署。
- 后续每次用户可见更新维护公开记录；仅内部维护跳过公开条目但保留内部交接。功能迭代计数1，无服务器发布计数变化。
