# 派生素材闭环、播放器与工作台边界验收

完整矩阵本批逐条件补齐V19、V20、V21、V23、V24，当前23/34项（约68%）审核完成，注册32份证据。比例只表示能力验收条件覆盖，不代表整条交付或真实视频模型效果已通过。上游实操对照、Agent/混合工作流剩余条件、完整分支复核、固定Linux候选/排空回滚和103正式发布继续进行。

## 新增真实应用闭环

`verify-video-fusion-derived-media.ts`在独立App/PG/Go Router/视频Worker/媒体Worker中从画布原节点实际生成视频，再从该节点执行首帧、1.25秒当前帧、尾帧、1—3秒裁剪、音轨提取及音视频分离。六个媒体任务产生七份真实产物，逐份下载并核对SHA和独立FFprobe；首/当前/尾帧不同，裁剪2秒，分离为仅视频和仅音轨两份文件。产物parentId、project、creationProvenance均关联原生成结果，跨账号访问404。

时间等于/超过视频时长的数字抽帧、越界/逆序裁剪以及无音轨素材提取/分离均422，返回明确音轨错误码，无任务或费用写入。随后将当前帧、裁剪视频和音轨三个派生素材加入新画布视频节点，重启App后生成完成；冻结素材身份与SHA、原生图片/视频/音频三组路径正确。重放媒体和视频操作无额外创建/费用，原节点任务/结果指针及原素材SHA保持。

终态35598 exit0，原始证据`checkpoint-d/derived-media-7455ccc7-e55d-46cd-a643-c0bc3dc2d91d/result.json`。`verify-video-fusion-derived-audit.mjs`重新读取原始结果及原生创建文件、七份实际产物字节和独立探测，核对下游原生路径所属job，汇总`derived-media-audit.json`，PASS：frames=3/jobs=6/artifacts=7/video_tasks=2/native_creates=2。没有重复运行已通过的媒体大模块。

本次开始时独立本机PG端口拒绝连接，pg_ctl确认无服务运行；启动后实际恢复进程持续运行，启动等待超时未再次重启。确认pg_isready接受连接后才执行新模块。仅使用本任务原独立数据库，没有连接正式站点。

## 播放器实际浏览器补证

`verify-video-fusion-player.ts`通过真实Chrome键盘/按钮检查视频音量0/1与静音、原生Fullscreen进入/退出、实际播放位置0.4秒的当前帧，以及时间轴到末端后当前帧发送last。两次实际媒体POST分别timestamp=0.4/last，真实Worker输出两个不同PNG。媒体面板中实际音频播放、暂停、音量及下载通过；刷新恢复原任务，供应商创建总数1。

实际App媒体入口Range前缀128字节、后缀64字节返回206且字节一致，越界416、其他账号404。首次揭示模拟对象存储只支持数字起点，不支持后缀Range；修正隔离S3 fixture的Range解析/边界，不修改生产媒体路由。第二次因测试要求隐藏audio元素visible而失败，改为等待attached及真实readyState，保留播放/暂停等行为断言。失败截图保留；最终82481 exit0，证据`checkpoint-d/player-46927c5e-7a8d-4679-ae2e-2e4386dadb3b/result.json`，刷新截图已实际查看。

V19还核对既有真实上传/登记、历史替换/撤销保护旧结果、视频解码播放/静音/时间轴/下载/放大证据；V24核对真实工作台GUI三任务×两产物、未发送留工作台、本人显式发送、重放无创建/费用、原节点保持，以及原画布依赖链和账号隔离。源实现对应coverage.json具体criteria；上游对比仍作为独立交付门槛未通过。

## 当前CI与交付边界

355c428的Image gateway 38548129130终态失败在`verify:pricing-access`，此前完整npm build、计费事务、计费浏览器、业务模型浏览器步骤全部success；证明上一批模型菜单修复已在Linux实际验收。报价检查只识别旧NEXT_NOT_FOUND，当前安装Next实际源码使用NEXT_HTTP_ERROR_FALLBACK;404。本批兼容该明确404的RSC流标记，保留所有敏感报价、签名管理员、缓存和公开chunk检查；修复后的固定Linux整条CI仍待运行/核对，不把旧失败改记通过。Docker工作流38548129147终态failure，UI构建job success而publish失败，不作为固定发布候选通过证据。

本批完整TypeScript、diff检查与23/34矩阵检查通过。视频供应商仍隔离模拟，付费视频调用0；FFmpeg与字节/探测是真实执行，不证明真实生成质量。本批没有服务器连接、部署锁、103正式发布或维护计数增加。目标保持进行中。
