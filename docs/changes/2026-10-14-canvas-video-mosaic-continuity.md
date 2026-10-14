# 四格拼图与连续制作补证

本批实际应用测试通过，新增两份证据登记。V12/V13仍保留上游完整实操条件，矩阵正式审核数保持30/34，不能先按32/34或完整交付通过报告。真实LLM创作质量与付费视频效果未测；使用批准方案要求的隔离供应商和本任务原创媒体。

## 四格拼图

`verify-video-fusion-mosaic.ts`经真实Agent工具、App、独立PG、Go Router及Worker：四格原创PNG1280×720通过正式`/api/artworks/add`上传，整图仅作reference而非first_frame；四段各3秒合12秒，完整逐字原稿与四份作者片段、独立可编辑镜头正文保持。正式人物图片和音色音频进入Kling Omni element，原生请求一张整图、四个multi_prompt、audio=true；冻结拼图SHA与音频SHA吻合。

漏第四格在写入和预扣前拒绝。重启同operation只保留原任务和一次供应商创建；原图与原稿完整，另一账号读取404。最终10041 exit0，证据`checkpoint-d/mosaic-2447c449-29c6-4055-befe-2224acffe0cc/{result.json,native-calls.json,original-four-panel.png}`。首次32129因测试误用不存在的上传路径404失败，修正为正式路径；失败记录保留。

## 连续制作

`verify-video-fusion-continuity.ts`真实保存完整原稿，建立开场A、依赖A的硬切B、依赖B的同机位C、依赖A的前传P。每段均保留正式角色图、音色音频与自身逐字对白。接受时仅A提交，App重启后Worker依次读取真实新生成前序的作品ID/SHA；前序完成时间不晚于当前任务创建时间。四个持久任务、四次供应商创建、每任务一笔结算，整链重放没有新增费用；原稿及所有结果媒体SHA保持，另一账号run404。

reference能力路径用于三种叙事意图，未伪造反向延展API。最终69854 exit0，证据`checkpoint-d/continuity-87e8d486-0c8c-4489-8afd-f69ccd1da7c4/{result.json,native-calls.json}`。首批91907把拓扑排序返回数组误当原始shot顺序，C/P测试ID映射错误；修正为工具正式nodeIds映射，未修改正确的产品依赖逻辑。失败记录保留。

## 制作规则核对与剩余工作

已对照固定IC68b37db的video-multi-shot、video-extension规则及Naumi production-prompt：整拼图不裁切/不当首帧、逐格顺序/时长、正式身份和声音职责、默认硬切、明确同机位、前传导向来源开场、成功前序与持久依赖一致。script-assets及video-script-storyboard在创建正式片段前验证逐字连续覆盖和来源修订；实际测试补齐四格原生请求与新前序连续链。原script/multishot/SSE/freeze证据保留各自范围，不把脚本供应商解释为真实模型策略质量。

上游实操、整分支复核、固定Linux候选/兼容回滚和103发布仍待完成。本批没有SSH连接、部署锁、上线或维护计数增加。
