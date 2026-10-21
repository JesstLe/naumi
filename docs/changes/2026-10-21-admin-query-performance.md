# 2026-10-21 管理后台查询性能（已蓝绿发布并完成筛选验收）

## 基线与边界
- 独立 codex/admin-query-performance-20261021，基线48d1445e；共享checkout/他人未提交保持。
- 47 14:20 实际23个HTTP读取：BI总览3610ms、作品1435ms、用户599ms、模型管理678ms/476KB、供应商目录460ms、旧用户管理366ms；其他主要读取22–379ms。另fleet/status返回404，不将缺省禁用入口当查询瓶颈。
- 当前上传/图片交付由既有唯一窗口发布，本任务不并行持47锁/候选/切流。
- 不删历史、不缩查询范围、不加陈旧跨用户缓存、不改权限/售价/账务/任务状态、不调用供应商。

## 实现
- BI作品、模型审计：过滤/计数与详情展开分开，先按原排序取页，再取JSON/来源关联。
- BI用户：在筛选用户集合一次汇总期间流水决定原排序，只对所选页取积分批次/作品/充值统计。
- 总览：任务仅读取状态、阶段、错误；信用批次先分组，保留只读repeatable-read快照及北京时间日历。
- 旧用户管理：作品与7日消费按email分组，替代逐用户相关扫描。
- 模型管理：单请求共享图像元数据快照，3个默认值映射复用；无依赖状态读取并发、视频冻结按upstream单请求去重，保留人工优先与已发布版本绑定。
- 成本完整链利润：Map索引替代每操作重复扫描，不改统计和500链上限。
- BI切换筛选：过期请求不得回填新页面。

## 待验收
- 独立PG跨全部BI section、过滤/空页/跨账号/recordId、原接口权限/统计等价；大JSON性能与query plan。
- 模型管理/供应商默认与mutation回归，真实浏览器、完整tsc/build、原文件副本实回滚。
- 通过后普通提交/推送；上线须独立协调唯一47蓝绿窗口，不能以本地通过代替线上。

## 第二轮集中结果
- 独立PG142组全BI section与旧用户管理等价；450用户/10000作品/8000任务/12000流水。总览366→32ms，用户272→11ms，作品263→11ms（本机样本，非线上HTTP完成值）。
- 47同一只读repeatable-read真实EXPLAIN：旧总览状态查询3780ms，第一轮仅窄投影仍2908ms，证实TOAST读取主导；改为两条partial状态索引计数，索引脚本显式独立并发创建，不放入Web启动/请求DDL。需正式持三锁执行后复核。
- 47原SQL与page-first实际读计划：用户348→19ms，作品1075→29ms；未写生产索引/数据。
- 供应商模型库新增opt-in view=summary；旧完整列表契约保留。列表只取展示字段，按ID编辑读取完整最新revision，导出重新取完整当前页，不丢参数/备注/证据。
- 模型管理4轮完整API等价，元数据读取3→1，跨请求revision实时刷新，未写配置；原private BI/用户管理/模型链/模型管理/元数据库/成本回归通过，tsc0。
- 真实React生产bundle/T3浏览器：BI旧慢响应晚到不覆盖新页；模型库摘要首读/完整编辑/完整导出/原revision保留、0写入通过。
- 线上docker exec node只读探测曾exit143，未据此声称应用OOM/重启；只读核实容器running/OOMKilled=false/RestartCount0，改用DB psql限时读事务完成SQL测量。
- 既有图片交付窗口已COMPLETE rev501，owner继续持短事务恢复既有图片。本模块尚未部署，不并行切流。


## 2026-10-21 实际发布
- release47-admin-query-20261021 COMPLETE / canonical544；程序4ec60ef5aace48f4e41e4f4da3c5faae8a3d6f38 / build1792565197；Web/Worker同80f3885d6526…；旧r3双槽已排空停止，逆向网关/固定旧镜像/可读DB备份回滚检查PASS，未实际切回、未回灌DB。
- 模型132/billing8与冻结配置哈希保持；历史2未结事件保持，不把本次后台提速当生图供应商故障修复。
- 第一轮公网23主要读取HTTP200/24–367ms；最终同源HTTP样本18–317ms，总览164ms、用户77ms、作品128ms、模型管理269ms、旧用户63ms。指标为当次样本，不承诺所有负载/所有任意查询恒定延时。
- 31组公网分页/空搜索/空页/完整模型配置读取通过，最慢空搜索调用记录818ms。模型库98971→38593bytes，摘要不截断总数；编辑/导出完整详情仍保留。
- 尾部精确保护先HOLD：2笔旧任务pending→done/预占释放，2笔APIB供应记录补actualDimensions/deliveryNotices。逐笔下载解码、作品关联/单笔12和6积分结算证实；仅去掉2输出键后SQL完整frozenDigest分别匹配原值，请求/报价/原通道/任务ID/模型计费版本保持。按原release/原operation UUID继续尾部，未重提任何任务；运维补丁e297b12c不改程序。
- 完整145组独立PG等价/状态变更、实际副本回滚与145组回退行为通过；完整91页Linux生产build/tsc0。Git已普通合main并推送，发布程序与后继运维文档SHA分别报告。
- 补充筛选发现operations review/error仍9.492/2.916s，追加精确表达式/partial索引的独立短三锁事务；仍不改程序/入口/任务。不把首页快冒称所有筛选都快。最后结果见output/admin-query-performance-20261021/FINAL_EVIDENCE/filter-index-transaction/VERIFICATION.json。

- 补充索引已COMPLETE：review9492→443ms、error2916→70ms、done110ms、needs_attention291ms、pending113ms，均HTTP200。独立备份/并发索引/完整容器和网关canonical原字节保持证据已回读，三锁释放。查询本身仍原程序，未做第二次程序发布。
- final-status-closure追加单独核验记录：原失败与rollback-pending原值完整保留到reconciledFailure和私有旧journal证据；在原publication/operation均ACK、实际preservationReview通过、旧槽停止和回滚check通过后，明确闭合旧错误标记，不创建新程序publication。
