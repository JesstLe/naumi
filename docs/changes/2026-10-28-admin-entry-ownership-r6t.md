# R6T：浅色后台整合与入口会话 ownership

## 来源、调研与边界

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`；基线 `38e4617951bc5ff2bb356b293e4db079b0eca5e1` 的 4696 文件完整原字节归档并回读。固定 main `00a27d6a60f51922aa2624621beb9de14fdd7f2c` 的两个浅色后台提交、36 路径已普通 merge；未冲突，也未恢复原 db／Canvas 单体。证据目录沿开工日期 `output/refactor-r6t-20261027`，实施跨至 2026-10-28。

完整读取主线导航／Shell／真实页面及本树 Canvas 余下编排后，本片选择与新增后台直接相关的入口会话职责，而不是同时改第二套 Canvas 生命周期。原 `admin-client` 将两种登录、缓存、网络及密码表单提交混在页面；读 effect 的 cancelled 只覆盖部分 continuation，本地密码 POST 完全没有账号／卸载身份，云会话 getSession 返回后也可继续旧账号的下一次请求。

## 模块与唯一职责

- `admin/navigation`、Shell、page-search 和局部 theme 保留主线原实现；页面仍渲染现有真实业务模块。
- 新 `use-admin-entry` 只拥有管理入口的本地／云会话选择、读取状态、原可选缓存及密码表单提交；不拥有权限规则、钱包、模型、发布或业务数据。
- `admin-client` 只呈现原登录／加载／无权限／暂不可用／设置页面并处理原目的地跳转。
- 账号／ready／mount identity 在读取、getSession、后续请求、缓存写入、提示及密码响应处统一校验；读请求可取消，已发送密码 POST 不取消、不重放，只丢弃失效的 UI continuation。
- 原 `naumi:adminVerifiedV1` 键及 5 分钟同账号 UI 优化保留；真实 API 每次仍服务端鉴权。网络／5xx 与权限拒绝分开，重试仍读原服务端，无新增确认、运营限制或并行会话系统。

## 验证与进度

完整实现后集中执行真实 React 的原／新普通登录和时序反例、主线 Shell 控件、真实 Next／PG 原接口，以及统一固定源码 core／完整包验收。基线 PASS 只代表原行为复现；主线已有 `unavailable` 修复的精确叶文件另存作控制，不将本轮入口生命周期改善归功于新 UI。所有失败、四产物、独立副本回滚、Git 与清理按实际结果补录。

整体重构保持 active；本轮不合 main、不 SSH、不部署、不操作发布锁。剩余 Canvas 编排及最终整体／容量验收没有被本片替代。

## 集中模块验证

- 实际完整旧入口 44 检查、固定主线叶文件控制 44 检查、新入口 51 检查通过，均使用真实 React 与自有回环 HTTP；三个普通登录／设置 HTML 完全一致。旧账号画面、旧 getSession 后续读取及迟到密码响应的反例分别由 RETAINED／SENT／APPLIED 变为 HIDDEN／STOPPED／IGNORED；同账号缓存键／TTL、密码原 body、明确拒绝、原目的地、ABA 和卸载行为保留或验证。
- 本测试的 auth provider 和受保护子组件是明确 ports，不把它冒充服务端授权或完整后台验证；真实 Next／PG／原管理 API 另行覆盖。
- 主线实际 Shell 控件 15 项通过；完整旧 Shell 2 项复现深色布局，原脚本按其约定输出 REPRODUCED／exit 1，保留原样，不改成 exit 0。
- 全项目 tsc、22 个受影响 TypeScript／脚本文件 lint 均 exit 0。结构核验：1421 个原领域／API／服务文件、113 个原 Canvas 文件字节保持；6 个主线 UI 模块精确保留。入口 254→115 行，网络／缓存／云会话离开页面，唯一密码 POST owner 在 hook，新 schema／任务／账务 owner 均 0。
- 真实后台夹具复用原 SaaS seed 和原管理 fixture，新增 CJS checker 直接走既有独占源码／端口／IPC 生命周期。首次轮次用 networkidle 等待 Next dev 长连接超时；第二次观察器错误保留已返回的可选 fleet 404 body，两次均停止自有 checker 并由原 runner 关闭 fixture，终态及原始部分结果保留。当前只等待初始业务 API 完成，并在错误 HTTP 头返回时结束该条观测，不丢业务断言；正常业务数据仍等待完整返回。
- 入口测试首次准备错误在模拟账号刷新时覆盖了测试所设的空 token，导致等待登录提示超时；修正 fixture 顺序后通过，未为该观察器问题修改产品。

接下来以统一提交固定 core59、真实后台最终轮次、完整 Linux 同镜像运行／产品浏览器及四产物回滚收尾。最终通过数与源码 hash 按实际记录补充，不将已有测试库存当本轮全部通过。
