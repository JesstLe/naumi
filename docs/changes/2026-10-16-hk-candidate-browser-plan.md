# HK当前生产候选boot：非付费浏览器验收方案（待root注入入口）

## 当前状态与调用边界

本任务只准备方案与离线输入检查，不连接生产、不注册/重置账号、不SQL、不发供应商POST。root掌握现场锁、候选URL、会话签发与最终执行。此前本机6262结果绑定本机container/boot，不能拼成生产验收。

既有`test_release_unified_three_ui.mjs`含Docker inspect/SQL建企业/授grant/写媒体、新注册账号、创建文字节点，**不直接用于生产**。生产版只保留Playwright截图/role DOM/真实响应体/同boot核验部分，删除上述硬编码fixture动作；通过`fixtureOwnedTestObjects`显式注入允许新增/读取的对象。core现场identity/status由root的session或只读proxy提供，浏览器不持release secret。

现有/T3 UI工具transport error只是工具连接失败，不能当页面通过。若使用该UI链，保留两次真实preview失败及时间后，使用仓库已验证的原生无头Edge/Playwright流程；不伪造失败截图。当前准备阶段未尝试生产preview。

## root需要提供的最小输入

1. `origin`：实际candidate直连URL，或root专用本机只读proxy；`publicOrigin`仅用于旧static与R2原入口。两者精确allowlist，不自动发现其他站点。proxy必须映射回session要求的真实URL并记录真实request URL，不能篡改证据url。
2. `binding`：完整containerId/imageSHA/commit/buildVersion/instanceId/bootId/assetPrefix、session已verified时间、候选当前admission。由root在开始及结束重查；UI同boot，变更即本轮失效。
3. `authA.storageStateFile`：ACL保护的本地会话文件，或root已注入的独立浏览器context。只含已有账号短期native会话，不输出cookie、不传命令行、不写截图/普通日志/HAR。单独证明会话主体及期望email，`nv_admin`二次密码会话不因测试额外获取。
4. 可选`authB.storageStateFile`与`expectedDenied`：**已有**另一个非特权账号以及其明确预期资源权限；没有B则只做anonymous边界，普通用户越权项记未验。admin可见全部企业时，不能把其合法可见误断为403。
5. `fixtureOwnedTestObjects`：唯一runId/验收前缀；`allowPrivateSkillImport=2`、`allowPackagingCreate=1`的显式额度；仅新增private对象，不共享到企业、不覆盖已有记录。已有只读canvas node/project/enterpriseId+expected visible heading、真实privateR2 appPath+期望SHA/bytes、旧三prefix样本URL+SHA由root提供。
6. 若生产禁止任何新增，必须明确`writes=false`；这时Skills点击/拖拽只能验证filechooser/drop UI与既有库显示，导入保存/包装云保存都记未验，不能声称完整端到端。

## 精简实际检查矩阵

