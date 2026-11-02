# 原生结构化分镜：精确通道与独立协议版本

## 模块与职责

- 任务基线：`2e79509754542ce620e22be62e24721d6ae47487`，工作树 `E:/Workspace/naumi-storyboard-flow-20261102`。
- `video-family-storyboard.json/ts` 保存已经核对的精确型号能力与来源，导出 `STORYBOARD_VIDEO_FAMILIES`，供主任务的配置预览/升级模块组合；不在读目录时写数据库。
- `apib-storyboard-v4` 负责把合法 `shots[]` 转成具体上游字段，不承担规划、计费、持久化或供应商传输。旧版本普通请求继续委托不可变的原 codec。
- capability schema 增加可选/可空的 `maxShotPromptChars`、`minShotDurationSeconds`、`shotDurationStep`；已有 `resolveVideoCapability` 按管理员优先统一解析。原字段未声明时保持原行为，`null` 不作为自动兜底许可。
- `contract.ts` 的既有分镜校验集中执行数量、总时长、单镜描述/最短时长/步长校验；应用、UI 与 Agent 读取同一份定义。codec 再按具体通道固定契约校验，避免绕过协议限制。

## 公开契约核对

2026-11-02 实时读取，HTTP 均为200；正文、URL和SHA256保存在：

`E:/Workspace/naumi/output/storyboard-flow-20261102/native/docs/SOURCES.json`

| 通道/型号 | 参数与边界 | 本次处理 |
| --- | --- | --- |
| APIB `kling-v3` | `POST /v1/videos/generations`；`multi_shot=true`、`shot_type=customize`、`multi_prompt=[{index,prompt,duration}]`；1–6镜、单镜描述≤512字符、单镜≥1秒且不超过总时长；总时长3–15整秒，各镜之和等于总时长；index从1连续 | 新 `apib-storyboard-v4`；沿用原 v2 的文生、单图、首尾及原声音配置；没有把文档未规定的单镜整数要求强加到该型号 |
| APIB `kling-v3-omni` | 同一创建端点与三个分镜字段；1–6镜；单镜为≥1的整数秒；总时长3–15整秒，各镜之和相等；index从1连续 | 新 `apib-storyboard-v4`；沿用原 v3 文生、单图、首尾、图片/特征视频参考；未从普通v3继承512字限制 |
| Geek 国产视频入口 | 实时读 `aigc/generation.md`、`aigc/overview.md`，未取得 `multi_prompt/shots` 的结构化分镜参数契约 | 不按相似模型名称猜测并打开能力；独立镜头制作与原生分镜保持区分 |

主要来源：

- <https://docs.apimart.ai/en/api-reference/videos/kling-v3/generation.md>，SHA256 `7bd1c29ba668a387983cc9ab845c8fdcedba75004d73be00f9b2cadbf2d7ecae`。
- <https://docs.apimart.ai/en/api-reference/videos/kling-v3-omni/generation.md>，SHA256 `dfbcb9105981e478ee3226cbef3055f9122bad48eae3eea9f90753ebfda0972e`。
- Geek入口：<https://docs.geeknow.ai/api-reference/videos/aigc/generation.md>、<https://docs.geeknow.ai/api-reference/videos/aigc/overview.md>，各hash见上述来源清单。

## 本次实现与迁移状态

1. 仅新增两个精确型号的 `supportsMultiShot=true/maxShots=6`，不批量放开其余模型。
2. `previousProfile` 指明普通 Kling v3 来自 `apib-video-v2`，Omni来自 `apib-video-v3`。无分镜或空分镜数组时，直接调用原 codec；分镜请求先通过新定义校验，再让原 codec验证和构建其余字段，最后明确追加三个分镜字段。
3. 每镜顺序与秒数保留，`id/textNodeId` 不传给供应商；失败时不裁剪超长prompt、不截取前六镜、不改台词。
4. Omni参考模式仅在每镜原文后附加本次真实图片的原生引用对应关系，保留正文和引号内“图片1”等字面文本，不全局替换。
5. 原v3的特征视频 `refer_type=feature`、明确首帧组合、音频互斥等保持；结构化元素、未知高级字段仍不静默吞掉。
6. 普通v3的分镜小数时长（例如2.5+3.5=6）按文档保留；Omni同输入拒绝，并要求整数秒。最大prompt仅按对应通道限制，不在不同通道间猜测共性。
7. 原声音、价格、取消、自动时长等行为不趁分镜接入一并变更；旧模型配置与已受理任务的冻结profile不改。实际配置升级由主任务现有preview/CAS入口负责。

## 集中验证

CWD：`E:/Workspace/naumi-storyboard-flow-20261102`

```text
node --conditions react-server --import tsx scripts/verify-storyboard-native.ts
STORYBOARD_NATIVE=PASS MODELS=2 CHECKS=158 LOCAL_POSTS=2 POLLS=4 RECOVERY_REPOSTS=0 LEGACY_FILES_UNCHANGED=6 REAL_SUPPLIER_CALLS=0
exit 0
```

覆盖：

- 两个精确型号，文生/图生/首尾；Omni另有图片、纯特征视频、首帧＋特征视频的全部已开放普通路径，与旧profile请求逐对象完全相同。
- 实际新分镜字段、顺序、prompt正文、秒数、节点身份不泄漏；1/6镜正控与7镜负控。
- 最大描述长度、最短时长、总和、NaN、空prompt、小数差异、不支持的媒体/元素/高级参数。
- 管理员显式禁用与maxShots=0仍阻止结构化分镜。
- 真实HTTP adapter创建2次、查询原任务4次、重建adapter恢复不重复POST；稳定幂等头、冻结分镜快照不变、结果字节读取。
- 6个旧JSON/codec文件对基线逐字节SHA检查通过。

报告：`native/RESULT.json`；运行日志：`native/test-first.txt`。5个本切片产品文件定向 Next lint exit0，无warning/error（仅CLI弃用提示）。

## 未完成项与主任务归属

- 证据是实际codec＋HTTP adapter与本地响应，不是付费生成的多镜头遵循度/画质验收，也不是数据库/账务/整条分镜制作链验收。
- 主任务负责能力目录组合、精确v2/v3升级、UI入口与编辑器、真实App集中验证、Git合入与整任务回退包。
- 本切片未提交、未发布、未修改线上配置；47 HOLD保持，103实验线不整合。
