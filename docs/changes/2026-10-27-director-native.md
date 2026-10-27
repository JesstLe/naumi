# 原生3D导演台实施记录

## 目标、基线与流程

- 基线：`main@fb5dfe80810ed1d796c6050e5487b92e6fa02c1d`，独立工作区`E:/Workspace/naumi-canvas-director-native-20261027`。
- 上游流程：`infinite-canvas@68b37db04b9083c3ff0af67ffe362f85d04d1f9f`的场景/角色→姿态→机位→关键帧预演→工程保存→截图/视频回画布。上游iframe只用作能力调研，不进入实现。
- Naumi现有`/studio3d`是瓶罐/包装产品工作台，保持原状。复用Three.js、原画布项目、操作幂等/版本、私有媒体登记和视频引用，不复制上游账号、存储或任务体系。

## 模块职责与选定实现

1. `lib/director`拥有可序列化工程、姿态/关键帧插值及Three.js预演/图像/视频输出；纯工程规则不依赖React、DB或供应商。
2. `lib/canvas/director-node-*`拥有导演节点、工程快照、项目归属、并发版本与输出关联。保存/复制/删除/撤销复用原画布事务与操作身份；工程存在服务端，不只存在浏览器。
3. `components/canvas/director`拥有浅色原生编辑器和轻量画布节点；只在编辑时加载WebGL，不为每个画布缩略节点创建渲染器。
4. 角色采用可编辑的关节人形与姿态预设，场景包含几何物体、地面、背景与画布图片全景；机位独立命名保存，关键帧记录相机及物体变换并插值。它服务镜头预演，不把程序角色冒充生成的真实人物模型。
5. PNG与浏览器录制的视频沿现有媒体上传/素材登记链回到同一项目，输出关联回导演节点，可继续通过现有@、连线和视频生成复用；本地渲染不走模型收费任务。
6. 编辑器保留未保存草稿；版本冲突明确反馈，不覆盖另一窗口修改。关闭、导出和账号/项目切换处理保存及录制取消。

## 实施状态

- [x] 工程规则、节点持久化与请求边界。
- [x] 角色/场景/姿态/机位编辑和关键帧预演。
- [x] 原画布入口、项目列表及混合复制/删除/撤销的事务接入；真实画布菜单新建、拖动、撤销/重做、创建副本、删除/恢复均已补验。
- [x] 图像和视频输出、媒体关联与后续引用；完整本地应用闭环已通过。
- [x] 集中规则/DB/API/真实WebGL/媒体验收，以及相邻视频引用和最新main的Worker/media定向回归。
- [ ] 独立副本回滚与四项交付归档、main合并推送及任务资源收尾。

原始基线归档：`E:/Workspace/naumi/output/canvas-director-native-20261027/ORIGINAL.zip`，SHA256 `18794ec7bea9fab238e827f73cd43a8219b8613e2647ed26084b180e293c1ddc`。

服务器暂缓发布保持；上一视频任务清理命令被执行环境拦截，已合并的干净工作区/分支暂保留。本记录随实现更新；待验证项不写成完成。

## 已落地的接口和状态归属

- `directorProjectSchema`定义版本1工程；角色、几何物体、关节、相机、时间和关键帧由纯规则验证。提示词、供应商和计费不进入工程模型。
- `/api/canvas/director-nodes`及`/[id]`保存工程与位置；`expectedRevision`防止多窗口覆盖，`operationId`保留重放身份。服务端使用已有画布项目注册与创作归属；历史内部表名`app_canvas_video_projects`仍作共享注册，不新建第二套项目体系。
- 新表`app_canvas_director_nodes`、`app_canvas_director_operations`为增量创建，旧节点/任务表和计费字段不迁移。节点操作沿既有图锁和事务，混合历史一次提交；项目删除同时覆盖导演节点。
- 混合复制重映射一起复制的背景图片身份，保留工程，清空副本输出关联；不重放历史渲染或付费任务。共享锁/层级沿用原节点设置。
- `/[id]/outputs`只关联同一画布的已完成、实际解码过的自有媒体；校验类型、哈希来源、并发版本以及事务内媒体仍未改变。输出不成为一套新作品系统。
- 编辑器草稿按账号/项目/节点隔离，短暂缓存仅用于未保存恢复；服务端工程是已提交状态。保存失败保持草稿，读取最新工程是显式操作，旧草稿仍可撤销找回或下载。
- 三维资源释放提取为`lib/three/dispose.ts`，产品工作台保留原`disposeObject`导出和行为；没有移植上游iframe。

## 真实渲染与视频收尾

