# 2026-10-19 参考图上限16

用户明确要求APIB从6张设为16张，不等待收费验收。收费验收与自动收费巡检继续PAUSED。

## 已上线配置
- 新publication `e66d57a9-5c9e-47aa-9602-52d13847fbc1`，2026-10-19 17:18:48+08确认phase原值`applied`，模型配置v122→v123，digest `b2a690938f291c005c814876ba05161539f76ab066094424fb13c11219b8607d`。
- 严格只改flare/sunburst的capabilities.maxReferenceImages：6→16，两叶子delta。其余配置逐字节结构比较不变，billing8、权重/售价/verified=false均保持。
- 全程同三锁，基线备份/CAS→PLAN→APPLY→VERIFY→真实HTTP plan，结束释放。不构建/重启/切流/改Worker。
- 公网真实plan（不是simulate）：gpt-image-2/edit/medium/1K/3:4/PNG/n1，7条与16条引用均200/modelVersion123，两APIB均eligible。使用同一QA私有素材的重复引用验证数量门禁，并非16张不同照片的付费出图实测；17条时APIB不eligible，不承诺全请求都被拒绝（其他通道保持独立能力）。
- 无submit，无供应商调用。原两个历史未结事件不改不重试。

## 源码入口补齐（本地，未部署）
- generate-image解析、canvas选图、generate上传、fuse上传的上限6→16。
- legacy-frame-request原图画幅扫描前16张，不再只扫6张。没有重解释已接受Worker任务，imagegen内部既有32素材解析保持。
- 当前在线5d仍是旧选图入口，因此网页手动选图仍可能限制6；不能把v123配置上线当作这些JS已发布。程序蓝绿仍受根磁盘约6.3GiB、低于10GiB门槛阻挡，不热换在线源码。
- 现有总字节64MiB、总解码像素80MP及单文件限制未放开。扩张张数不等于允许无限体积。

## 集中验收
- 源码AST/真实parseParams：原版输入16仅保留6，修改后16个唯一字节文件按顺序全部保留，四入口上限与legacy扫描均16。
- 实际APIMart adapter+隔离PG+本机HTTP：16张文件→16次上传→wire image_urls16→mock结果成功；57项原异步/费用/恢复回归。外部收费调用0。
- 真实版本化配置PLAN/APPLY/VERIFY、UNKNOWN原UUID恢复、重复APPLY、选择性ROLLBACK、管理员后续权重/名称/billing9保留通过。17引用负向门禁通过。
- 全量tsc结果与原始命令、四产物、副本回退见output/apib-reference-limit16-20261019/VERIFICATION.txt。

## 协作/Git
续用独立codex/image-recovery47-20261019，父e449b367，开工fetch确认main仍2b9ce5ea；不覆盖共享checkout。只连47，不在旧UUID6af8…上重发或覆盖REQUEST；本次原UUID与目录持久核对。
