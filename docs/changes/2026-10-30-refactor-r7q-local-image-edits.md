# R7Q：本地图像编辑意图与结果应用

## 基线与目标

独立 `codex/core-refactor-20261024`，原字节基线 `cda247b2a99fd480709e76dabf9d67f276cb9511`。原5101文件/hash及归档已保存，副本在C盘；不覆盖上一片硬链接归档。开工刷新origin/main至4038b061，当前片不混入其Canvas fan-out/分组/文字及容量整模块；主线同步计数由R7P的1推进至本片2，下一功能片按三模块周期整合，未把fetch记成merge。

上一片原函数VM已经复现：A裁剪在途切B后，迟到结果仍在B设置pending导航与selectedId。不是线上跨租户写入结论。此次将意图、busy、原请求与已知结果续交归应用owner，组件只负责控件和展示组装。

## 职责和接口

- `canvas/local-image-edits`：按已有CanvasDocumentScope隔离crop菜单、busy和原尝试。公开`bind`、openCrop/close、execute、requestReplacement/replace、subscribe/getSnapshot；没有新历史、任务、队列或计费系统。
- `use-canvas-local-image-edits`：薄React订阅。原生文件input仍由组件持DOM ref，选定File立即交owner并清空input；迟到finally不清B的新文件选择。
- 原`canvas-local-image-edit`继续拥有像素处理、不可变作品写入、SQL事务和operation幂等；只把原`art-local-${operationId}`映射收敛为共享纯叶函数，输出ID不变。
- 原artwork-document拥有结果合并，原history.record拥有单条add历史；workflow-placeholder仍委托原workflowDocument.fill。
- 应用请求使用已有document headers，在异步认证后、真正POST前再校验视图/账号。结果可归原文档但不抢新视图；已知结果同步失败保留原ID，后续只恢复结果合并和history，不再提交。
- 未知响应只通过已有授权作品读取查询确定的原结果ID；缺行、失败或超时继续unknown，不借此重POST。没有增加后台GET协议、改价、降质量或素材裁切。
- 文件意图在原12MiB界内包含真实SHA256，不再把同名/同大小/同lastModified但不同内容的文件误认成同一操作。

## 验证状态

本片集中验证已取得以下实际结果，固定同SHA受影响矩阵与最终封存另见 `output/refactor-r7q-20261030/DELIVERY.json`：

- 原Canvas函数14场景/33检查，复现A迟到改B、同步失败再POST、未知缺行再POST；新实际Canvas薄入口与完整owner覆盖原10组共同请求/历史/选中/文案精确轨迹，同时增加作用域、认证前取消、File真实内容区分、history副作用后异常续交。最终场景/检查数以同目录MODIFIED和RESULT为准。
- 真实PG15检查：实际POST/GET route、实际owner/artwork-document/history-controller、实际裁剪像素与SQL事务。两笔本地编辑仅2次POST、3次结果GET、2条add历史；已知结果同步失败及lost ACK均不重复POST，原图SHA不变，跨账号结果不可读、匿名401，consume0/supplier0。传输为直接真实handler适配，存储为独立临时私有本地目录，不是生产验收。
- 实际Next/React hook6检查：真实裁剪参数、保存后同步失败/原结果重试、undo/redo、原生file chooser替换、浏览器Back→项目B以及A迟到结果不抢B；HTTP为既有loopback fixture及明确local-edit适配，PG另验，pageerror0/外网0。
- 原节点像素测试通过：4×3准确裁剪、EXIF6×8、最后像素1×1、无效媒体拒绝；原主要图片编排57场景/129检查、文字生图58场景/203检查均保持。
- tsc和lint通过，原有39warnings；旧UI库存脚本只把实际endpoint检查扩到新owner，未弱化控件/锁定/样式/历史断言。

实际页面发现并修正的产品边界：返回项目网格时activeKey仍保留，单用document view还不足以移除裁剪遮罩。现将原`importViewCurrent`身份传入owner，crop显示及迟到应用都认同一个既有视图，不添加新epoch/全局状态。

失败证据保留：首个offline夹具用了esbuild同步plugins（执行前失败）；首次PG fixture使用短SETTINGS_SECRET并在返回前抛错，已终止确切自有进程、删除其唯一随机schema和空临时media；verifier的ArtworkRecord类型用原artworkRows边界修正。两次原生夹具定位/文案假设错误（期待原始错误而实际为净化错误、composer遮挡原图）与一次真实crop遮罩失效失败均保留，不改产品规则换绿。

原R7P整版scene入口及远端账户门禁继续OPEN。当前catalog134只是库存；本片以选定受影响条目完整执行，不冒称134全跑或关闭旧scene失败。

## 剩余

完成集中验收、固定Git、完整四产物和独立副本回滚、更新整体状态；完整目标仍ACTIVE，未合main未部署，47 HOLD。
