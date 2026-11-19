# 画布智能拆层与分层 PSD

负责人为本任务会话。改动范围是画布已完成的托管图片、独立拆层入口、供应商回执验证、分层 PSD 和相应积分项。撤销、导入、原有图片生成和协作链路沿用现有入口。

## 交互与数据

- 右键点开已完成的图片，选择「智能拆层」，确认报价后提交。预览可单独隐藏背景、商品和装饰。下载保存完整像素图层、透明通道、名称与位置。
- `/api/canvas/layered-psd` 校验账号、工作空间、画布与源图版本。旧配置补齐一个默认禁用的可选计费项。启用后使用已经发布的固定积分规则与 APIB Seedream 5.0 Pro 通道。
- 复用现有创作记录、积分预占与结算、供应商费用账本和私有媒体存储。浏览器保留原操作号并可只读查询。已确认失败释放预占，受理不明保留原操作供核查。
- 逐层校验来源、声明尺寸、实测尺寸、透明通道、坐标和容量，按供应商回执中的顺序写入 PSD。使用模型补全的背景进行合成。文字区域保留为像素图层。模型会重建遮挡区域，真实效果取决于输入与供应商输出。

## 已核验

| 证据 | 结果 |
| --- | --- |
| `npx tsc --noEmit --incremental false` | 类型检查通过。 |
| `node --no-experimental-strip-types --import tsx --conditions=react-server scripts/verify-billing-coverage.ts` | 33 个计费入口通过。 |
| `node --no-experimental-strip-types --import tsx --conditions=react-server scripts/verify-canvas-layered-psd-pg.ts` | 回环 PostgreSQL、实际服务与鉴权读取路径、受控供应商回执。验证源图版本、预占、并发幂等、同项目及同账号访问、受理未知和失败释放、私有 PSD 下载。 |
| `node --no-experimental-strip-types --import tsx --conditions=react-server scripts/verify-canvas-layered-psd.cjs` | 390 像素 Chromium 中实操确认、超时后刷新查询、切换图层、保存真实下载文件。供应商与 HTTP 入口采用测试数据。可通过 `NAUMI_TEST_CHROMIUM` 指定浏览器。 |
| 实际 Next 画布 | 本地 fixture 账号中右键打开图片，确认、预览并看到下载按钮。使用测试文件与计费接口回包。 |
| `psd-tools` 和 Pillow | 重新打开浏览器下载的 PSD。三层名称、边界、透明度及导出合成与测试原图一致。商品层隐藏、移动、保存并重开有效。 |

隔离数据库脚本要求 `NAUMI_VERIFY_ISOLATED_DB=1` 和回环的临时 PostgreSQL `DATABASE_URL`。样例证据在本工作区的忽略目录 `output/layered-psd-verification/`，无真实业务图片。

## 47 真实验收与发布状态

- 按授权只对 47 的一张真实海报提交一次 APIB 拆层。源图只读获取，临时图片已清理。请求时间和图片指纹在本地忽略目录留档。
- 上传输入成功。生成提交这一步结束时没有留下任务号，首次探测也未持久化原始回执。受理、费用以及真实素材的拆层效果均未核实。用户目前无法从 APIB 后台查询，正式的任务查询接口需要任务号。本次尝试没有重复提交。
- 新实现已支持供应商任务号的两种回包字段，并在可取到时保留供应商请求号、回包摘要和已知状态。已受理且服务端处理完成的任务可重新查询和下载。若 Web 在服务端处理完成前退出，当前实现保留待核查记录，跨进程自动恢复仍未验证。
- 基线 `5aac42a2cff79080ba6f9bf20a46825c6ae1d2c9`，任务分支 `codex/canvas-layered-psd`，工作区 `E:/workspace/naumi-layered-psd-20261119`。真实任务验收前保留独立分支。没有构建生产镜像或在 47 启用功能，未占用发布锁。默认关闭的计费配置需在真实验收后按现行发布流程配置。

供应商约定见 [Seedream 5.0 Pro 拆层](https://docs.apimart.ai/en/api-reference/images/seedream-5-0-pro/generation) 和 [任务状态接口](https://docs.apimart.ai/en/api-reference/tasks/status)。

## 受限真实试用

用户选择用自己的图片验收。配置 `NAUMI_CANVAS_LAYERED_PSD_PILOT_EMAIL` 后，该账号可在 `/canvas?layered-psd=pilot` 中右键已完成的图片并确认「开始真实拆层」。链接只请求当前账号试用资格，用户所选图片在明确提交时才进入既有供应商执行流程。

试用使用服务端为账号固定的操作号，限定一次真实供应商任务，试用不扣站内积分。权限、源图版本和画布归属仍使用现有校验。没有试用配置的环境维持默认关闭，已有正常生产计价逻辑继续由发布的计费配置管理。隔离 PostgreSQL 追加验收通过，覆盖单账号报价、不同操作号拒绝、同一操作号重查和零站内积分结算，供应商回包为夹具。

### 47 试用版已发布

- 固定主线 `71e54e07cbcad181b3db0480f746a0b8e01db24f`，运行版本 `1795085574`，Web 与 Worker 运行同一镜像 `sha256:bc3a238d59bd92695d8abd08109c0b5d612533b05d78147e56aecf436524b2b4`。仅在 Web 私有配置启用用户指定的单个试用账号。
- 按授权在线扩展已有根分区，不改变起始扇区。文件系统可用空间从 9.29 GiB 增至 18.73 GiB，实际版本、健康检查和画布在扩容后均返回 200。
- Linux 固定镜像完整编译、类型、Worker 和 standalone 包校验通过。三锁及生命周期锁内完成可读数据库备份、旁路验收、平滑切流、旧槽排空与停用、新 Worker 和监督器核验。切流期间 465 次版本、健康及会话探测全部成功。释放部署锁后复核监督器，revision 2678，未知 Worker tick 为 0。
- 47 旁路确认其他已登录账号拿不到试用报价，公网匿名接口返回 401，带试用参数的画布返回 200。真实供应商调用由试用用户选择自己的图片后触发，发布验收未提交付费生成。生产证据位于 `/opt/naumi-staging/evidence/release47-layered-psd-20261119-r1/`。
