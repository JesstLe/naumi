# R6Z：主线图片稳定性／性能修复接入既有 owners

## 固定输入与当前状态

基线 `ad5ab489aa629e998f9b80966b432704a5ffd089`，完整4844文件SHA与原始归档保存在 `output/refactor-r6z-20261028/BASELINE.json` / `BASELINE_SOURCE.tar`。固定 main `b6b5af3b1b2cc3d7f9519e0035623f01cb5342b4`，6条提交／26路径。5处冲突的三个stage原文完整保留，不恢复旧HTTP route、db或Canvas巨石。

本轮先关闭前置主线整合，再继续模板／工作流导入owner。导入owner尚未实施，不以本轮主线修复代替它或宣布整个重构完成；不合main、不部署，整体active。

## 归属与实际实现

- main解码复用进入既有 `complete-image-delivery`／`readCanvasOutput`，每图try/finally释放局部字节context；现有Buffer转换、原价、存储故障后续交与任务账务保持。仅缓存内联字节，managed对象每次仍检查当前访问。默认输入读取也用有界Buffer视图，避免无必要整块复制；不建立进程级媒体缓存。
- 项目封面保留及缩略图归已有 `CanvasProjectBrowser`，主组件只提供可见性和account/workspace key，不把主线旧项目列表JSX搬回Canvas。原作品读取失败状态、完整节点投影与history owner保持。
- 视频due-time与取消竞态SQL进入唯一 `video/task-polling`，db兼容出口字节不变。真正checkout故障与正常busy分开，初始锁之前可确定未执行的情况退休观察后仍抛错；UNKNOWN不清除。
- `workflow`／`media-jobs`接main原coordination观察包装，保留既有direct Worker defer及显式schema owner；没有恢复Web重型执行。
- placement只替换实际几何owner。验证保留基线allocator原函数及原stable-placement为只读reference，700随机位置／70血缘图做原字节行为对照；reference不参与产品。

## 验证设计与尚待执行

复用main已有图片稳定性、placement和视频性能验证，路径改到真实owner；旧HTTP helper依赖的解码verifier按当前共享Buffer链执行，旧版本分支原样留存。新增4入口进入原core catalog，现94项；每case绑定独占输出目录，不覆盖历史默认证据。计划集中验证真实PG、同机placement浏览器对照、真实组件缓存及相邻交付／项目／协调／类型与依赖边界；未执行的结果不记PASS。

模块内无新业务确认、限额、任务／账务／历史引擎。完整候选Linux镜像与运行验收、原始副本回滚、四产物／提交／远端以本轮实际DELIVERY为准。100k为建设目标，不是本轮微基准或局部回归已证明的容量。

## 第一轮集中结果

原图字节与访问合同基线9组／新版12组均通过；这是实际共享Buffer读取／冻结变换的对照，不冒充旧route helper执行。图片稳定性旧6检查按预期复现（BASELINE=REPRODUCED，exit1是原脚本的缺陷基线退出约定），新版14检查通过，实际组件缩放空白帧0、返回封面保留已解码DOM且新图片请求0。

placement700随机／70血缘图／6组与原坐标精确一致；同机浏览器18交错样本完成，原坐标和已保存位置保持，不据微基准推断全站INP／容量。真实PG视频性能17组、协调9组、交付73检查、项目静态19检查和全项目TypeScript均exit0。交付6处SQL／存储断点、原结果继续、无供应商提交与单次账务保持。

初始验证准备遗漏MAX_GENERATION_DIMENSION及原background观察新增的worker/inflight依赖，原失败日志保留；已分别加载实际原常量和真实inflight模块后复测。产品未因此改回旧单体、删断言或伪装成功。94固定源码core／完整Linux候选尚待本轮集中执行。

29文件ESLint修复fixture局部module变量命名后exit0，9个既有／主线warning保留；原失败literal未覆盖。实际源码四类SCC均0。

首次固定e589 core在新增图片组件夹具第4项终止（3通过／1失败／90未运行），真实日志保留。原因是core为服务端测试继承react-server，夹具require.resolve把DOM入口解析为无createRoot的RSC文件。已在浏览器夹具中显式选择同一已安装React包的浏览器入口，不替换产品组件或应用源码；修正后集中重测，原失败不改写。
