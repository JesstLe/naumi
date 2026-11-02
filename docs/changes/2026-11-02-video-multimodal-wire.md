# 视频节点全能参考：独立 v3 执行协议

## 模块与职责

- 基线：`2b990949421214802ae900e34f2baf6869f78443`；同任务隔离工作区 `codex/canvas-video-modes-20261102`。
- 本切片只负责具体供应通道的多模态能力声明、纯协议校验与 wire 编译；复用既有媒体归属/真实探测、签名材料化、提交租约、冻结快照、任务恢复与账务。
- 新公共数据导出：`MULTIMODAL_VIDEO_FAMILIES`，每项保留 `providerId/model/publicId/profile/definition/documentation/smokeInput`。主任务负责选择性配置升级、管理员入口与 UI 接线，不在本文件中发布配置。
- 依赖方向：能力静态声明 → v3 输入验证和协议编译 → 既有 `buildVideoCreate`/HTTP adapter。codec 不访问 DB，不读取密钥，不自己创建、重试或结算任务。

## 来源与实装范围

2026-11-02 实际 GET 11 份公开 Markdown 文档，全部 HTTP 200。正文保存在 `E:/Workspace/naumi/output/canvas-video-modes-20261102/wire-docs/`，`SOURCES.json` 记录逐文件 SHA256；新 JSON 内嵌相同 URL/hash，不引用线上凭据或付费样本。

| 通道/型号 | 新 profile | 已接多模态 wire |
| --- | --- | --- |
| APIB Seedance 2.0、fast、mini | `apib-video-v3` | `image_urls` + `video_urls` + `audio_urls`；9/3/3；参考音频需图片或视频 |
| APIB Seedance 2.5 | `apib-video-v3` | 30/10/10；视频、音频各总 ≤30s；纯音频参考可用；明确发送 `omni_reference_task_type=reference` |
| APIB Kling v3 Omni | `apib-video-v3` | `video_list` 的 `refer_type=feature`；最多1视频，独立音频仍不开放；图片与视频混合时需明确一张首帧 |
| APIB Wan3 standard/prime | `apib-video-v3` | 10/5/5；图片用 `reference_image`，明确 `generation_type=reference`；输入视频总时长＋输出时长 ≤30s |
| APIB H3/H3-Max | `apib-video-v3` | 9/3/3；参考音频需视觉；首尾帧字段与普通引用数组分开 |
| Geek Wan3 | `geek-wan3-v3` | `mode=all-reference`、`images`、`metadata.reference_video_urls/reference_audio_urls`；10/5/5 |
| Geek H3 | `geek-h3-v3` | 公共 `/v1/videos` 的 `content[]`；保留顺序和 `reference_image/video/audio`；9/3/3，合计 ≤12 |

Kling 的公开文档没有给出可确认的普通参考图片完整上限，本切片保留既有管理员能力声明的 `images=2`，没有凭其他同名协议推成7张；`video_list` 新声明仅表达文档确证的1视频。Geek 的 `kling-...-noref-...` 与 `...-ref-...` 是精确 SKU，此次没有借 APIB 文档扩大这些型号能力。

公开来源：
- `https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md`
- `https://docs.apimart.ai/en/api-reference/videos/seedance-2-5/generation.md`
- `https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation.md`
- `https://docs.apimart.ai/en/api-reference/videos/wan3.0-video/generation.md`
- `https://docs.apimart.ai/en/api-reference/videos/minimax-h3/generation.md`
- `https://docs.apimart.ai/en/api-reference/videos/minimax-h3/max.md`
- Geek `videos/wan3/{generation,overview}.md`、`videos/minimax-h3/{generation,overview}.md`、`videos/model-matrix.md`。

## 规则、迁移与历史保持

