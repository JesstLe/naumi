# 画布保存与同步体验完整切片

基线：2dff63af72dde3767a1644b75d4f790d3d04c6d6。独立 codex/canvas-save-experience-20261123。共享 admin 工作区不变；两份工程规范从共享 docs/engineering 只读读取（当前分支缺失）。

## 用户目标与验收
- 正常输入/排队/保存中采用轻量反馈，不显示失败式全局警告。
- 保存状态按节点和项目归属；其他画布草稿保留且可定位，不影响当前画布保存/生成。
- 冲突、失效节点、未知回执有明确处理入口；保存成功只清对应已确认的内容。
- 图片提示词的失效旧队列不得毒化当前节点和项目的flush。跨项目依赖由明确调用方指定，不隐式保存全部打开过的节点。
- 服务器已保存但投影失败只读重拉，不重复提交原写入。
- 多账号/空间切换、并发编辑、响应丢失、刷新恢复、真实CAS和回执身份保护保持。

## 职责与接口
现有 text/native/prompt/history 文档继续拥有草稿、队列、nonce和持久化；轻量 save-status 只描述每节点展示状态，不拥有第二份写入状态或新的全局任务系统。UI统一聚合并按当前画布展示，具体恢复操作仍回到原owner。

## 允许改变
新增分节点状态和按项目/节点的显式保存恢复；处理旧/失效草稿的定位、复制备份及用户显式放弃；分离已落库但显示待刷新的恢复；合并相同视图同时触发的只读刷新。

## 保留
不清用户缓存、不删除草稿来消除提示；不改服务端权限、版本/CAS、幂等、数据库结构、供应商、计费、生成接口；不修改其他UI主题或画布操作语义。

## 验证计划
修改前既有reported-recovery与save-transport，调查的3项缺陷复现；完成切片后集中回归text/native/video/prompt/history、真实Next/Edge 1440/390、独立审查、tsc、固定源码及副本回滚。执行命令、真实结果和未完成项追加本记录。

## 发布边界
仅代码实现/验证及主线整合；生产发布、真实付费生成与生产配置不在本次执行中。用户当前提供的47暂缓条款与Git入口历史存在差异，保持不部署。

## 当前进度
实现完成，定向模块、实际Next页面、独立Reviewer与带哈希的副本回滚已通过。生产未部署，Git固定提交与最终门禁原始输出在外部VERIFICATION.txt。

## 根因与实现
1. 旧页面把账号/空间整个文字草稿数直接当作全局失败状态；现在document投影pending/saving/failed/conflict/unavailable，正常排队/请求等待为中性状态，真实ACK后消失。
2. 当前画布与其他画布草稿分区；文本、图片提示词及原生节点的显式恢复按project/node选择；history原生写屏障同样按当前project，不让旧视频409挡住另一画布。全项目分享/复制/保存显式选择project flush，生图只处理当前图片提示词。
3. 旧图片提示词404不再毒化全部visited entries。保留原草稿，可定位/复制；只有明确拒绝且没有活动/未知attempt时，用户确认后才允许放弃。文字/作品真实冲突沿用原有两版选择；其他已知冲突不展示无效的普通重试。
4. 非video未知回执恢复复用原attempt.key/body/CAS，仅恢复一次原操作；保存结果仍由原owner确认，不增加第二个写入系统。新建节点入队同步登记project，屏障不会漏等尚未开始发送的创建。
5. history已ACK后投影/显示读取失败保留独立scope只读标记；刷新显示仅canonical读取artwork/text/native/preferences，不重POST已完成历史操作。偏好读取吞错的既有port需检查其snapshot.error后才清标记。
6. focus/visibility/poll同一view的自动读取合并；显式refresh仍是独立新读，新项目也独立读取，不复用旧项目flight。既有慢读不能覆盖新ACK的fence保持。
7. 新轻量状态面板浅色，桌面靠左、手机顶栏右侧；详情展开时在编辑dock上层，收起时不挡项目菜单；点击外部/Escape收起，全保存后复位展开状态。

## 修改模块与数据归属
- save-status.ts：只读状态类型/项目selector，不拥有任务或写入。
- text-document.ts、image-prompt-client.ts、native-node-document.ts、video-node-save-queue.ts：在既有owner内投影节点状态，保留原队列/草稿/nonce/ACK，并提供明确恢复接口。
- history-controller.ts/use-canvas-history.ts：已ACK显示失败的只读恢复；artwork-document.ts记录冲突的原project，删除后的冲突不随当前页面漂移。
- native-document-lifecycle.ts/use-canvas-native-node-document.ts：原生项目屏障与自动读调度，显式刷新语义保持。
- canvas-save-status.tsx/canvas-client.tsx/use-image-prompt-sync.ts/save-command.ts：展示、当前项目/节点动作、动态终态检查和具体失败优先。
- scripts既有reported-recovery/text/history/native/save-boundaries/save-transport以及binding：增加根因边界并适配真实新状态组件；没有删旧正确断言。原save-command通用未保存断言改为具体conflict，是本次明确允许的错误优先级行为变化。

## 已执行验证（最终重跑原始输出见外部VERIFICATION.txt）
修改前：reported-recovery 8/8，save-transport 23/23（loopback+独立PG），均exit0；另3项旧问题实际复现成立。新增契约对原始源码预期失败，不计为历史产品PASS。
实现后：reported-recovery 19项；text-document 22场景/68断言；history 67场景/184断言；image-prompt 20项；native实际6 hooks 74组/112断言；save-boundaries 8项；save-transport真实PG23项，均通过。实际Next15.5.28/Canvas/ReactFlow，Edge 1440x1000与390x844，7项通过、pageerror0、供应商调用0，截图已打开检查。

## 验收中发现并纠正
- 新状态组件在旧esbuild classic fixture缺React导入导致整树卸载：已修，非产品账号切换问题。
- 全部刷新去重会合并用户显式新读：改为仅hook自动事件去重，保留显式刷新原契约。
- 手机面板曾被文字dock截获点击、顶栏曾重叠：已修自适应位置/展开层级，重跑真实手机视口点击重试通过。
- 未知video 501/text408不得因新增弃稿按钮被清除，已保留exact attempt并增加回归。

## 未执行与保留边界
未执行生产部署、生产付费生成、全仓重型构建、实机手机触摸和生产多用户长期观测；没有服务端写协议/权限/计费/数据库迁移。实际浏览器HTTP为受控loopback，PG真实性由独立transport脚本验证，不混写成线上验收。非video原生节点沿用既有内存attempt生命周期，没有另建持久化journal；本轮不宣称新增跨浏览器恢复能力。

## 交付材料
E:/Workspace/naumi/output/canvas-save-optimization-20261123/：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh。源文件原/新SHA256在SOURCE_MANIFEST.json，回滚仅允许带fixture标记的独立副本，真实修改保留。


## 独立复核与回滚结果
Reviewer最终PASS，无未处理P0/P1；独立重跑reported19、native74/112、history67/184、boundaries8、prompt20、text22/68，并打开最终5张1440/390截图。REVIEW.md及产品指纹位于外部证据目录。
原始源码运行新增19项契约，结果FAIL/12，exit1（预期复现缺陷/缺少新恢复API，不代表12个独立故障）；修改后PASS/19，exit0。带标记的另一副本执行ROLLBACK.sh，原SHA256全部恢复；同契约再次FAIL/12、exit1，结果恢复到基线，真实MODIFIED_FILE仍保持新实现。
