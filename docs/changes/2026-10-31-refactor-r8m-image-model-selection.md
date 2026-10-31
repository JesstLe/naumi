# R8M：Canvas 图片模型选择与规格联动归属

## 模块、调研与基线

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。原始基线 `682988e2bafc70a1f44193f8b91e313b10c765ce`，5,292 个原文件的 raw SHA 和完整源码副本已保留；本轮 fetch 主线仍为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，R8L 刚完成三模块同步，本片为之后第 1 个产品模块。

Canvas 页面仍直接拥有 managed/legacy 目录投影、当前/保存/默认模型优先级、模型家族合并、比例和分辨率联动。目录实际读取已有 `model-config/feature-client`，节点比例已有 `image-node-drafts`；不应另建一套目录缓存、参数 store 或生成执行系统。

实际旧页面 effect 和点击函数的 React 入口确认：legacy 偏好的 `localStorage.getItem`/属性访问异常各造成一次渲染崩溃，`setItem` 异常造成一次未处理事件错误。存储只用于偏好，却影响了正常模型选择。此为隔离浏览器复现，不冒充线上事故唯一归因。

## 公共接口、依赖方向及状态归属

- `canvas/image-model-selection` 拥有目录模式判定、选项/模型联合投影及规格联动的纯规则。managed 选择顺序、未知 managed 目录的原等待分支、legacy current/saved/default 优先级与家族 compaction 全部保留；原完整模型元数据继续贯穿。
- `use-canvas-image-model` 只拥有 editor 的 model/options 联合快照和 resolution。它调用现有 `useFeatureModels` 与 `useImageQuality`，不新增 fetch、目录缓存、listener、服务端报价或钱包入口。
- legacy 偏好读写位于 hook 的浏览器适配，异常时保留内存选择；managed 选择继续调用原 feature selection，不读写 legacy key。原偏好 key 格式不变。
- 比例仍通过原 node-draft setter 更新，prompt、引用角色及 sessionStorage 归原 draft owner。规格 effect 捕获原 draft key；组件只提供 draft port，不交出文档或任务写入权限。
- Canvas 仅组装 draft 与 hook，消费模型、规格、质量和既有事件；风格/count/mode 等展示及创作模式没有机械打包进 mega-hook。

依赖为 Canvas→React hook→纯选择规则；目录读取、质量、draft 是沿用的既有 owner。纯规则只 type-import 目录/公开配置合同，不依赖 React、Next、浏览器存储或网络。原生成任务、报价、冻结 plan、钱包、素材授权、operation、UNKNOWN 恢复和历史保存均不改。

本片不改变全局 feature-client 的缓存命名空间，不扩大为账号/工作空间目录生命周期已修复；该共享 owner 的完整身份审阅仍是后续工作。原参数组合、数量、画质、供应商能力和服务端 admission 规则不借结构调整重写或新增限制。

## 验证及证据边界

实际旧 Canvas 两个 effect 与实际 compaction/参数模块捕获 117 组目录与规格输入；新版同组选择、元数据与规格结果 EXACT。实际 React＋原 node-draft hook 覆盖 managed 选择/质量、legacy 保存偏好、显式 legacy 带版本、managed 目录等待、节点草稿切换和 workspace namespace，以及存储读/访问/写异常。目录/config/quality 是明确的受控读取端口，不当作真实 PG 或供应商验收；完整固定应用另验。

首轮改后 DOM 比较在所有行为断言之后失败：Playwright 内存对象保留 `combinations:undefined`，旧 JSON 报告省略该属性。比较统一为原本持久化的 JSON 投影，保留全部字段值/选择/草稿/错误断言；原 exit1 和完整失败输出保留，不改产品代码或清洗旧结果。

两个新验证器加入既有 core catalogue，188→190 是注册数量，不是本轮全 190 执行数。按完整模块集中执行类型、直接相关 matrix 与固定完整镜像浏览器；最终实际命令、输出、退出码、原始失败和未执行边界写入本轮 VERIFICATION/DELIVERY，不复用 R8L 的188/runtime177充当本轮通过。

## 未完成项与下一步

