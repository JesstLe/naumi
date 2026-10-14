# 画布视频上游实操对照

## IC多镜头、运动控制及Omni元素实操补证

固定IC虚构账号的本地渠道改名“隔离KIE参考（无密钥）”、地址127.0.0.1:15375，仅手工登记固定源码定义的kling-3.0/video、kling-3.0-omni/reference-to-video及kling-2.6/motion-control。密钥保持空，没有拉取模型目录或发送生成请求；只能证明真实UI及保存能力，不能称原生供应商接口调用。本轮不使用Naumi配置或凭据。

实际新增两份原创完整文字节点，分别保留0—6秒与6—12秒、动作和逐字台词。由画布参考选择实际连接到视频，开启多镜头、新增第二镜头、各6秒，并分别选入真实正文；刷新重新打开设置，顺序/秒数/正文保持。kling-multishot-linked/restored-dom.txt与截图、正式项目回读中的klingMultiPrompt/textNodeId证明实际关联。此前comparison V09把来源写为TF，与批准设计的IC来源不一致，本批修正为实际操作的固定IC。

浏览器文件上传能力受限后，经本地上游正式POST canvas/projects接口准备4份本任务原创媒体：first.png、last.png、4秒有声MP4、8秒WAV。导入前对每份原始文件校验manifest SHA，保留原节点/连线，prepared-original-media.json记录准备方式与SHA。这是测试素材准备，不是浏览器上传通过；没有生成或覆盖原素材。第一次updatedAt误传数字，被上游“画布项目数据无效”拒绝且没有写入，修正为正式ISO字符串后保存成功。刷新浏览器实际显示8个节点及媒体预览。

运动模型实际选择角色朝向“视频”，将真实图片与运动视频连入输入，项目回读为last.png和landscape-4-audio.mp4，以保存的真实来源ID为准，不冒充first.png。motion-bound-project.json和orientation截图/DOM记录参数与绑定；未执行运动生成或完整边界测试。

切到Omni reference-to-video，实际填写元素名称“甲”和完整描述，并选择同一元素中的原创图片last.png及4秒视频；素材计数为2、两项显示已选。刷新后名称/描述/nodeIds、正文/两镜头/时长与4条连线保持，omni-element-bound/restored-project.json、对应DOM/截图及advanced-settings-reload-result.json证明。音频元素、其他Omni分支及数量边界仍待比对。

两图片导入后由上游缓存转换成Blob地址，刷新只有这两个临时地址变化，图片节点ID/缓存storageKey、位置/规格和预览保持。最初整对象相等检查因此失败，随后明确按缓存语义核对稳定字段；不是删除其他差异来伪造通过。Chrome downloadMedia明确不支持Blob下载，未取得刷新后图字节证据；只对视频/音频实际base64原字节SHA再次核对通过。上游素材回读辅助脚本在忽略目录reference/capture-local-ic-project.mjs，认证只由环境传入、输出不含秘密。源图片的刷新后字节相等尚未验收，不写为通过。

V05/V09/V10/V11更新为partial-observation；V12/V13完整上游策略对照、其他剩余行及固定交付仍未闭合。本批没有SSH、部署锁、103发布或维护计数增加。

截图复核纠正：刚选择后的omni-element-image-video-bound.png仍是未重绘的0项画面，保留为历史，不当作两项绑定通过证据。最终把同一参考页置前并滚动到元素区，omni-element-restored-painted.png实际显示计数2、名称/描述、last.png和4秒视频两项；comparison已用此最终绘制画面，DOM与正式项目回读保持一致。没有修改网页内容或浏览器权限。

## 固定上游高级设置、权限与历史补证（仍未完成全矩阵）

本批恢复独立loopback参考服务，固定源码版本不变。IC15372/15373、TF3000/15374及MCP10588均仅本机监听；使用原独立数据库与工作区。IC旧管理员测试口令未确认，未重置原账号；另建虚构普通账号，仅本地参考用，无正式供应商凭据。浏览器新建IC测试画布LFBjXJ6x42wjdblNhPHZr，保留原文12秒视频节点。

TF原节点实际从首帧可选切到混合参考，时长选择器显示4—30秒；选择12秒、480p、9:16及音频true，刷新重选节点后全部保持，两份正式帧图及完整三行原文保留。实际分辨率选择只有480p/720p，本参考模型目录不作为Naumi模型能力兜底。settings-advanced-before/after-reload-dom.txt及screenshots/settings-advanced-after-reload.png证明V06/V07的本批范围；其他负向、seed、水印和模型高级字段仍待比对。

