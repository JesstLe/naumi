# G33 需求参考附件与模板附件规则

## 业务合同

运营在需求草稿上传参考资料，明确选入当前需求后提交。上传候选、选入需求、执行交付是三个不同事实。新文件不写交付表，不创建任务/验收/贡献；复制需求不继承参考附件或原Excel文件权限。

每文件最多32MiB、单进程2个上传/2个扫描，需求最多选20个文件，单需求保留最多200个上传版本。与交付/续传预留共用每企业2GiB限额和同一quota锁；本地路径在受保护deliveryRoot/demand-reference子目录，原交付文件路径不变。文件不公开URL、不以用户文件名做存储路径。

## 权限与版本

- 上传/改选：当前提报团队的request用户，且是提报人或manage；订单为draft且当前team是提报team；expectedVersion核对原订单。上传候选不提升订单版本，改选沿订单CAS/事件/幂等命令。
- 提报人/同提报团队manage+request可看所有候选与版本；其余成员须canRead订单且文件已选入当前需求，不能枚举未选候选。撤权即时生效，重试回执也重核对身份和读取权限。
- 原文件永不覆盖。不同assetId上传同名/同字节仍是独立版本；同assetId及相同参数/字节重试只返回原版本。改名/改字节重试冲突。
- 上传文件、审计、扫描记录同数据库事务；磁盘临时文件及本次无引用链接在失败后定向回收。当前文件只以白名单ID读取，哈希/大小验证后同文件描述符流式返回，再次检查授权/扫描。
- 当前选入快照由服务端生成，包含id/name/bytes/sha256/revision/uploader/createdAt；提交后冻结，退回草稿可显式改选并留before/after事件；历史文件不删除、不自动转交付。

## 扫描、预览和下载

复用统一ScanPolicy及ClamAV协议，需求附件使用独立scan_events。required模式只有新鲜、同策略clean可选入/提交/下载；infected持续隔离，scan error不覆盖最近infected结论；重新扫描可恢复。disabled表示未扫描可用，不伪称扫描通过。扫描结论绑定字节哈希和大小。扫描历史权限与文件读取一致。

下载强制attachment、octet-stream、nosniff/no-store/sandbox；预览仅真实PNG/JPEG、<=8MiB及现有尺寸上限，SVG/HTML/PDF等仅下载。普通成员只能下载当前选中的文件，状态不可用时显示原因但不放行内容。重新扫描要求提报方编辑资格（不要求draft），不授予交付权限。

## 模板规则与提交

formDefinition新增可选attachmentRules={minCount:0..20,maxCount:1..20,allowedExtensions:[],maxFileBytes:1..33554432}，min<=max。扩展名小写字母数字，最多20种；空集合表示不按扩展名限制。扩展名是业务文件要求，不代替扫描/真实格式判断。旧版本缺少规则时沿全局20个/32MiB，无必填要求。

规则随独立发布修订冻结；新发布不改变旧单。草稿可少于minCount；选入时检查实际文件归属/扫描/字节，提交时检查当前固定模板中的数量、大小、扩展名，并再次验证选中文件及扫描有效期。未启用需求附件模块时，不允许发布/使用新附件规则；旧无规则模板仍按旧功能工作。

## API与界面

受Naumi会话保护BFF /api/enterprise/workflow/demand-files，服务/v1/demand-files；二进制upload、list、download、preview、scan、scan-history。selection由既有command的set-demand-assets处理。

原需求详情“参考附件”：先上传候选，再勾选明确保存；展示版本、文件大小、扫描/选入状态，预览下载、重新扫描与历史。草稿编辑区保存原因；只读角色只显示选中资料。上传期间冻结该次File/assetId/参数，未知结果重试同一命令；关闭后读取候选核对，不自动重发。切换账户/团队/关闭丢弃迟到响应；手机单列。

## 运行及验收

schema22新增需求附件/审计/扫描表及runtime_installation.forms_enabled独立flag，从原floor>=20回填。demandAssetsEnabled默认false；显式reader/writer22启用后旧21拒绝读写，避免绕过提交/配额/模板规则；forms/商品/个人容量flag保持独立，不因22自动开启。未迁移的真实schema8只读原数据不受影响。

集中验证上传权限/重复/换字节/跨团队/选入前后可见性、真实PNG与字节SHA、原子审计失败/配额/空文件/32MiB/并发、扫描clean/error/infected/过期/策略变化/重扫、选择与提交/规则边界/固定修订/复制不继承、撤权/手机/未知响应/迟到；固定运行+BFF+Next同模块验收。正式扫描病毒库、部署存储容量、企业真实账号和保留删除制度仍需现场验收；32MiB以上需求参考续传后续扩展，不把已有交付续传直接当需求附件已实现。
