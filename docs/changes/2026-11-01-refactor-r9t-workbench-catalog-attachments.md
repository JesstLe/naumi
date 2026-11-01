# R9T：工作台会话目录与附件生命周期

## 职责与接口

`workbench-session` 继续作为首页唯一会话聚合，组装 `workbench-session-catalog` 和 `workbench-attachments`。两个子模块只依赖同一账号所有权窄接口及纯合同，不反向依赖 React 或会话实现，也不新增另一套任务系统、React store 或列表副本。

- 目录模块拥有 list observation 的 revision/abort、refresh/rename/remove。列表本身仍由 React 投影；修改成功使旧观察失效。
- 附件模块拥有上传批次、取消、busy 和 URL→作品索引。`upload/append/resolveArtworkId/reset/resetIndex` 是明确的职责接口；门户要求全部参考成功，聊天保留部分成功。
- 索引与上传使用不同 revision：ready 波动可以失效作品查询，不会取消同账号有效上传或已受理 SSE。
- `workbench-contract` 拥有消息、账号、会话摘要和 transport 类型；原消息类型与 `SessionSummary` 出口保留给真实调用方。
- 页面保留布局、草稿和投影，只绑定 transport 与原事件，不再持有列表 AbortController、上传集合或作品索引。原渲染分支原始字节完全相同。

没有变更报价、钱包、供应商、数据库、后端任务身份或接口，没有自动重放付费 POST。HTTP 仍使用原始 email，大小写比较没有改变请求身份。

## 旧行为复现

完整基线 `0e3c9383b19b86385e66f790747dae4793e20d03`，5367 个原始文件和归档已冻结。原有 34 个 mutation/upload 用例全部保持，增加 9 个实际组件场景。

原版实际 React19/Chromium：43 场景，37 PASS / 6 FAIL，具体复现：

1. 已解析但延后返回的旧列表覆盖成功重命名。
2. 同样的旧列表重新显示已成功删除的行。
3. 切账号后作品反查返回旧 ID、回填新索引。
4. 鉴权 await 后仍发出原账号作品查询。
5. JSON await 期间账号 A→B→A 后仍回填旧 ID。
6. 同账号索引失效后旧反查仍重填缓存。

首次 baseline 的两个列表场景因 fixture 把省略 method 的 GET 与显式 GET 比较而未到达暂停点，日志保留。修正 GET 默认值后重新运行完整 43 场景，六项均到达具体业务断言失败；没有用超时冒充产品复现。

## 实现后的集中验证

- 原恢复/SSE 模块：基线 47/47 PASS，修改版 47/47 PASS。
- 列表/附件模块：修改版 43/43 PASS，含原 34 项及新增 9 项；六个原反例全部关闭。
- 保持真实 Chromium、React19、loopback HTTP 和原定时器；旧列表 continuation、跨账号/ABA、auth/body await、ready、卸载、并发上传、旧 finally、新会话、门户草稿和原 SSE/save 均有检查。
- 成功批次的投影 guard 不依赖已结束的 active-set 成员资格；busy updater 在 React 执行时读取当前批次数，旧批次不能清掉新批次 busy。
- CDN/编码路径别名和原始混合大小写账号保持；聊天一张失败后继续另一张，门户有任一失败则保留草稿、不发送。

全项目非增量 tsc exit0，实际5099个编译器输入加4个配置绑定；6个本模块 TypeScript 文件 lint exit0；依赖分析的四类SCC均0，新增子模块没有指向React/UI/Route/scripts的反向依赖。原免重复确认扫描37项保持PASS。

实际命令、字面输出、退出码、完整源码绑定、四产物及独立副本回滚归 `output/refactor-r9t-20261101/VERIFICATION.txt` / `DELIVERY.json`，未完成的验证不以此处预告代替结果。

证据层级：实际组件与浏览器，auth/backend/无关 UI 为 fixture；不是线上验收、真实供应商交付或同一真实付费断线 E2E。

## 未完成与下一步

F01 的会话目录/附件生命周期已迁移并通过本轮 90 个浏览器场景。F03 后台 publication 恢复、当前完整 CI、最终 main 整合及整体退出清单仍分别待闭合。整体 ACTIVE；本轮不部署，47 HOLD。候选分支超过48小时未合 main，原因仍为有效同源 CI、整体退出和 main 门槛尚未全部闭合，局部通过不代替整体完成。
