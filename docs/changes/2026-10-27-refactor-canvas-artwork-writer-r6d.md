# R6D：Canvas 图片元数据旧入口共用唯一写入器

基线`18ed698cc4adbe7cddf3d45ca15410aeb9a7ab07`，独立重构工作区，4481原文件哈希/完整原字节归档；main同步后第1模块。不部署、不合main，整体active。

## 实施

- 原改名、位置、显示尺寸/布局、标记、分组六份metadata UPDATE迁入既有`writeCanvasArtworkTx`；history原事务直接调用，旧入口/内部落点通过同owner锁和单连接事务调用。不是再造第二个history store或生成任务。
- 旧URL、返回形态、校验、大小取整、NULL自动布局坐标、真实像素字段和原operation保持。旧rename/position允许修改已隐藏作品的metadata但不恢复可见性，只有这两个内部adapter明确传入兼容选项，不通过HTTP提供新开关。
- 从作品查询repository提取原`ArtworkRow`与`rowToArtwork`到纯row模块；原查询出口同函数兼容re-export，避免rename写链回指查询导致循环。rename真实HTTP消费者改接metadata owner。
- 分组同项目验证归同一writer；原history将两个`group_id=NULL`独立根误认为同一项目，现按`group_id||id`与原group入口一致，整组原子拒绝。未新增业务限额、确认或审批。
- parent link、真实像素dimensions、软删除/作品创建不是本模块metadata语义，不混进通用patch框架。位置入口仍服务导入、原结果落点和恢复，不删除已有消费者。

## 验证进度

完整源码真实PG/六HTTP adapter旧新对照脚本已落盘：参数/所有权/隐藏metadata/NULL坐标/事务回滚、同history的owner锁与一空闲连接、NULL项目组反例及静态SQL退休。原有artwork concurrency/history/node及类型/架构回归集中执行后记录；四产物、独立副本回滚和Git以`output/refactor-r6d-20261027/DELIVERY.json`为准，未执行前不标PASS。

## 定向与相邻结果（2026-10-27）

- 最终扩展旧树：18类80检查、六真实HTTP、真实隔离PG，旧metadata SQL=6、旧setter绕过owner锁、NULL根history跨项目被接受；exit0。这是旧行为复现，不是业务达标。
- 新增空字符串legacy项目反例：SQL按`COALESCE(NULLIF(group_id,''),id)`与原JS `group_id||id`对齐；NULL独立根仍不得合组，同一空根及其child能够成组。新实现随下述固定源码core集中运行，不重复碎片化测试。
- 早先新版17类77检查已通过；扩展版18类80检查以core的artwork-writer真实输出为最终结果。
- 相邻`verify-artwork-owners-pg.ts`最初完整基线与新版均exit1，原因是R5P已增加canonical删除receipt而旧脚本仍严格只比较三个计数。原失败日志保留。补计数、artworkIds及完整hidden节点断言，不删产品字段；完整基线180/新版182检查、artworks/observation两场景均exit0。基线运行未传`--baseline`，报告字面MODE=MODIFIED只表示兼容出口检查模式，实际source-root明确是完整baseline目录，不冒充新代码。
- 原row投影/type声明和parent-link两函数精确文本相同；原metadata SQL6→0，canvas/artwork-repository258→123行、query repository236→168行，新纯row59行；全仓TypeScript擦除后static/literal import SCC均0，不是性能或运行容量结论。
- 本轮初次tsc报verifier的sql可能undefined，修正测试非空断言后exit0；最终扩展版tsc/lint、core23、实际history PG与runner自测集中完成后写入证据。

## 封存与后续

四产物位于`output/refactor-r6d-20261027/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`；原4481文件逐字节哈希、独立完整副本回滚、恢复旧行为和patch复放以DELIVERY.json实录为准。核心同SHA验收与最终文档提交分层绑定；本模块不构建新完整镜像，不借R6C旧镜像声称R6D整包验收。

仅完成一个metadata写入owner闭环。真实像素/parent link/创建删除仍各自有语义owner；旧无base入口不升级成浏览器CAS协议，不新增history store。剩余外围UI/旧入口与测试资产、长时混合生成负载、依赖漏洞及最终整合继续；本轮计数1，整体active，不合main、不部署。

## 固定源码集中运行结果

固定清洁源码`cdb5d1e44232d5a6fb6016b7d0178071badea3a8`：`REFACTOR_VERIFICATION=PASS SCOPE=core PASSED=23 FAILED=0 NOT_RUN=0`，exit0；全文件digest=`4d75c3e25473730a09c0790feb79994d65a2d186f91776d29b7bcc4ad7d52d84`。

- 新writer扩展18类80检查、六真实HTTP、真实PG：SQL0/shared owner fence、NULL根原子拒绝、空legacy根与child成功、隐藏metadata与NULL坐标保持、SQL异常整批回滚、一空闲连接无自等待；exit0。
- core包含图片并发20类44检查、文字并发16类47、node PG32、history67类184、报价/交付/权限/启动/视频/Worker原回执；各literal与exit见`core-candidate/REPORT.json`和分项日志。23是入口数，不是所有业务断言总数。
- 额外实际history HTTP/PG20检查通过；runner自测12类64检查通过；最终全项目`tsc --noEmit`空输出exit0，七改动TS文件lint空输出exit0。
- 后续只有本段及工作区登记文档更新；最终Git提交与上述core SHA明确分层，全部`src/`、`services/`、`scripts/`字节与被测固定提交一致，最终封存脚本逐字节检查。未把旧完整镜像当本轮新代码整包运行结果。