整体 ACTIVE，候选未合 main、未部署，47 HOLD。继续共享 feature catalogue 身份生命周期、剩余 Canvas Shell、R8J 调度等待诊断、持续混合/生产容量、有效远端 CI、最终普通 main 整合及生产验收。**独立整体候选超过48h：按用户完整重构版本要求保留，完整退出仍未达到。** 本片的局部源码与验证不当作整个项目已完成。


## 完整模块预检

实际工作区：117组规则/规格结果EXACT；实际React 12项、8组共同选择/规格/draft快照EXACT，旧存储读崩溃2→0、写事件错误1→0。原创作栏58场景/152检查与原source完整HTML相等，模型/比例/分辨率/数量价格输入保持。全TypeScript exit0，lint exit0/37条既有warning，新hook无warning；原页面规格effect迁走后少1条旧warning。

原SSR验证器在原source也缺textComposerFocusRevision，首轮baseline exit1保留；向两侧相同提供revision0，原58组/价格/状态断言不改。模型参数的SSR端口跟随真实页面hook结果，不恢复旧页面选择算法；真实hook另由DOM12覆盖。


## 2026-10-31 R8M：模型选择与规格联动封版（整体 ACTIVE）

固定应用/验收源码 `26f787e0fd1f54c9f02571584a7d211b2d01b672`，生产Dockerfile同Web/Worker完整镜像 `sha256:9d9f5b9e6f20cf6dc0baa3f577e1e91b4dce14ac7ff9c58d2e5532de023b7627`。模型/options联合投影、原managed/legacy优先级及规格联动归canvas/image-model-selection和use-canvas-image-model；页面只接原node-draft/feature/quality端口。legacy存储读/访问崩溃2→0、写事件错误1→0，偏好失败不影响内存选择；managed不访问legacy存储。提示词/比例仍归原draft，目录/质量/任务/报价/钱包/UNKNOWN均沿原owner，不新增fetch/cache/task/store或业务限额。

只改变CanvasClient一个既有产品文件，新增2个职责文件；其他2128原src/services逐raw SHA保持，移出pickGenerationModel，167个其他原函数正文逐字节相同。117组实际旧effect/新规则的选择/规格结果EXACT；真实React+原draft12项/8共同快照EXACT，目录/config/quality为明确受控读端口。原58组创作栏HTML/价格输入相等。类型exit0且2572输入逐hash桥，lint exit0/37既有warning，新hook0warning；四类SCC0，2条release fixture反向边与1条dist生成未解析边单列。

同SHA/digest的20个直接受影响入口全部新执行PASS/0失败/0未运行/0复用（只就选中20而言）；scope=r8m-affected、status=PARTIAL、原runner exit2。catalogue190是注册数量，**本轮没有执行全部190或原runtime177**；R8L53cb的完整188/runtime177只保留历史归属。本轮完整固定镜像实际双browser92通过，原31图ZIP逐字节、原任务/原价/账务及七笔42积分fixture保持，POSIX drain与自有PG/容器/网络清理通过；隔离供应商不当生产或10万容量证明。PowerShell驱动外层非零与原runner子进程2分开登记，没有将PARTIAL改写成完整core绿灯。

原DOM undefined/JSON投影比较失败和SSR旧夹具缺focusRevision0的baseline失败原样保留；只对齐相同持久化投影和原UI端口，原模型/价格/草稿/错误断言保持。完整5297源码、字节patch、原5292rawhash独立副本回滚（恢复旧2读崩溃/1写事件错误）、later-edit零写入及四产物以本轮DELIVERY/VERIFICATION为准。最终封版仅5文档bridge；只在独立候选分支推送，未合main未部署，47 HOLD。

本片为R8L同步后第1/3产品模块；最新main仍e2f56255，无新增待合。**独立整体候选超过48h：用户要求完整重构版本，完整退出仍未达到。**继续共享feature catalogue身份生命周期、剩余Canvas Shell、R8J等待诊断、持续混合/生产容量、有效CI和最终main/生产验收。共享feature cache命名空间未在本片改写；历史ZIP socket根因与其他历史问题不因本片通过自动关闭。