- 新 v3 profile 只对新发布配置生效；旧 `apib-video-v2/geek-video-v2/geek-h3-v2` 以及原声明 JSON 字节不改。历史恢复继续使用冻结 profile，不升级旧任务，不重新采购。
- 所有媒体保留顺序、真实 URL 和角色；不裁切、不截断、不默默忽略输入，也不把普通参考图按数组位置猜成首尾帧。
- 参考视频/音频必须已有真实时长；真实产品在预占前完成 `authorizeVideoReferences` 服务器探测、再调用 codec。新 codec 检查相应通道最短/最长/总时长、已声明字节数和可取得的尺寸。按精确通道文档声明的 MIME 白名单检查服务器验证后的媒体类型，不以扩展名或客户端 MIME 代替真实探测；APIB 与 Geek H3 的格式集合分别维护，没有把一种通道的格式支持推给全部模型。
- Seedance2.0 文档的 `1.8 < 视频总时长 < 15.2` 使用小数严格边界，不塞入原整型时长字段，不把有效15.1s误截为15s。其参考视频短边为480至720px；2.5 使用文档的媒体尺寸与像素上下限。
- Seedance2.5 上游会把混合媒体中的首尾帧自动转成参考图；本站仍要求用户明确使用参考模式，不在 wire 层偷换原角色。
- Kling reference 明确采用 feature 参考，不发送默认 base 编辑；普通图片＋特征视频不会静默变成首帧。此模式没有独立音频输入，视频参考时不发送冲突的 audio 字段。
- Geek H3 只使用公开网关路径，不调用文档明确标作内部的 `/v2/video_generation`；保留具体画幅。该通道要求 HTTPS 媒体，首尾宽高比差异 ≤2%。文档会自动截取长音视频，本站按用户素材不静默截取的原则在预占前报告超长。
- 原声音设置保持，不趁引用升级改变已冻结声音开关、定价或自动时长。高级分镜、结构化元素、未接 providerOptions 明确拒绝，不吞参数。
- 上层 `compileVideoPrompt` 已把 `{{ref N}}` 转成人类编号，wire 无从区别普通文案中同样的“图片1”。新 H3/Kling 仅在正文后追加实际输入编号与原生 token 对应关系，原文和引号内文本完整保留，不全局替换、不编造不存在素材。

## 验证命令与结果

任务原 `node_modules` 指向旧 React18；第一次使用 `--conditions react-server` 在导入依赖时失败（`react.shared-subset.development.js`），尚未执行产品断言。原 junction 删除被工具拒绝，未绕过或改其目标。主任务创建基线＋明确增量的隔离验证副本并使用 React19 依赖；本切片只同步自己的源码到该副本。

```text
CWD: E:/Workspace/naumi/output/canvas-video-modes-20261102/test-source
VIDEO_MULTIMODAL_OUT=E:/Workspace/naumi/output/canvas-video-modes-20261102/wire-tests
node --conditions react-server --import tsx scripts/verify-video-multimodal-v3.ts
VIDEO_MULTIMODAL_V3=PASS MODELS=11 CHECKS=326 LOCAL_POSTS=11 POLLS=22 RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=4 REAL_SUPPLIER_CALLS=0
exit 0
```

上述 326 检查是本切片阶段结果，早于主任务补充的逐通道 MIME 断言；最终集中复测计数与 Git SHA 待主任务收口，不将阶段数字当最终总数。

验证包括：11精确型号的新引用 wire；原 text/单图/首尾/可选帧正控；旧v2拒绝多模态基线；非法组合、数量、来源URL、缺时长、超时长、未知参数、音频独立使用差异；正文不变与真实编号顺序；实际本地 HTTP adapter 的幂等头、异步创建回执、重新构造adapter后查询原任务两次且不再次POST、冻结 snapshot 不变与结果字节取回。

证据层级：真实协议编译及 HTTP adapter；身份/媒体元数据是合成 fixture，本地返回的媒体 body 只用于验证传输，不声称是解码验收视频。本脚本不覆盖 DB账务/媒体授权/浏览器整链路，也没有连接真实供应商。

独立应用层证据：主任务 `scripts/verify-video-modes-application.ts` 已在真实本地 App/隔离 PostgreSQL/Worker/存储/账务下完成 text、single-image、first-last、image-reference、all-reference 五例。已复核 `application/RESULT.json` 和 `application-locked.txt`：重复提交保持同 task、素材真实 SHA/bytes/音视频时长写入冻结任务、结果落节点与作品、媒体 SHA 一致、异主读取404、再次 Worker tick 不追加创建或账务变更；模拟供应商创建5次、素材读取8次、真实供应商调用0。该应用证据独立于上面的 wire fixture，仍非47线上或真实上游出片验收。

## 未完成项与交接

- 尚未做真实供应商付费出片，本轮用户明确只做代码、测试、合 main，不发布47。
- 视频 codec/FPS 的端到端兼容仍以供应商校验为准；本次复用的授权元数据主要有 MIME/bytes/width/height/duration，并不冒称已验证所有编解码组合。
- 主任务统一完成能力组合、管理入口/CAS/回退的最终复测、提交和合 main；最终测试总数、任务提交与 main SHA 待主任务收口。本切片不独立提交、不更改103实验线。完整模块交接见 `2026-11-02-canvas-video-modes.md`。

## 最终集中复测
- locked-test精确依赖执行同协议命令，最终 `VIDEO_MULTIMODAL_V3=PASS MODELS=11 CHECKS=379 LOCAL_POSTS=11 POLLS=22 RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=4 REAL_SUPPLIER_CALLS=0`，exit0。
- 379包含MIME与真实UI helper到Kling first_frame wire回归；旧v2四文件hash仍相同。
- 应用最终证据 `application-final/RESULT.json` 另记录五个任务各一笔账本、settled、reserved=0以及再次tick账务不变。总收口以 `2026-11-02-canvas-video-modes.md` 及证据根 `VERIFICATION.txt` 为准。
