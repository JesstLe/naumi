# 画布图片上传：浏览器 bitmap 兼容修复

- 用户截图：PNG添加后0成功，createImageBitmap options.imageOrientation from-image被当前浏览器拒绝。
- 实际src/lib/browser-reference-image.ts decodedImage传显式枚举，prepareOriginalImage/prepareReferenceImage共用，导致归档预览与超限参考图本地适配中断，不是供应商生成/计费故障。
- 最小修复：createImageBitmap(file)采用浏览器默认EXIF行为；存在API但解码拒绝时回落Image.decode。原图File/字节、尺寸/预算/透明度和媒体鉴权保持，DOM对象URL正确释放，损坏图片仍报错。
- 独立codex/upload-bitmap-compat-20261021，base882194df。只改共享纯helper，测试和文档；不碰canvas-client/供应商/Worker/模型配置。
- T3实际浏览器25项：旧归档/参考同报错复现；PNG/JPEG/WebP/EXIF预览、透明参考/比例/原始hash/批量File身份、枚举拒绝、bitmap异常及缺失DOM回落、EXIF实际像素方向、URL释放、损坏图拒绝通过。
- 真实旧实际handler+隔离PG121项通过，供应商0。全量tsc exit0。实际浏览器原上传/参考提交全链fixture补验中；新构建/线上验收另记录。
- 只读发现47正有release47-image-delivery-20261021 SWITCHED，已协调原发布负责人，当前不并行持锁或候选。

## 集中验收补充
- 实际浏览器旧handler/隔离PG全链19项PASS：14,180,694bytes原图归档/原始SHA与预览、预算/透明/EXIF、原图画幅/多图角色/显式比例、切换取消与单图错误隔离。外部供应商0。
- 原19项fixture曾因“同receipt第二次提交不发POST”过时断言失败：main已删除旧receipt去重，每次显式调用创建新UUID，当前真实两个POST各独立ID。仅修正测试断言与现有语义一致，不变更生产提交/重试/计费逻辑，保留初次失败记录。
- 可重跑actual模块检查verify-bitmap-compat.cjs基线复现，修改支持默认bitmap/API拒绝DOM/API缺失DOM、资源释放与原始字节保护；浏览器25项另证真实像素/EXIF。
- 固定源码6bf829bd Linux完整Next15.5.27生产构建90/90页通过（继承warnings，exit0），tsc0。之后提交仅测试/文档，不改产品helper。
- 47原发布负责人仍在收尾delivery并准备扫描范围修正后继，已请求将6bf829bd纳入同一新固定候选，不并行创建候选/切流。上线状态以最终统一发布回执为准，当前本任务产品未上线。
