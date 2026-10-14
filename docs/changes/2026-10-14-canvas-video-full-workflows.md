# 完整原生工作流映射与混合依赖验收

本批补齐P05及V16，当前矩阵28/34项（约82%），注册36份证据；完整交付门槛仍待完成。

## AutoDL、RunningHub、ComfyUI

独立fixture为AutoDL/RunningHub维护真实typed工作流映射：workflowId、prompt/negative、图片/视频/音频、duration/resolution/ratio、generateAudio=false/watermark=false/seed=0，并保留原模板未映射节点及false/0值。只修改隔离测试配置，不维护或猜测生产工作流能力。

`verify-video-fusion-full-workflows.ts`实际App/PG/Go Router/Worker执行：缺必需图像预扣前422且无任务/费用/供应商创建；合法请求原生映射完整，RunningHub三类原始素材经真正multipart上传、SHA对应返回文件名，AutoDL使用授权签名URL。manifest只在私有加密快照中保存，原始引用身份/SHA保持；两份视频完整保存、探测/下载SHA/其他账号404，一次结算，重启同操作原task/结果/费用不变。既有ComfyUI真实GUI三类引用/输入映射、false/0、三产物及0积分、历史删除后加密工作流配方再生成证据一并复核。

首批fixture提示词末尾空行与编译器外层trim的预期不符，修正新测试正文末尾构造；全文正文/中间换行保留。AutoDL随后完整通过，记录`full-workflows-d973d54a-dca9-4a89-9d2f-401f4f7e53be/partial.json`。RunningHub失败揭示模拟服务先校验Bearer而原生upload在表单发送apiKey，实际任务正确停留needs_attention/creation_unknown，未假完成。修正隔离模拟器严格校验RunningHub正文/表单apiKey；错误密钥真实multipart仍401且没有上传记录，其他协议鉴权保持。

仅重跑RunningHub，25496 exit0，记录`full-workflows-8edbaffa-6861-41a4-b01c-53393c7c04a6/result.json`。`verify-video-fusion-workflow-summary.mjs`严格核对两次原始记录、SHA、全部条件和实际原生body/三次上传，保留首次partial而不当整批通过；汇总`full-workflows-summary.json` PASS，两profile/六个映射媒体/四结果/两创建。失败运行和原始证据保留。

## 同一张图的混合依赖

`verify-video-fusion-mixed-dag.ts`真实五节点：managed独立起点A/X；BYOC B依赖A；managed C依赖A/X；managed D依赖B/C。接受后只有两个起点task，其他阶段无task，不以空输出抢跑；各阶段加密冻结。实际全文、变量0/false展开，省略规格从已发布配置继承8秒/1080p；BYOC seed0覆盖和原库宽640/音频false冻结。

接受后把ComfyUI库改为新文字/seed777/宽999/声音true，再实际重启App，旧链仍用原冻结库和覆盖。五任务全部完成，两个前序的正式结果按mediaBindings顺序进入C/D；BYOC费用0，其余各一笔流水，合计余额准确，无效变量/自依赖/重复节点422无任务和费用，其他账号404，重放不重发。13028 exit0，证据`mixed-dag-aa56dcf1-3b5b-47fc-a042-325dd544c941/result.json`。原保存画布节点的移动/内容编辑、历史删除、模型/计费发布变更冻结证据仍由workflow/freeze模块分别证明。

## 验收边界与主线整合

批准设计第7节和实施计划Task15要求供应商隔离模拟、正式模型调用0；后续V12/V13的策略核对是制作规则、来源及实际应用执行覆盖，不引入生产文字模型调用，也不将scripted供应商解释为真实模型创作质量通过。拼图面板、声音/原文资产及各续写方向仍须完成源码/行为/上游对照，不只凭system字符串标通过。

主线新合入6c7c120的统一存储适配器，涉及视频媒体写入、私有读取与Range。本批将先保留主线整合，再集中运行受影响的完整工作流、混合依赖和播放器/私有Range模块；上文证据是整合前阶段通过，不能冒充整合后验收。没有连接NAS或更改正式存储配置。

d6f53dc的Image gateway38551641777及Docker38551641808终态failure，新固定Linux验收未通过；不把本机通过改写为CI成功。TypeScript与28/34矩阵检查已通过。当前仍无本批服务器连接、部署锁、103发布或维护计数增加。
