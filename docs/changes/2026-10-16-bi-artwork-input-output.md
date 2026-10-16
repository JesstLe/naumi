# BI 图片记录：原图、提示词与生成图

## 状态与范围
- 分支 `codex/bi-artwork-input-output-20261016`，基于刷新后的 `origin/main c2634fba41fd50a117f9af93e63d865e446f7394`。本地实现/集中验收，未合main、未发布。
- 图生图列表同一条作品展示带标签原图与生成图；原图超过2张时显示展开入口，详情显示全部原图及完整提示词。文生图只显示生成图和提示词，不伪造原图。
- 上传记录标注上传原图；类型未确认的旧记录标注作品图片，不把未知类型当文生图。

## 取证与空间
- 优先读取durable job提交前已保存的 `p.images[].buf.$imageJobBuffer`；套图/A+读取顶层images。高级imagegen读取冻结request.inputs（不把mask当普通原图），画布改字读取同账号任务source_artwork_id。
- 不从可变画布parent边猜测原图。所有原图通过现有BI受鉴权media路由按结果记录+slot+index读取，不把内部URL、冻结payload或签名暴露到列表/CSV。
- 复用已留存媒体，不新增图片文件、缩略图磁盘缓存、数据库字段或数据迁移；缩略图在内存转换并返回private/no-store。增加读取带宽、解码CPU与短时内存使用；大图查看沿用访问审计写入，不能称零资源开销。
- 历史同步工具（如部分replicate路径）只保存结果、未保存输入时，显示原图未留存；本任务没有修改供应商提交/生成/Worker去补采集。若未来要求这些路径也永久可追溯，需要另做输入留存/去重/保留期设计，有新增存储可能。现有作品ID引用在原文件被替换或删除后不保证永久字节版本，冻结job输入优先保证当次请求字节。

## 验收
- BASELINE确认旧版本仅结果图；MODIFIED覆盖多原图、文生图、套图/A+、高级输入排除蒙版、画布改字、上传、缺失历史、可变父边不推断、只返回计数/类型。
- 实际media GET函数＋隔离依赖：匿名拒绝在查询前、参数校验、输入序号404、非managed冻结URL拒绝、源作品同owner查询、asset按owner、private/no-store、120×220缩略图不裁切、大图原图访问审计通过。无真实供应商调用，无业务数据库写入。
- 真实React组件renderToStaticMarkup图生图/文生图/四原图列表与详情通过；1040/390px html_preview无console错误，效果图已打开检查。演示素材不是用户实际生成结果。
- TypeScript集中检查退出0。尚未验收：真实PostgreSQL数据联查/当前公网用户记录/生产浏览器交互/所有未留存同步工具输入补采集；不把隔离fixture称线上已修复。
- 精确命令、原hash、改后制品及副本回退：`E:/Workspace/naumi/output/bi-artwork-input-output-20261016/VERIFICATION.txt`。

## 协作
- 未修改同事未提交dashboard.module.css，采用新组件CSS module。没有修改canvas-client、generate-image/output-shape/aspect/imagegen提交/查询/Worker，也未持47三锁、建候选或切流。
- 功能迭代计数1；开工/提交前刷新远端。后续统一候选选择性整合本任务SHA，保护同事管理UI未提交内容，发布窗口由统一线程协调。
