# R5N：在线改字会话、后台观察与面板边界

日期：2026-10-26；独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。完整基线 `e9329b2d52a03461ecbd1e4d2be2a4c488498efe`，4425个原文件hash与完整归档。

## 实际职责与消费者

在线改字不是普通文字节点编辑。它包含OCR扫描、原图像素框、改字草稿、冻结报价/入队、后台任务与已生成作品同步。原实现把整条链、定时器、状态和约180行侧栏JSX都塞在Canvas闭包，重复自持已完成任务集合、定位与历史落地。

- `src/lib/canvas/image-text-editor.ts` 现在唯一管理OCR状态/草稿/焦点/scan epoch与定时进度、原提交attempt/quote/operation、server task映射和后台观察。依赖窄的scan/submit/read/pending/merge/history/credits等ports，不import组件或生成/结算实现。
- `use-canvas-image-text-editor.ts` 为每editor持一个owner，useSyncExternalStore订阅同一快照；mount清理和账号/项目/工作空间revision负责迟到响应隔离。
- `image-text-panel.tsx` 原侧栏原样迁移，仅回调到owner。OCR框定位/滚动、模型/质量选择、文本编辑和应用按钮保持；没有新增确认或说明段落。
- Canvas真实改绑，删除原scan/apply实现、独立OCR状态/ref和后台轮询大段。后台观察不再因为打开/关闭侧栏重建任务身份；域切换释放旧观察。
- 已完成作品复用现有`createCanvasResultAttachment`，不是再造一个结果落地器。该helper仅增加可选position：未提供坐标的旧记录只同步原作品，不重排；所有旧调用仍提供position，原行为保持。
- OCR框类型复用现有canvas-ocr合同。Canvas **7791→7311行**；164个非目标具名函数AST保持，8个adapter明确改绑，旧平行owner数据0份。

## 本轮关闭的行为缺口

1. 原入队抛错后再次点击会新建operation；新版在实际提交前固定operation头，沿现有RetainedBillingSubmission冻结原body/quote。未知响应仅按原owner+operation确定的task ID读GET；404也不重POST。确认未受理的4xx或报价准备未成功可以更正后重新提交，不把运营确认加给用户。
2. 原扫描只比较request epoch，workspace revision变化仍能写入；旧timer在close后继续递增隐藏进度。新版同步失效旧scope/scan并释放timer，ABA、卸载也不写新视图。
3. 原任务完成后作品读取失败，下次轮询再次定位；新版共享attachment记住原定位事实，只读原结果并单次记录history，不重新生成或移动。
4. 已受理同一segment再次点击只刷新原任务；关闭面板不取消server job。任务完成不会覆盖后来输入的草稿；同图重新扫描后旧任务只交付作品，不改新面板内容。

所有账务、server enqueue/Worker/能力策略代码保持原实现。没有把需要关注、取消、真正余额不足转成成功，没有重新发未知收费任务。

## 集中证据

| 层级 | 实际结果 |
|---|---|
| 完整旧Canvas函数及原effect | 10类35检查；原unknown新operation/workspace迟到写/关闭timer/读取失败重复定位按预期复现 |
| 实际新owner/共享attachment | 22类79检查；GET原任务、404不重提、并发一次、原JSON/像素框/坐标、项目/workspace/卸载、原草稿、needs_attention、旧无坐标保持 |
| 原JSX→新view实际React SSR | 24组HTML逐字相同；模型控件采用同一显式fixture，原Lucide渲染代码实际加载 |
| 实际owner→真实报价/OCR/入队/list/detail/作品position/get＋隔离PG | 28检查；OCR本地文字模型1次，OCR2积分/编辑原6-current16仍结6；两笔consume；足额enqueue POST1、unknown再POST0；额外余额负例POST1返回402/零任务零consume；跨owner404 |
| 实际Next/完整BillingProvider | 5组：工具栏/原面板、body/header同operation、已受理不重提、关闭后原任务交付/读取失败续接、unknown原task GET、延迟scan关闭 |
| 相邻Next | 创作栏15、普通图片5、详情/扩图5通过 |
| 助手owner | 15类55检查保持 |
| 全项目TypeScript/lint | 最终原始日志为准；Canvas原8hook warning保留，不报0warning |
| 结构 | emitted静态/全部literal导入SCC仍0；原fixture2条lib→app与toast1条lib→UI继续单列 |

真实PG使用实际本地PNG/归属/冻结配置/钱包/账务/作品handler。图片供应商与Worker渲染没有运行：结果由明确fixture调用真实storage/complete transition，不能冒充图片模型端到端执行。Next为完整源码dev fixture，接口模拟，生产文件绑定另见RUNTIME_BINDING；不是生产镜像或容量验收。

## 原失败保留

- SSR的Lucide CJS在本地包type=module下直接require失败、VM全局Infinity声明与default interop问题，只修加载器，原失败保留。
- 真实PG fixture最初缺agent.text默认、图像通道identity/text能力、poor账号project scope；诊断后补实际夹具配置，不改生产能力拦截。grant0账务行与ArtworkRecord/UI类型观察器错误分别修正。
- 真实Next首次误用“在线改字”而实际控件为“编辑图中文字”；复跑旧fixture遗留running任务、与其它browser并行reset、以及占位遮挡指定相邻节点的尝试均保留。改为每轮明确reset、浏览器串行、完成原fixture任务后再测延迟scan，不force click、不改产品布局迎合脚本。
- 相邻测试原结果未改写为最终源码结果；涉及shared attachment改动后单独重新执行受影响普通图片/详情控件。

## 回滚、Git与继续项

四产物 `output/refactor-r5n-20261026/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。完整modified独立副本恢复全部4425原hash、删除新增文件，并重新运行原scan/apply/effect行为；实际工作树保留新版。最终文件数、patch精确重放、commit/push/remote及自有fixture清理以DELIVERY.json为准。

同步后第1功能模块；已含main d460e61f，不合回main、不部署。继续Canvas外围组合、跨请求/多tab CAS、R6同SHA CI/完整候选与历史benchmark债务/真实容量。owner中的未决client intent只跨本editor的panel/项目往返保留，不声称浏览器崩溃后durable客户端恢复；server后台任务仍由原PG事实恢复。
