# 协作分页验收：等待首屏状态实际生效

## 背景与范围

PR #11 的 d883a363 复审已确认原五项修复，另有一条轻微建议：`response.finished()` 与双 requestAnimationFrame 不能证明 loadMembers 已将响应写入客户端状态，bootstrap 本来就可能显示100人。

本轮只修改验证脚本，不修改 CollaborationClient、序列保护、UI 或任何业务逻辑，不扩大后端/生产验收结论。CodeRabbit 的源码核对不等于它独立重跑了本地测试，也不等于正式 CI 通过。

## 实现

- 打开成员面板前保存实际 client 的 bootstrap members 数组引用。
- 保留正确账号、无 cursor/q 首屏响应的200与完成检查。
- 用状态谓词等待 members 引用已替换、长度100、查询为空、分页cursor为fixture的100。bootstrap 的原数组本身不能满足这个谓词。
- 删除测试观察引用，再执行全部原100→101、搜索、私聊和会话分页断言；增加一项明确的首屏状态生效检查。不使用sleep、帧数或放宽timeout代替状态证明。
- 原 loadMembers 的 sequence guard 完整保留，验证脚本没有拦截或改写其执行。

## 验证与状态

基线来源为此前实际执行的 d883同字节脚本：29项、exit0、SHA256 `9c839da95a190d9812a4717c4d581e8a3f2dd7ed688878f9ac3e36c344fc4b38`。本次复用该真实记录，未声称旧版本地必然失败。

修改版实际完整脚本30项通过、exit0、stderr为空；新增状态生效检查与原29项均执行。结果与原始输出保存在 `output/collaboration-state-barrier-20261105/`。四产物和独立副本rollback由本轮root封装；正式新head CI仍须另验。本轮不合main、不部署，不将该验收同步变更描述为真实早点击产品行为修复。
