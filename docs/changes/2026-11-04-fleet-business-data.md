# 103 总后台接入 47 业务数据

## 目标与基线

- 用户确认范围：用户、订单、余额、账务、作品，重点为积分消耗。
- 源码基线 `268076b7fb4900509817af7321ad34a85698c86c`；当前 main `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`。
- 新任务分支 `codex/fleet-business-data-103-20261104`；保留重构验收分支与工作树，不提前合 main。
- 初始 103 只读现场：企业连接器心跳在线但版本 unknown；只有旧创作/策略指令，没有普通后台统计的数据接线。

## 职责、接口和数据归属

- 47 业务库仍是 47 用户、钱包、结算、订单和作品事实来源；103 不导库，不写回余额，不调用供应商或重放账务。
- fleet 增加显式 `business` 只读能力；旧 `read/creations` 授权不自动取得站点级业务数据。
- 新查询采用共同 asOf/时间窗、分页和受限 DTO；源站单一 REPEATABLE READ READ ONLY 事务读取事实。
- 中央服务仅排入带签名的读查询和接收原操作回执；稳定查询 ID 合并同窗口并发请求，签名查询标识可跨 Web 重启/切流继续轮询。
- 旧连接器未宣告 business 能力时不派发新指令；离线、失败、超时和未知回执不会转换为零或全量通过。
- 同邮箱在不同站点保持不同账号归属；全站数字只作显示汇总，不合并钱包。
- 旧企业作品查询与媒体权限不变；新增站点业务视图读取作品元数据，不公开跨站私有媒体 URL。

## 实施与迁移状态

- 已实现：协议/事实读取、中央签名查询协调、既有后台入口的站点筛选与业务查询。
- 47 连接器单 Web 版本探针与读取路径单独验证；只读查询不得触发全应用 schema 初始化。
- 运营概览、用户管理、充值订单、积分流水和作品数据五个既有中央入口均接线；保留 `?detail=local`、原日期/租户等旧深链接、完整本地用户管理与非 fleet 站点旧行为。原统一创作页保持完整功能。
- 快速连续筛选通过同步最新 URL 合并，避免旧 render closure 让“作品→积分消耗→全部站点”回到旧视图。真实页面发现的原始失败与修复后证据均保留。

## 集中验证及交付状态

- 已集中验证：源协议85项、双独立PG实际HTTP poll/ACK与admin route54项、UI合同58项、真实本机TLS8项、旧Fleet control/governance/local-status，以及整库TypeScript检查。对应输出均为PASS/exit0。
- 实际 Next/Chromium 页面使用双独立PG与真实HTTP connector（没有API拦截替代）通过7项：消费7+42、退款5、两站独立余额93/195、同邮箱分站、47筛选、五视图与既有流水入口。此处数字均为隔离fixture，不是生产47消费数据。
- 独立的实际Next浏览器状态合同15项通过：含五个原入口、partial/unknown不当零、403清快照、快速连续筛选与390px移动端无页面水平溢出。该状态测试显式拦截业务API，不冒充真实源库测试。
- 新增 `.github/workflows/fleet-business.yml`，在独立PG16服务上正式运行协议、UI、TLS和中央双库HTTP回归；测试凭据仅属于fixture，不使用生产凭据、不触发供应商。
- 待正式发布：103 蓝绿与最小 47 连接器更新，现场积分总数/明细/时间窗与源库独立 SQL 对照。
- 当前尚未发布本修复，尚未宣称用户验收或整个重构完成。

## 47 版本探针现场结论

旧47 connector指向的 `naumi-app` alias 在当前Web网络中不存在，DNS返回EAI_AGAIN。只读现场探针确认宿主bridge Gateway为172.30.0.1；HTTP80携带正确Host仍308，HTTPS443在默认信任链及明确IP SAN校验下返回200、当前Web6eddec90/1793679208。新connector应使用 `https://host.docker.internal:443`、`FLEET_SINGLE_APP_HOST=47.105.59.142` 与 `host-gateway`，不改Web网络、不禁用TLS验证、不追随重定向。新中央先于新connector上线。

## 部署准备

独立离线目录 `output/fleet-business-data-20261104/deploy103-preparation` 保留完整BLUE_GREEN adapter模板、114成员闭包复用计划、原生浏览器连续性gate与all-scope measured collector。未填fresh源码/镜像/canonical等pin前模板exit78；该准备不代表已部署，不复用旧ACK、resume spec或旧发布备份意图。