1. 只检查MediaRecorder生成了Blob或文件有时长，曾掩盖“只有一帧”的问题；此检查没有作为最终通过证据。
2. 当前优先使用浏览器WebCodecs离线逐帧编码VP8/VP9；相机/物体按关键帧采样，写入WebM时间戳、时长和seek cues，渲染速度不改变片长或丢弃中间帧。现代浏览器的该路径以24fps输出。
3. 不具备WebCodecs的浏览器保留MediaRecorder逐帧请求和文件头时长收尾路径，其帧率受设备实时渲染速度影响，不宣称所有设备都能达到24fps。
4. PNG与WebM沿现有`video/references → video/assets`上传、登记；在原项目出现并关联回导演节点。需要重试时保留同一已生成文件及关联操作，不因关联失败重造已登记素材。

## 集中验收证据

证据目录：`E:/Workspace/naumi/output/canvas-director-native-20261027`。

| 验收 | 当前实际结果 |
|---|---|
| `node scripts/verify-director-native.cjs BASELINE <baseline>` | PASS：原菜单导演台禁用、原生编辑器不存在、产品工作台独立保留 |
| `node scripts/verify-director-native.cjs MODIFIED .` | PASS：30项规则，工程/身份/关节/相机轨隔离、插值最短角、资源释放、WebM时长、菜单权限 |
| `node scripts/verify-director-native-ui.cjs . <browser>` | PASS：实际React组件/Three.js/Chromium，姿态/场景/机位/关键帧、保存刷新和冲突草稿、取消无产物、390px/英文/只读；pageerror0、外部请求0 |
| 原生视频实际解码 | FFprobe确认1280×720、24fps、48帧、2.000000秒；FFmpeg逐帧MD5确认画面变化，不只核验元数据 |
| `node --conditions=react-server --import tsx scripts/verify-director-native-application.ts <application-final>` | PASS：真实Next/PG/浏览器WebGL/媒体存储/Worker/账务，创建与重放、并发仅一方成功、混合复制/删除/恢复/原子失败、跨账号404、PNG/WebM哈希、保存刷新、两份输出同时进入后续视频任务；真实UI菜单新建、拖动、撤销/重做、创建副本、删除/恢复 |
| 390px真实应用 | PASS：等待WebGL画布可见、输出按钮就绪后，操作对象列表与属性抽屉并截图；旧版立即截图曾停在加载状态，不作为最终视觉证据 |
| `node scripts/verify-video-native-references.cjs MODIFIED .` | PASS：120种引用混排、稳定身份、移除后失效、命名往返、旧wire及false/0/未知值保留 |
| `node --conditions=react-server --import tsx scripts/verify-video-fusion-client-settings.ts` | PASS：默认配置、引用角色、完整提示词、显式规格变化和回执身份 |
| `node --conditions=react-server --import tsx scripts/verify-p0-media-recovery.ts` | PASS：慢媒体任务隔离、single-flight、持久租约、排空、失败可见及重试 |
| `node --test scripts/test-worker-runtime.mjs scripts/test-worker-recovery-process.mjs` | PASS：26项；包含真实本地Worker子进程重启与UNKNOWN暂停，HTTP边界为回环fixture，无供应商消费 |
| 类型与lint | `tsc --noEmit --incremental false` exit0；新模块`eslint --max-warnings 0` exit0；受影响既有接线`eslint --quiet` exit0，不把既有warning说成全量无告警 |
| 本地渲染和后续生成的边界 | 渲染/上传积分变化0；后续视频任务复用现有计费链，模拟供应商创建1次，真实付费调用0；不代表真实上游质量/额度或线上验收 |

首次缺时长、解码只有一帧/7帧、只读隐藏定位器、短片取消定位竞态、Next开发模式冷路由等待失败均保留原始日志。最终应用验收在固定源码和预热路由后执行，不通过重放真实业务任务解决测试问题。

主线在开发期间出现`p0-worker-media-recovery-20261027`的新提交，已普通合并至`e2217c983fe74f4829f2cacb3f69305428af0b11`并重验受影响媒体/Worker链。之后`origin/main@9e8feb6d7d9a96a632dbe8f7e4a2566e9b950b19`仅追加同事P0发布记录，源码与本次验收基线相同；合入前继续刷新并普通整合，不覆盖这份发布记录。

最新证据为`application-final/`，其中桌面/390px/画布图及真实PNG/WebM均存在；移动端和画布截图已重开目视检查，视频以FFprobe实际解码确认为48帧，FFmpeg逐帧MD5显示运动。此前`application-synced/actual-editor-mobile.png`只拍到加载状态，保留为历史，不用作最终移动端验收。

画布位置保存期间以导演节点pending队列暂缓undo/redo和修改菜单，避免保存回执未落地就撤销；节点`data-revision`用于验收实际保存版本，不改变服务端版本语义。Python观察器首次打印Node测试的Unicode勾号时遭遇GBK编码错误；测试已实际exit0，完整日志已保存，改为UTF-8后复用已完成记录继续，不重跑已完成测试冒充修复。
