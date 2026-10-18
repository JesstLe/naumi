# G43 渠道图片规格预检与结构化缺项

状态：服务/原生BFF/原UI/运行/Next开发验收通过；固定版与副本回滚以交付证据为准。延续M18，原18482单UI/单代码主干，真实schema8不变。

## 1. 实际使用

运营从某个发布实例打开“图片规格预检”，明确填写渠道规则名称、修订标识、依据说明，以及PNG/JPEG允许格式、文件数量、单文件大小、宽高范围、可选比例/容差、透明度要求。没有内置冒充公司标准的规则。检查当前固定已验收交付；保存一份不可变报告，列出每个文件实际格式、显示方向尺寸、字节、透明像素和逐项问题。

此报告是对本次明确输入规格的技术检查，不代表公司规则已审批、图片内容合规或外部平台审核通过。G41批准/执行门禁仍独立；本期预检是显式辅助检查，不偷偷给历史计划加新强制条件。后续公司统一规则发布、强制采用和例外审批必须单独设计兼容门禁。

## 2. 规格与报告数据

spec包含label/versionLabel/sourceNote、formats、minFiles/maxFiles、minWidth/maxWidth/minHeight/maxHeight、maxBytes、alpha(any/forbid/require)、aspect(null或width/height/toleranceBps)。范围必须一致，格式不可重复，所有必填阈值由运营明确输入。

报告绑定publicationId、publicationVersion、sourceFingerprint、原acceptanceId/文件revision/hash/bytes/目标目录快照、spec及specHash、actor、createdAt、inspectorVersion。同reportId同输入回放；不同内容冲突。原状态、任务、贡献及Naumi账本不变。schema32仅附加publication_preflights；沿用publicationsEnabled=false与既有reader/writer29，不强制旧程序识别新检查。

## 3. 真实字节检查

- 使用原受保护交付读取及扫描校验，不凭扩展名猜格式，不抓取外部URL。
- 8位PNG/JPEG实际解码，EXIF旋转后的显示宽高参与比较；透明度看解码像素，不把“存在alpha通道”当“实际透明”。
- 32MiB/文件、16M像素、单轴32768、每报告20文件/总128MiB，两并发，解码10秒上限。超出检查器能力/未知格式/动画/16位图像分别给incomplete，不返回通过。
- 格式、数量、尺寸、字节、比例和透明度产生结构化code/expected/actual；损坏或截断解码返回decode_failed，不用伪造头部通过检查。
- 首次身份/原单/店铺与规范/扫描核验，读取后再验权限、实例版本及来源依据；期间撤权或版本改变不持久“成功报告”。
- 报告状态：fail有明确技术不符；incomplete有未检查项；pass仅全部受支持文件完成解码且符合输入条件。文件检查结果独立保留，不只给总绿灯。

## 4. 接口与原UI

POST /v1/publication-preflight {id,publicationId,expectedVersion,spec}，GET list/detail。原生BFF /api/enterprise/workflow/publication-preflight沿用登录/企业映射/viewer/同源/限流。来源文件从服务端固定引用获取，浏览器不得提供测量值。

原发布详情新增入口；表单无伪默认公司阈值，显式提交保存检查报告。结果按文件展示，支持查看历史规格/报告；未知响应冻结原reportId及输入重试，关闭/换号丢弃迟到响应，390px单列。历史报告显示当前发布版本和当前依据失效提示，旧pass不冒充仍可执行。报告下载JSON可从已授权详情生成，不附原文件字节或扩大权限。

## 5. 验收与剩余

有效PNG/JPEG、EXIF方向、透明/不透明alpha、伪扩展名、截断、过大/过多、比例边界、空或反向规则、相同ID回放/冲突、并发、撤权、来源改变和审计失败原子；原UI、原生BFF、固定运行及真实Next；实际旧31在32库原业务且报告保持；源码副本回滚。

真实公司渠道规则、统一发布/停用及强制采用/豁免、更多图片/动图/视频格式、OCR/内容/版权检查、外部平台规格接口、公司身份与生产容量继续保留。生产4核8GiB不能由本机小图测试推定。


## 6. 实施记录（2026-10-18）

新增PreflightStore、image-inspector、strict spec合同、schema032与原生BFF；原发布详情图片规格入口、显式表单、逐文件报告/历史/复用条件与JSON下载。sharp固定0.34.5进入独立服务锁文件并作为外部运行依赖打包，避免把原生二进制错误塞入esbuild。Windows实际服务和Linux固定Node镜像内npm ci --omit=dev --ignore-scripts均完成真实PNG/EXIF-JPEG/截断检查。

服务集中验收覆盖实际透明像素（含opaque alpha）、EXIF旋转、假扩展名、截断拒绝、16位及像素超限incomplete、精确比例容差、无效规则、报告CAS/重放/输入冲突/并发只存一条、解码后撤权、审计故障原子、31项分页、原单/发布版本不变及规范撤回后的历史报告保留。历史报告返回当前依据可用性，避免旧pass冒充当前有效。

首轮开发运行48组和真实Next35组通过；补充16位明确未支持及历史当前状态提示后集中重新验收。检查器能力限制是防止误判与资源失控，不是生产4核8GiB吞吐量证明。报告中fail、incomplete逐文件保留；混合结果即使总fail也不会隐去未检查项。

后续固定commit、原UI、真实依赖、源码副本回滚及原表只读校验记录在E:/Workspace/naumi/output/enterprise-preflight-g43-20261018/VERIFICATION.txt。真实公司映射、目录/规格来源、供应商与生产授权没有自动填入。

### 接续提示
```text
读取implementation-goal.md、preflight-g43.md及全量交付矩阵。
检查报告只对应保存的spec/sourceFingerprint/publicationVersion；旧pass不代表当前规范有效，也不代表平台审核。
保留原18482界面及真实schema8。下一阶段优先回到主流程缺口：活跃需求变更的显式申请/独立审批/影响清单，保留执行中任务与已验收事实。
集中测试、版本文档、选择性Git提交推送、固定运行及副本回滚；整套目标保持ACTIVE直到真实试点和原范围逐项证实。
```


### 原UI验收收尾

23项原生浏览器检查通过：原发布入口、历史2项、无默认公司阈值、反向范围明确报错且可编辑、保存报告后丢响应与原reportId重放、jpg扩展名仍实际识别PNG40×20/无透明像素、技术检查与审批区分、同请求只存一次、当前依据有效、显式复用、结构化宽度/透明度不符、原单与发布版本不变、顶部三类计数、不支持格式incomplete、规范撤回后旧pass保留但当前失效提示、迟到关闭、390px报告/单列表单、切号清屏。实际下载JSON重新打开核对reportId/规格/测量。

浏览器发现顶部通用空问题提示会让“文件不符”报告被误读，修正为通过/不符/未完整检查计数后重新截图验证。最初TypeScript files数组推断诊断已显式声明；运行辅助脚本的PowerShell空字符串替换异常未触及业务文件，改用明确路径脚本。为了验收最终当前依据/位深语义，首个隔离fixture已显式关闭并等待exit0后启动第二个，未重复启动活服务。