TF媒体生成控制实际只关闭“允许AI生成视频”，保存重开false，其余图像/音频仍true；随后恢复true并保存重开确认。保存media-control-video-disabled/restored-dom.txt及disabled截图。技能菜单实际显示canvas、workflow及v118workflow；保存skill-workflow-menu-dom.txt/截图，不把入口观察冒充LLM实际调度。原视频历史打开，当前4秒原创文件7f49f403-8be1-4556-aec3-eeecfb2e38e5.mp4可预览，history-owned-result-dom.txt/截图；上游失败/重试尚未触发。Naumi分别已有Agent报价/确认/停止与真实失败重试历史恢复证据，仍需完成整项上游比对。

IC实际启用摄影，改相机ARRI Alexa Mini LF及65mm，保留ARRI Signature Prime/f4。刷新后正文/12秒、相机/镜头/焦距/光圈及开启均保持，camera-controls-new-canvas/after-reload-dom.txt和after-reload截图。点击“导演台”实际创建3D场景截图节点，此入口不是视频多镜头或制作调度证据，不能拿其替代V09/V12。

本批Chrome文件选择器已打开，但setFiles因扩展未允许file URL而拒绝；没有扩大浏览器权限。该次上传未通过，此前原创视频上传/播放/抽帧等证据保留原有范围，不把新请求尝试标成功。自动审批曾拒绝批量后台启动命令；使用独立受控exec会话启动参考服务成功，未改权限或绕过安全限制。当前本地会话68460/80085/58378/36216分别归本任务参考服务；没有SSH、部署锁、103发布或维护计数增加。

## 固定Toonflow首尾、混合与排序实操补证

本次沿用ae9e5f固定源码和独立原创媒体工作区。把已实际截取的尾帧图片连入视频生成节点后，模型归一到混合参考；实际选择“首帧可选”后明确显示“一张图片作为尾帧，两张按顺序作为首帧、尾帧”。刷新后模式、原图身份和完整三行提示词保留。无媒体时选择首帧可选仍回文生，与此前混合模式无输入规则一致。

实际依次连接尾帧图片、两秒裁剪视频、提取音频，得到图片/视频/音频三种输入。拖动音频卡片后编号变成图片/音频/视频，刷新仍保留；独立工作区referenceOrder的节点身份顺序与浏览器相同。随后移除两份非图片输入，实际抽取原视频首帧、连入第二张图片、选择首帧可选，再拖动交换两图片顺序，工作区保存为首帧节点、尾帧节点。原视频输出文件和原始完整提示词保持，没有点击付费生成。

证据在reference/toonAe9e5f：first-frame-restored-dom.txt、mixed-reference-dom.txt、mixed-reference-reordered-dom.txt、mixed-reference-restored-dom.txt、two-frame-dom.txt、two-frame-reordered-dom.txt；截图位于screenshots的first-frame-optional-with-owned-image.jpg、mixed-image-video-audio.jpg、mixed-reference-reordered.jpg、two-frame-optional.jpg、two-frame-reordered.jpg。comparison.json的V02/V03/V04更新为partial-observation，专用首尾必需、数量边界、文字引用映射和其他上游操作仍待完成，没有标整项通过。

## 2026-10-14 固定本地上游实操补证（Task14仍进行中）

固定IC源码68b37db运行于loopback15372/15373，独立SQLite和虚构账号，实际页面v0.8.1且GitHub指向tigerowo。入口辅助文件仅改变监听为127.0.0.1；Next dev生成next-env.d.ts已记录。视频节点实际竖屏/10秒已观察并保存video-node-portrait-10s-painted.jpg；摄影面板显示Panavision DXL2/ARRI Signature Prime/50mm/f4，开关处于当时CSS视口外，未成功启用，camera-panel-toggle-attempt.jpg不能当启用证据。隐藏页面即时截图曾出现旧6秒画面，保留并命名immediate-frame，最终10秒以实际重绘截图证明。

固定Toonflow源码ae9e5f运行于loopback15374/3000，独立data/workspaces，无真实供应商密钥。createApp外部辅助入口补上原index的initializeMcpRuntime及startMobileLinkRuntime：此前403是缺运行时初始化，不能归为Windows不支持。原MCP仍监听loopback10588且授权规则保持，mobileLink.enabled=false，不开启共享监听。用原生server生产模式获得浏览器工作区选择；开发模式会调用Windows文件夹窗口，本次没有操作该原生窗口。Bun/Vite生成router.ts和components.d.ts记录为构建生成差异，不称源码完全无改动。

真实浏览器创建canvas-video-comparison空文件夹与项目，新增视频生成节点，写入三行原创镜头/两句对白；16:9、720p、10秒及生成音频false在刷新后和工作区JSON一致。无引用时选混合参考会归一回文生；固定源码index.vue的compatibleModes要求至少一个有效媒体，不能把无输入的切换当成功。原生模型目录此时显示Seedance-2.5，仅是该参考环境目录，Naumi继续用管理员已发布且有来源的能力。

