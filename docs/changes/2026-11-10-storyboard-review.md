# VV-05：时间码审片与明确单镜返工

基线：`c594c43c052a4fc3bee0aa911b12de420b23f78f`。独立分支：`codex/storyboard-review-20261110`。承接[持续目标](../prd/2026-11-10-canvas-video-execution.md)第三项；本次完成P1人工审片，P2视觉／语音辅助质量检查保持未完成。

## 模块与职责

- 方案拥有确切take的`annotations:[{id,start,end?,issue,note}]`。省略end表示时间点，填写end表示区间；秒数对应原候选实际解码媒体，不按节点计划时长猜测。
- 网页播放器定位原片，在区间结束暂停；可新增、编辑和删除批注，切候选不迁移旧意见。整体意见／待审／采用操作保留批注。编辑保留原批注顺序和编号。
- “准备返工”只展示／编辑修改范围；“仅重做此镜”明确提交整镜新候选。时间区间指导新候选创作，不承诺供应商只重绘区间像素。
- 任务／工作流继续拥有报价、受理、冻结、Worker、存储及结算。原采用、原稿、节点参数、其他镜头与粗剪不自动更新。新候选须另行明确采用。

## 公共接口、依赖方向与归属

1. `save_video_storyboard`和原方案HTTP服务共用完整document schema，在既有图事务／方案revision CAS内验证确切任务／作品和媒体时长；批注无新增表或迁移。重复批注编号、空意见、非有限时间、逆序／越界拒绝；跨账号／项目／空间沿既有权限。
2. 原`run_video_workflow`／`POST /api/canvas/video-workflows`扩展`storyboard.review:{nodeId,taskId,artworkId,annotationIds,instructions}`。必须引用该revision已保存批注，nodes只能含这一镜、不可复用、不可assembly。服务器读取并冻结批注到`plan.reviewOrigin`，将明确范围追加到本次prompt，节点原配置不改。
3. 原工作流plan保存来源快照，通过`nodes[].taskId`关联真实产物；后续修改／删除原批注不改已受理run。原编号原参数重放返回原run，不重复生成或收费；新编号过期revision拒绝。通用工作流入口拒绝自报reviewOrigin，来源只能由正式方案编译。
4. 原工作流读取接口增加可选`reviewPlanId/reviewNodeId`过滤，在截取最近50条之前过滤，显示“最近返工”。选中候选通过其真实workflow来源读取冻结证据，不依赖最近50条猜测。原片任务可按确切身份取回。没有建立第二套返工状态机。
5. 公开task视图增加真实`nodeId`，`sourceId`仍保留真实工作流ID；候选不能把workflow ID误当node ID，从而错误隐藏本节点新候选。独立分叉仍只显示冻结继承的精确产物，不开放祖先的未来结果。
6. 抽出叶子`video-node-id.ts`以供节点schema和审片schema共用，避免节点→工作流schema→审片→节点的运行时循环；原节点schema继续兼容导出ID契约。

## 网页与跨入口恢复

- 复用方案草稿／autosave／原保存回执；401／403和网络未知保留原完整pending操作，重开后“核对保存”继续原请求。409／422明确拒绝后保留草稿供核对。
- 返工通过原`useStoryboardWorkflow`提交，保存原业务编号和完整意图，报价／执行共用相同review上下文，未知受理不换编号。
- 网页浅色布局，无强制制作向导。返工关联服务暂不可用时仍加载候选，人工批注与播放定位可独立使用；错误明确显示而不伪装没有候选。
- Agent注册schema、正式工具说明、生产提示、CLI skill与实际MCP初始化指引同步。CLI/MCP保存同一take.annotations，执行相同正式工作流，并读取冻结来源及真实taskId。

可复用Agent指令：

```text
读取当前项目明确方案和revision。在02镜确切take上保存1.2–1.8秒的continuity批注“视线方向错误”。
保留完整document和adoptedArtworkId。先只记录批注，不生成。
用户执行返工后，run_video_workflow传storyboard.review的原nodeId/taskId/artworkId/annotationIds和明确instructions。
nodes只含02镜当前revision，reuseCompleted=false，不带assembly。按原operation_id恢复未知受理。
用run.plan.reviewOrigin和nodes[].taskId核对新候选，保持旧采用与粗剪，等明确选片再替换。
```

## 验证命令、实际结果与证据层级

证据目录：`E:/Workspace/naumi-task-evidence/storyboard-review-20261110/`；准确输入／字面stdout／exit／哈希／回滚命令以`VERIFICATION.txt`为准。

- `node --conditions=react-server --import tsx scripts/verify-storyboard-application.ts <evidence>/application-second`：**77项PASS**。实际Next App、独立PG、Worker、私有存储和账务，包含原66项、新审片9项及实际CLI/MCP2项。验证确切任务／作品、真实媒体时长、越界事务拒绝、跨账号、单镜范围、原采用不变、实际新候选、1任务／1账本、重启原run恢复、后续批注修改不影响冻结run、旧revision拒绝、过滤历史及独立分叉精确继承。商业供应商调用0，供应视频字节来自受控fixture。
- `verify-storyboard-review.ts`：**26项PASS**，严格schema、范围、精确take、冻结深拷贝、采用保持、Agent完整schema及共享输入编译。基线探针缺失时间码能力exit1；修改后exit0；独立副本回滚重现基线exit1，活动修改保持。
- `verify-storyboard-review-ui.cjs`：**12项PASS**，实际React／Edge／视频解码、时间定位／区间暂停、候选隔离、越界拒绝、保存响应丢失／401重开原请求、准备不提交、显式单镜返工、冻结来源返回、390px与桌面、全新上下文读取服务端批注、编辑删除和返工关联服务不可用时人工审片。HTTP拦截属于组件层，不冒称完整生产画布体验。实际截图已打开检查。
- 原导演UI13项、独立版本UI6项回归通过；原Agent20、独立12、制作17、导演23项规则通过。完整TypeScript和改动模块ESLint通过。
- 初次纯规则检查发现schema导入循环并修为叶子依赖；初次UI媒体fixture缺少HTTP Range导致定位超时，修复fixture后实际定位通过；跨账号测试最初预期422、实际隐藏资源404，修正断言；删除批注测试改为按确切批注定位。原失败日志保留，不隐藏验证过程。

## Git、回滚与未完成项

普通合并／远端main SHA、四件封存产物及逐文件哈希见证据目录`GIT_RECEIPT.json`与`MANIFEST.json`。回滚只在证据目录独立副本演练，不回灌数据库或媒体、不重放付费任务。共享checkout、103映射隔离线及47 HOLD保持；本次没有生产发布或配置变更。

下一顺序对象VV-06声音字幕，先核对W11当前owner实现再补闭环。P2视觉／语音质量检查尚未接入；真实商业质量、完整画布浏览器接手、目标站部署验收仍分别留VV-01/02，不能以本地77项或Git合并关闭。