| # | 实际检查/路径 | 成功证据与权限保持 | 写入 |
|---|---|---|---|
| 1 | `/api/version`、root现场`/api/internal/release/status` | 预期commit/build/image/instance/boot；开始结束一致，保持现有draining/open，不调用control | 无 |
| 2 | A：`/api/auth/session`与`/desktop/api/auth/session` | 均为root指定的已有同账号；cookie仅内存比对摘要、导航前后保持，不注册/登录口令/改密码 | 无 |
| 3 | `/dashboard`→`/desktop`→`/desktop/create`→`/enterprise`→工作台 | 同cookie/boot；desktop点击“画布项目”/“最近作品”证水合；企业使用A实际已授权heading及“刷新”，不新建企业/grant | 无 |
| 4 | 可选已有`/desktop/canvas?node=<ownedId>` | 仅打开已提供节点、读到期望文本/媒体，不编辑保存现有用户作品；无ownedId则省略并记录 | 无 |
| 5 | Desktop浏览器`fetch('/api/auth/session')`与旧`fetch('/desktop/api/auth/session')` | canonical请求未被新main强制重写，两个别名返回同身份；记录真实path/status，不打Agent发言 | 无 |
| 6 | `/dashboard`按钮`Skills`→`[data-testid=skill-book-dialog]` | 精选内置`official:brand-packaging-strategy`可见；“我的 Skills”打开；只读既有条目不编辑 | 无 |
| 7 | 点击“导入 Skill”→原生filechooser（或`getByLabel('上传 Skill 文件')`） | 上传唯一runId-A的UTF8 `.md`，真实POST `/api/image-skills/import`201，返回personal id/revision，刷新GET库仍在 | 仅新private Skill A |
| 8 | `[data-testid=skill-import-dropzone]`实际DataTransfer dragenter/dragover/drop | 唯一runId-B文件，真实POST201；drop时不跳转文档、不误发Agent请求；再开库确认新条目 | 仅新private Skill B |
| 9 | `/tools/packaging-strategy` | 真实heading“品牌包装策略”，填写首步label/textarea、点击“下一步”后返回证明交互；只按“保存云端”，截获POST `/api/packaging-strategy`且action严格save | 仅新验收project |
| 10 | 包装保存回读：`GET /api/packaging-strategy?id=<createdId>` | 新project brief精确一致；若再保存，仅此ID+刚读revision CAS，409立即停，不覆盖任何旧project | 可选仅此新project第2版 |
| 11 | 真实private R2 `/media/<root指定key>` | A app认证→307/200→允许域R2实际GET200，SHA/bytes与root输入相等；匿名原appPath401，B原路径按真实权限404/403。signed URL不落日志，cookie不发R2 | 无新上传/无变体生成 |
| 12 | 旧client静态：3prefix各2个指定旧chunk + 当前3UI所有实际script/CSS | 每个HTTP200+SHA；root current HTML引用rootchunks，旧desktop/enterprise字节仍保留。静态通过≠旧Next完整跨版/RSC连续性 | 无 |
| 13 | A/B隔离：新Skill、新包装project与root指定企业只读GET | B个人列表不含新Skill；新project404；企业按root给的真实scope断言。只有A或admin时不冒称普通账号隔离已证 | 无 |
| 14 | 清理：仅本run返回的2个personal Skill IDs | `DELETE /api/image-skills` `{selection:{id,revision}}`归档后A列表不再含；只归档本run journal IDs，CAS失败保留并报告，不追踪删除他人内容 | 精确归档2 Skill |

包装当前API没有DELETE，`清空当前简报`只清本机草稿，**不是云项目删除**。该新验收project以runId标识留作验收记录，或root另行按精确id人工清理；若不允许留下这个对象，则包装保存项不执行。测试前关闭独立context即可隔离本机草稿，不动用户正常浏览器localStorage。

## 非付费网络闸门

默认GET/HEAD只到candidate/public app与root明确允许的R2主机。有限POST仅两个Skill import、必要纯读`/api/media/image-cache`（original/no variant）、包装`action=save`；Skills精确个人archive DELETE仅在journal登记后允许。包装generate/refine、`/api/agent`POST/PUT、任何generate/image/video/worker/tick、授权/计费/账号变更API全部在浏览器请求层阻止并使本轮失败，不转发真实供应商POST。页面主动纯报价等额外POST需先查来源并由root显式批准，不能笼统放行全部POST。

`/api/media/image-cache`虽然语义只读，variant缺失时可能创建媒体变体；优先原`/media/key`真实读取，不使用缺失缩略图来增加Sharp负荷。R2 GET有实际存储流量但无模型付费任务；不把R2的跨域signed链接401当app账号隔离测试，隔离必须验证原认证appPath。

生产浏览器文件选取使用本地内存File/Buffer；只接受小于512KiB且不含本地references的2份简单Markdown。拖放事件通过真实浏览器DataTransfer+File触发组件原onDrop，不调用mock API或把直接HTTP导入冒称拖放通过。

## 证据输出与session适配

每项使用本轮startedAt、实际containerId/bootId、真实request URL/status、body SHA与断言、PNG、DOM快照；`desktop-ui` DOM必须tablist+heading，`enterprise-ui`必须button+heading及visible name，schema `hydrated-role-snapshot-v1`。session `check_path('packaging')`当前应补实际`/tools/packaging-strategy`（此前只列`/creation/`并不等于真实路由）。

日志只存已脱敏路径、status、对象id/revision、body hash；cookie、Authorization、R2签名query与可识别用户完整业务响应只进入root受保护证据目录或不留原文。生产对象先journal intent→实际回执→readback→清理回执；中途UI/网络未知不自动重传POST。会话撤销与local storageState删除由root结束时处理，不能删除其原始会话或正常浏览器配置。

输出需区分：已通过、未执行（无B/无owned媒体/禁写/缺enterprise权限）、失败、遗留专属验收project。root提供candidateURL/会话/owned对象前，当前完成状态仅**方案与输入契约**，不是生产浏览器验收。
