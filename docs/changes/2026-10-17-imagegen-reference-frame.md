# 图像创作：主体替换沿用参考图画幅

## 业务规则与问题

用户明确：产品图用于替换参考海报主体时，产品图提供主体，参考图提供输出画幅。不能按第一张上传素材的尺寸决定，也不要求用户为唯一参考图再点击一次。

此前47只读调查的产品图为1500×1500，参考海报750×1000，原请求auto而子任务解析为1:1，结果实际1254×1254。此文不包含用户原图/账号/凭据，不将历史调查当成本轮线上验证。

## 本模块完成

- 初始有素材默认沿用素材比例；无素材维持原1:1，可明确选择模型auto。
- 默认用途、多图合成、商品样机及广告用途下，唯一reference自动成为画幅来源，产品/edit-target或insert不抢占画幅；按角色而非顺序、提示词关键词或长宽猜测。
- 多张reference需要选定画幅来源。风格参考style不当作版式；明确风格迁移/物体编辑等用途和带蒙版编辑默认保留edit-target。单图保留该图画幅。
- 用户可手动覆盖素材来源或固定比例，所选身份绑定artworkId，重排不丢失；移除已手选素材阻止提交，不悄悄回退产品图。
- 真实素材宽高约分为比例，并用模型目录校验。切换不支持该比例的模型时保留选择并提示，不静默改成方图。像素尺寸仍由分辨率档位决定，不承诺与参考图像素数相同。
- 在原parameters.ratio字段发送解析后的明确比例，API schema/角色/原提示词不变。预览确认显示比例与来源。真实CachedImage onLoad读取尺寸，无第二份业务媒体存储。
- 本地格式/尺寸处理不套用生图画幅选择。收费确认、提交幂等、未知回执恢复、交付去重、下载与蒙版编辑器函数原样保留。

## 验收与证据

独立分支codex/imagegen-frame-choice-20261017，基线e4c4e356942b2ea1aefd6b0ad210dfdc2072d6bb。模块集中验证：32项helper/AST检查，真实ImagegenPanel的19项浏览器检查，旧组件基线2项、单图、多参考及本地处理独立浏览器场景，全量TypeScript。供应商调用0。

本机fixture打包真实组件、schema、client、CSS与CachedImage；仅鉴权/模型目录和回环API替身，不是正式后端验收。一笔确认POST为本地替身。

完整命令、字面输出、初始哈希、回滚副本及四产物在output/imagegen-frame-choice-20261017/VERIFICATION.txt。真实组件截图reference-frame-ui.png。

## 服务端补齐：Agent / auto 请求

青萝历史请求经过imagegen规划，单改UI不足以修复该入口。本模块追加plan.ts：使用现有已鉴权、已解码的素材尺寸，在报价与冻结步骤之前将auto/缺省比例解析为唯一reference原始比例。显式ratio及width/height优先，cutout/postprocess跳过，mask/显式目标编辑用途保留target。多参考歧义在报价前报错，不按上传顺序猜测。

请求原始fingerprint在解析前计算，持久计划保留解析后的比例；调用方原对象不变，重复原auto请求仍使用原fingerprint，已接受旧计划不重新解析。不修改收费确认、dispatch、generation-core、Worker；真实generation-core适配器在本机隔离测试中输出ratio=3:4与两张输入的FormData。schema不变。

新增真实plan+generation-core隔离测试24项，Sharp解码1500²及750×1000测试PNG，分别验证Agent/重排/显式9:16/风格/蒙版/多参考/原始fingerprint/冻结计划重入/实际FormData。模拟鉴权/模型/报价及内部handler，供应商0，不当作真实PG持久任务/付费生图证据。

## 尚未完成与发布边界

- 本分支包含图像创作面板、画幅helper及imagegen plan；不修改canvas-client、generate-image、imagegen schema/dispatch/generation-core、Worker或共享未提交工作。
- 旧画布直接调用generate-image的auto策略未由本模块修复；imagegen Agent/canvas/workbench共享plan均使用角色解析。不能称全站所有旧入口比例全部修复。
- 尚未上线47，真实供应商是否遵守输出比例与最终落盘尺寸未在本轮重跑。现有历史方图不重放、不改写。
- 交统一窗口整合后，需刷新main、固定完整版本，并按三锁蓝绿、真实请求链与Worker恢复验收。无本轮SSH/锁/候选/切流动作。

## 同步记录

开工与本模块验收刷新origin/main，均e4c4e356；独立worktree，不改共享checkout。模块计数1，未累计3次；提交前再次fetch核验。
