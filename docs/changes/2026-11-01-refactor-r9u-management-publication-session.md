# R9U：后台模型发布与原回执恢复 owner

## 职责、接口与迁移

- `management-session.ts` 拥有当前管理视图的 scope、快照观察序号、原 publication receipt 和在途提交。`mount/load/publish/operation/refreshProvider` 是小接口；服务端鉴权、CAS、配置和编辑器草稿不归它所有。
- `management-provider-directory.ts` 拥有只读目录请求、同 provider 去重、原 1000ms/30 次缓存观察和取消。成功安装新的权威快照会退休旧目录观察，目录读取不使用发布锁。
- `management-session-contract.ts` 拥有浏览器 DTO、请求归属及窄端口类型。依赖方向是 React adapter → 应用 owner → 纯合同/目录子模块，应用 owner 不导入 React、window/sessionStorage、Route 或数据库。
- 原 `use-model-management` 只绑定 React 投影、实际 API、原 UUID、旧 storage key 和 catalog refresh 事件，不再管理异步状态机。旧 `use-provider-directory` 已无消费者，删除而非保留空兼容壳。
- 原页面、编辑器、RSA、服务端发布、模型配置、价格、钱包及供应商实现不修改。没有新增业务限额、确认或第二个配置 store。

## 先复现，再迁移

完整基线 `769412cbc94dadfc46173fa60046a05e2178bbb7`，5371 个原始文件及完整归档已冻结。

新增实际 hook/client + React19/Chromium/loopback 场景25项，原版13PASS/12FAIL，修改版25/25PASS。十二个失败包括：

1. submit/read/discover 三条鉴权 await 在视图卸载后仍发请求。
2. GET 和只读 discovery 的慢 response body 在卸载后没有释放。
3. 旧目录结果覆盖更新的权威管理快照。
4. 已完成旧操作无条件删除另一 owner 后写入的持久回执。
5. 等待鉴权期间，调用方更改对象导致 wire 与保存的 pending body 不同。
6. 已知有未核对原操作时，另一个调用替换了原回执。
7. 三种损坏的本地存储记录被当作有效 pending，形成无效锁定。

这些是实际浏览器/夹具复现，不写成线上事故归因或服务端越权证明。

## 发布与未知状态不变量

- 在任何异步鉴权之前固定完整请求体，保持原 id、expectedVersion、expectedBillingVersion 和字段；恢复不按 current 重报价或换编号。
- API adapter 在 auth await 之后、fetch 之前检查原视图归属。只读请求带 AbortSignal；发布请求一旦派发就继续读完，不因卸载而取消、重发或推断未受理。
- unknown、503 和网络错误继续保存原 receipt，只由显式“核对并继续”沿原 body 恢复。明确 not-staged/failed 仍按原合同清理；编辑器回调含义保持。
- 清理 sessionStorage 前比较该操作保存的完整字节，另一 owner 的后写回执不被清除。存储不可用时沿原内存回执恢复。
- 有效旧 pending key/body 原样兼容；损坏值不成为有效发布身份，也不会自动发 POST。

## 集中验证

- 新生命周期模块：基线25项13PASS/12FAIL；修改版25PASS。
- 原完整 ModelManagement/UI 脚本：冻结基线33项PASS，修改版35项PASS；增加的2项是基线报告对照，18组真实React HTML、20条原客户端POST投影精确一致。这里不是把R6H历史53项数字重标为本轮执行。
- 原 static：14项PASS，范围仅为真实目标编译与纯编辑器转换，不冒充浏览器或PG。
- 两个旧结构脚本首先实际失败于“api正文必须与历史源码完全相同”；现跟随实际导入并调用的 session owner，对明确迁移的 api/operation 使用上述真实客户端/完整body/生命周期验收，其他17个编辑器/helper正文、通道排序、过滤和payload断言继续保持。失败日志不覆盖。
- 新 actual-hook 脚本加入原统一 core，目录220→221，独立证据目录由原 runner 注入；新增目录不代表完整221已经执行。

全项目非增量tsc exit0，5101个实际编译器输入与4个配置绑定；本模块6个TypeScript文件lint exit0。四类SCC均0，新owner无UI/Route/scripts反向依赖，原免重复确认37项继续PASS。

完整源码桥接、四产物和独立副本回滚的精确命令/输出/退出码，以 `output/refactor-r9u-20261101/VERIFICATION.txt` / `DELIVERY.json` 为准。

## 未完成与下一步

F03 本轮发布/回执/目录生命周期已迁移；F01/F02此前迁移不重复。当前完整CI、最终main整合和整体20要求/9类故障×5维审计仍分别验收，实际付费断线、首次结果持久化、客户账务quota和远端对象PUT故障不由本轮fixture替代。整体ACTIVE，main未合、本轮部署0、47HOLD。候选分支超过48小时未合main，原因仍为整体退出与有效同源CI/main门槛未闭合。
