# G42 固定发布包与人工回执附件

状态：服务、原生BFF、原UI、运行与真实Next开发验收通过；固定版本/源码副本回滚以交付证据为准。延续G41/M18，原18482 UI、单主干与真实schema8不变。

## 1. 运营闭环

独立批准后，运营下载某一发布实例当前版本的ZIP，按manifest核对目标店铺/SKU/外部ID/位置/语言及固定交付版本，在既有商家平台人工操作。登记人工回执后，将截图或其他凭证上传到该实例的不可变回执修订。附件不属于设计交付、不新增验收/贡献或Naumi积分事实。

## 2. 发布包合同

- 包含manifest.json及固定source.files，保存原文件名、包内相对路径、ID、revision、bytes、SHA256、验收ID/时间、采用规范和目标目录修订。
- ZIP仅允许approved/executing状态；必须显式expectedVersion，所有文件与规范、目录重新验证。unknown/召回/取消等状态不导出可执行包。下载不等同领取/已发布。
- 同实例同版本manifest及ZIP内容确定；不写动态下载时间。下载人/服务端登记时间和包hash独立进入审计。
- 包内名称由固定文件ID及安全文件名生成，不信任路径、重复名称或系统保留名；UTF8、ZIP32 STORE方式、CRC32。上限20文件/总计512MiB；两并发、流式写本机临时文件，不把总包读入内存。临时文件在下载结束/取消/失败后清理；异常进程退出残留有界清理。
- 实际文件用既有受保护下载/扫描检查读取并比对固定元数据；生成后再次验证当前成员/团队/原单/店铺授权、实例版本、状态与依据，再登记下载审计并传输。未知生成失败不返回伪成功文件。

## 3. 回执附件合同

- schema31独立publication_evidence/publication_evidence_scans/publication_file_audit，blob位于独立publication-evidence目录；不改delivery_assets或source文件。
- 上传assetId稳定UUID，publicationId、expectedVersion、receiptRevision、name、note必填。receiptRevision必须指向本实例不可变receipt/resolve/recall-receipt修订；历史回执可补证据，但注明上传人/时间/说明，不伪装为当时已存在。
- 当前回执原登记人且仍有request/manage权限，或当前manage+review可补附件；每次请求校验本企业团队、原单可读及目标店铺授权。普通任务参与者不因此获得上传权。
- 二次鉴权/CAS、同assetId相同内容重放；不同内容/修订/说明冲突。上传成功不改变发布状态、回执版本或贡献。
- 16MiB/附件、200个/发布实例、独立512MiB/企业证据配额，两上传并发；与交付配额分别统计，因此实际旧30不漏算同一配额。
- 使用当前运行扫描策略：disabled明确未扫描；required需完整读取真实字节的clean结果才允许下载，infected隔离、扫描错误/过期阻止下载，可由有补证权限者重新检查。保留不可变扫描历史，下载前检查最新状态与实际hash。只以附件下载，不内嵌HTML/SVG/PDF。
- 附件metadata/scan/audit同事务；失败不遗留可见半条记录，未注册blob清理。读取已撤回规范下的历史凭证仍允许，但撤销成员/店铺权限立即拒绝。

## 4. 接口与UI

原生BFF /api/enterprise/workflow/publication-files，同源/当前viewer/企业映射/限流。GET list、download、package、scan-history；POST二进制上传与scan。

原发布详情增加“下载固定发布包”“回执凭证”入口。附件面板选择明确回执修订、填写补证说明、选文件；成功列示版本、上传人、大小、hash、检查状态。未知上传保留file+assetId+输入，原命令重试；关闭迟到响应/切号清屏。手机单列。

## 5. 运行与验收

schema31为附加表，沿用publicationsEnabled默认false和既有reader/writer29门禁。实际固定旧30程序在31库继续原业务，既有附件与审计保持；不将旧版当新文件入口。

集中验收：ZIP独立解析CRC/hash/UTF8/固定manifest、重复文件名、安全路径、状态/CAS/损坏/扫描/撤权/审计失败/取消清理；凭证精确回执关联、同内容回放、变更冲突、角色/跨企业隔离、感染/过期/补检、原单及贡献不变；BFF、原UI、固定运行、真实Next与源码副本回滚。

## 6. 完整目标剩余

真实公司来源/身份映射、钉钉/聚水潭/商家平台API与读回授权、跨店批量与经营归因、渠道图片规格自动检查、生产扫描器/保留清理策略、服务器容量/蓝绿发布均继续保留，不将人工凭证视为平台验证。


## 7. 实施与验收记录（2026-10-18）

PublicationFiles通过PublicationStore.fileScope复用当前成员、原单、店铺授权及发布版本检查。独立ZIP32流式打包器不引入运行时ZIP依赖；JSZip和Python zipfile仅作独立解码验收。生成前后验证依据，包审计失败拒绝返回并清理临时文件。持有打开的已校验文件描述符输出，下载结束/取消移除包；异常退出残留仅清理自己命名规则下超过24小时的临时ZIP，每次最多50个，不清理业务凭证。

凭证文件上传fsync后校验hash，实际扫描完整字节，metadata/scan/audit同事务；配额独立计量，不改变既有交付配额或旧程序语义。回执选择器显示最近100次回执，附件30/页、200/实例。批量永久删除和自动保留期清理尚未接入，不自动删除公司凭证。

开发集中验收：服务包括UTF8同名隔离、路径/重复条目拒绝、固定ZIP CRC/hash、包审计失败、取消/撤权清理、证据配额、精确回执关联、重放、扫描过期/感染/补检历史、审计失败及原任务事实不变；原生BFF和真实Next二进制全链路通过。运行初次迁移测试仍断言30失败，改为本轮31后46组通过；完整Next34组与全量锁定类型检查通过。

18项原UI检查：凭证入口/unknown无包、指定v4回执、上传实际提交后丢响应、冻结原文件重试只新增一次、说明/hash展示、感染禁下载/补检恢复、检查历史、原单不变、draft无包/approved有包、无回执无上传、390px布局、迟到关闭与切号清屏。实际浏览器下载3723字节ZIP通过Python CRC及manifest v2/文件hash验证；39字节凭证内容及SHA256精确一致。截图为合成验收资料。

最终交付目录：E:/Workspace/naumi/output/enterprise-publication-files-g42-20261018。VERIFICATION.txt记录固定commit、测试原命令、输入、输出、退出码、源码副本恢复与未完成事项。

### 接续提示
```text
核对实施台账和当前工作树；保留原18482 UI及真实schema8。
使用已批准发布实例下载固定ZIP，核对manifest及文件SHA256；运营人工回执附件绑定明确receiptRevision。
真实渠道API尚未绑定，不将包下载、人工凭证、病毒检查或HTTP200认作平台发布成功。
下一步推进渠道图片规格预检与结构化缺项，并保留真实身份接线、公司规格和完整部署容量验收。
```