使用本任务原创landscape-4-audio.mp4实操替换视频和播放，真实video元素1280×720、4秒、readyState4；已查看彩条截图。提取音轨、裁剪1—3秒、截取尾帧、分离音视频均生成真实独立节点并保留原视频。FFprobe输出分别为audio-only约4.01秒、video+audio2秒、1280×720 PNG、video-only4秒及audio-only约4.01秒；导入文件与原创输入SHA相同。原视频、音轨、裁剪、尾帧刷新恢复；历史实际列出当前导入结果。没有按生成视频按钮，没有真实视频API消费。

证据在忽略output/canvas-video-fusion-20261013/reference/toonAe9e5f：media-probes.json、derived-media-dom.txt及screenshots/{video-node-original-media,audio-extracted,clip-two-seconds,tail-frame-audio-clip,history-current,full-derived-media}.png。full-derived-media截图已查看；原生适应视图仍有顶部/底部控件贴边，不宣称同一1440px视口或全部控件可见。机器可读scripts/video-fusion/comparison.json覆盖V01—V24，每项明确partial-observation或not-observed及Naumi对应证据前缀，不能当最终通过矩阵。

仍需首尾及混合引用排序、多镜头/元素/运动、Agent制作规则、批量/停止/下游复用等剩余固定上游操作；P01—P08/S01/S02继续由完整应用验收及保护证据证明。Task14未完成，103未发布。

后续IC同素材实操：原创landscape-4-audio.mp4实际上传到原视频节点，播放器真实解码1280×720/4秒/readyState4，播放及放大预览已操作并保存original-video-import.png/original-video-preview.png。分离音频出现新音频节点但上传状态仍等待，尚不称持久输出成功。收起左侧面板后摄影开关进入视口，已实际勾选，DOM同时显示开启及switch checked，新增camera-enabled-actual.png，纠正初次未启用的限制记录；两个阶段截图均保留，不覆盖失败证据。

主线95b43c5的Docker workflow38508694578已success；Image gateway38508694570的Linux build、计费回归和模型执行步骤已success，整条流水线当时仍in_progress。只证明对应构建/回归，不代表完整视频固定运行时、候选切流或103发布。

本记录正在进行，Task14尚未完成。固定来源仍为tigerowo/infinite-canvas `68b37db04b9083c3ff0af67ffe362f85d04d1f9f`及HBAI-Ltd/Toonflow-app `ae9e5f`开头的既定快照，不因在线站版本不同扩大或缩小原34项范围。

2026-10-14通过Codex实际浏览器打开IC README候选入口`https://infinite-canvas-cpco.onrender.com/`。页面可以操作，标示v0.12.0，GitHub链接实际指向basketikun/infinite-canvas；在线部署commit未知，不能认定与用户指定tigerowo固定快照一致。因此以下是候选演示观察，固定源码本地实操仍需补齐。

实操步骤和观察：

- 进入视频创作台，打开参数抽屉，点击竖屏720×1280及10s；实际W/H/秒数控件同步为720/1280/10，抽屉和主页面一致。
- 进入画布库并创建本次空白比对画布，点击视频工具实际新增一个视频节点；节点参数沿用刚才的720p/竖屏/10s。
- 输入本次原创的三行镜头/两句对白，实际节点保留全部三行；点击参数摘要，弹出可编辑规格面板。没有点击生成或配置供应商凭据。
- 视频创作台显示图片/视频/音频引用入口及当下模型对应限制9/3/3；这只是此站此模型当前显示，Naumi继续按已发布且有来源的模型能力决定限制，不能把这些数字写成全局上限。

两张浏览器截图已在本会话工具输出中查看；持久文件副本和完整逐项映射仍待补齐，不能把本记录称为全矩阵截图证据。比对画布URL为`https://infinite-canvas-cpco.onrender.com/canvas/kYaQAP6vaW7ir2rrMOyZU`，当前仅本次原创测试内容，没有传Naumi账号、密钥或业务素材。Naumi对应的实际浏览器证据包括canvas-browser-2494ea71、workbench-29e6b608及byoc-browser-6064d70f；各自测试范围见界面模块记录。

Toonflow官方README链接`https://api.toonflow.net/`实际打开标题TF-Router，并显示腾讯滑块验证码。未解验证码、未登录、未填凭据；该链接本来是模型平台，不能当作已进入画布演示。后续使用已批准的固定上游本地隔离实操，不将此限制记成画布通过。

下一步：启动固定版本且无正式凭据的本地上游，完成模式/首尾/引用排序/高级分镜元素/工作流/历史媒体及Agent制作规则的可操作对照，填写计划中的comparison.json；无法以额度模拟真实视频效果的部分继续明确区分，不用当前有限在线观察代替完整34项验收。
