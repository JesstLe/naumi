# 头像团队入口状态统一（2026-10-14）

## 用户需求与实际诊断
北方右上角头像菜单最下面团队入口误报未授权，需优化。
103只读核验：原App/Worker为b73fb2a，企业独立服务为b42a8cb；公网/api/team/access对北方200、allowed=true、enterprise=true，/api/enterprise200且本人老板身份正常。现有授权仍有限至2026-10-27，版本0，永久修复虽已合main仍未发布，不能显示永久。原App未提供/api/feature-access（404）、未提供企业API（公网由独立服务提供），浏览器旧头像菜单未展示企业入口。未复现用户文字原样显示的“未授权”；用户补充确认指的是头像菜单最下面团队入口。

## 实现
- 独立codex/enterprise-entry-status-20261014，基线520ba89ae57a4f98b76a555c125193a907732fba；共享labs checkout保持。
- /api/team/access返回统一状态、目的地、实际期限；企业管理者继承老板现有grant并经过既有enterpriseList/岗位/功能权限判断，不创建或扩大授权。
- 企业入口/旧团队入口分流；普通正式员工和实习生无管理岗位时显示未开放管理权限，而非把组织成员等同管理者。
- 两种头像菜单使用同一hook；取消重复请求enterprise和旧布尔值解析。loading/error/active/paused/revoked/expired/scheduled/ungranted/forbidden分开，错误不当未授权，旧请求序号隔离、注销/换号清空，30秒/焦点/权限变更刷新。
- 账户与安全设置增加授权状态卡、真实永久或截止、生效时间、刷新、正确管理入口。浅色、保留原页结构，无宣传口号。
- 日期按北京时间；NULL只有真实授权有效时才显示永久。
- 无生产账号/密码/积分/组织/期限写入，无供应商调用。

## 验收与发布
隔离DB基线复现老板缺status/href、总监allowed=false；新接口老板/总监正确enterprise，旧团队team、员工forbidden，永久NULL，暂停/撤销/预约/到期/功能关闭/企业关闭/无grant与私有缓存测试通过。TypeScript通过。页面验收与源码回滚证据持续补充。
103 Naumi/Hub锁仍由同事验收任务持有，用户此前要求等待，未夺锁、未切流、未改北方grant；此次头像修改不能只换企业API服务，原站/桌面对应UI也必须按连续发布路由覆盖并实际验收。后续持锁刷新实际容器、Nginx、远端已完成分支再组装发布，不盲跑10月13日旧候选脚本。
功能迭代本次1/3，开工fetch main不变；同事workbench47、canvas-video尚未合main，按任务验收状态整合，不以文档提交冒充完成。
