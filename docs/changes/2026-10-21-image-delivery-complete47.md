# 47 已出图交付闭环修复（2026-10-21）

## 用户目标与本轮范围
用户要求修复并上线，以真实出图、打开和引用为验收；不再把改文案、plan HTTP 200 或模拟供应商当完成。独立工作树 codex/image-delivery-complete47-20261021 从 ce783957 开始，共享未提交 UI 不动。原后台查询优化保持。

## 已完成实现
- generate-image 落地失败记录脱敏阶段、错误类别及次数；对已完成 paid checkpoint 最多两次原结果交付重试，重试分支直接读取 bytes，不进入任何供应商分支。
- DurableImageJobs 单次 patch 失败不再污染后续 Promise 写入队列。
- stored-delivery 按原冻结版本处理原结果，支持 2K/4K、显式 contain 尺寸、后台 postprocess；固定作品 ID、原 quote 单次结算、父子回执事务收尾。已有 partial 恢复继续完成；原作品不覆盖，新处理产物用确定性 -delivery ID。
- 主动查询自动完成已保存结果交付；readImagegenReceipt 仍只读。Worker 仅串行处理本版已重试三次且终止的本地结果，最多两笔/轮、五次失败上限；旧记录不由 sweep 全量修改，发布后按固定 manifest 恢复。
- APIB 已解码的真实图片不因 actualModel 或尺寸差异被丢弃；实际像素与差异保留供应商账本，部分有效图交付，图片下载瞬时失败重试一次，不重做生成 POST。
- 有原 task_id 的受理任务仅恢复查询，最多三次/十分钟；未知受理不自动重发。管理员参数映射与报价保持。

## 验证与发现
- 原 2K 恢复基线可复现 needs_attention + 原预占未释放；修改后 2K 2048、4K 4096、旧 partial 续交付、父子 done、单次结算、并发恢复、删除/归属/租约/未知上游防重放均通过。
- 四处瞬时故障注入（结果检查点、作品、结算、最终回执）续交付成功，每笔仅一个供应商入口。
- 实际 APIMart fixture 覆盖模型/像素/数量差异、下载 503 重读、16 参考图、原 task GET 恢复、未知状态不发第二次 POST。
- 两笔生产原 checkpoint 本地解码+隔离 PG 交付通过；未复现历史原始异常，不能把 fixture 早期漏预占/漏函数错误当生产根因。
- 旧在线版真实基线 GPT 1K 27.483 秒、768×1024/808169 字节，香蕉 2K 39.748 秒、1529×2048/2958971 字节，分别 6/8 积分。这不是新修复已发布证明。

## 尚未完成
本文件创建时仍待固定构建、三锁蓝绿、浏览器连续性、真实图生图/即梦、固定历史清单恢复。不得把已编写实现或局部测试称全部故障解决。

证据目录：output/image-delivery-complete47-20261021 和 C:/Users/13357/.t3/scratch/image-delivery-complete47-20261021。敏感原图/冻结配置只存私有 scratch，不入 Git。

## 生产验收发现与后继修复
第一候选 882194df 切流验收期间，新增恢复扫描的相关 JSONB JOIN 在生产数据量下运行约 60 秒；仅取消该精确扫描 SELECT，用户生成未取消。替换为 16 条小型父记录页 + 主键读取子记录，扫描事务 statement_timeout=1500ms。后继固定镜像重新蓝绿，不以在线热改替代发布。此问题由本轮引入，不能归咎供应商。

## 后继发布现场记录
- 已普通合入上传兼容 6bf829bd + 42978b66，候选 source48d1445e/build1792562346/image67ca4a100fa9。
- 第一候选扫描查询取消使自身 tick unknown；归档精确原记录，证实该 scan 无子活动、无 claim、SELECT 已结束后仅收尾观测记录；result.ok=false，未伪称扫描成功。Worker 标准 reconcile 拒绝 failed receipt，保留失败 Worker 原状态并在排空后退役。原入口已真实切回，静态 union 保留。失败 candidate 两槽停止。
- 后继首次就绪因回退 manifest operationId 未绑定而未创建候选；已持锁核对 SHA/网关并修正绑定，新事务继续。
- 后继切流后发现老总控 shared-DB drain 会把新槽用户生图计作旧槽未排空，且成功等待后又立刻二次读存在竞态。运维修正仅剔除有新 instance/boot/commit、精确 lease_token/work_key、35秒内心跳的当前新槽 image claims；未知归属、其他任务、事务和 advisory 锁仍保留门禁。保存首次成功的实际排空证据；按已确认操作续执行，不重做切流。
- upload 候选模拟 createImageBitmap 拒绝，实际DOM fallback上传HTTP200，1536x2048/3047099字节/SHA32432de5...与原始图片完全一致。公网实际上传同字节通过，作品卡片可读取；测试图为本轮生成素材，不是用户私有原图。
- 运维修正不改变已固定 App 镜像，后续 Git SHA 与运行 source48d1445e分开报告。
