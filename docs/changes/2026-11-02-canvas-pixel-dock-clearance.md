# 图片原图像素标签与Dock避让

## 问题与职责

用户截图中的图片标题/原图像素位于图片上方，却被横向快捷工具条遮住。真实Next/React Flow基线1438×659、zoom1复现：像素标签与toolbar相交589.84px²，标题行相交9440px²。

根因不是像素数据：ArtNode标题在节点之外`top:-38px; height:30px`且随画布zoom缩放；render和live gesture两入口只有视频预留标题高度，图片给0。工具条还按46px常量定位，实际49.5px。原像素组件、图片metadata和计费均不改。

## 最小实现

- `canvasImageTitleInset(zoom)`将38px节点坐标转为屏幕坐标，render读取当前viewport，live手势使用传入vp.zoom。
- 图片明确opt-in `protectNodeTitle`；工具条按真实测量高定位，composer上侧预留同一高度与间距。
- 最终布局检查标题保护带，不只检查首选位置。优先把可滚动composer和工具条放在标题上方，其次分布于图片上下，空间不足保留标题可见。
- `dockMinimumHeight`由真实header+footer+50px可编辑区测量，避免手机多行参数把生成按钮裁掉；ResizeObserver同时观察header/footer。仅已有选择/窗口尺寸变化的视口安全区计算纳入标题，不在普通拖动时自动移动画布。
- 不提高标题z-index，不把尺寸标签盖到工具按钮上，不改节点坐标存储、原图尺寸、供应商参数、报价/冻结任务。

## 验证与边界

独立分支仍只103，禁止合main/47。新模块基线8868df04；开工fetch后main56453c50工具修复已普通合入，合并提交a4f675c7，没有反向整合。

- 实际render/live函数调用：基线2项重叠复现exit1，修改后3档zoom×2入口6项通过。
- 原图标题专用几何555组合通过，非opt-in原1920几何逐值不变，composer/toolbar原2625碰撞回归通过。
- 真实Next UI覆盖用户1438×659、1440×900、390×844、竖图，50/100/200%缩放、实际拖动、长标题/原像素完整、生成按钮在shell可见。最终结果路径output/canvas-pixel-dock-20261102/。
- 初版仅标题避让时短屏composer盖住图片；第二版收窄composer时手机footer把生成按钮裁掉。均保留截图反例，按真实最小高度修正，不把标题不重叠当完整交互验收。
- 当前空间放不下完整大图和所有面板时，面板仍可能覆盖部分图像；标题/像素与提交控件保持可见。未用静默缩放/改图片尺寸掩盖布局。

## 数据与接口归属

`dock-layout`是纯屏幕坐标布局，`CanvasClient`拥有实际DOM测量和选择/viewport桥接。无网络、DB或新状态平台；视频/文本/空白节点沿原未opt-in几何。对应动作按钮业务和新后台生成任务保持。

四产物、独立副本回滚、固定构建及103真实部署在收尾追加；本地fixture不是线上验收。


## 最终交付：103已上线

固定程序0fcbbc8084b1c483cb66be541643142e90283da7/build1793587166，Web/Worker同imagee82498413f0666321f6b62a64397eff55db2c180c3f5220b385965d636953241。91页Linux构建、37资源smoke通过；隔离分支已推，main未反合、47未写。

release103-mapping-pixel-dock-20261102-r1于2026-11-02北京时间10:56:10 COMPLETE；新Webf782c574/13109、新Worker6f33a1a8，旧background两实例排空停止restart=no。旧网页跨切流保存200、新网页准确读回，原配置和任务preservation通过。10:58只读复核canonical339、7容器、两锁free、HTTP200/db.ok=true、可用磁盘约36.9GiB。

真实103浏览器两屏×50/100/200%六项通过，使用上一模块已生成QA图片，无mock API：原图尺寸/标题不被toolbar或Dock遮住，生成按钮完整可点，原两任务回执和积分不变。新生成0/取消0/退款0/节点写0。截图、bbox与响应hash在output/canvas-pixel-dock-20261102/real103-r1，FINAL_ACCEPTANCE.json分层收据已重开。

四件proof/MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh：另一个完整副本恢复3原hash、删除4新增，再现旧render/live标题遮挡；正式产品保留修复态。后写入doc收尾不重新构建/发布。
