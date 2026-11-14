# 视频编译器：Canvas上传、连线、提及等价验收

## 模块与职责

- 基线：`d0a299699da5377776381e2355a5b8a8e16201a7`；独立分支 `codex/video-compiler-input-equivalence-20261114`。
- 对应RFC A06/A08/A09/A17：真实Canvas中，上传登记同一素材后，经上传直接附加、ReactFlow端口连线、编辑器`@`提及接入，编译器消费相同素材事实。
- 产品输入基线已通过正控，未发现需要修改的三入口产品规则。新增真实浏览器验收模块及现有进程驱动的可选 `--input-equivalence`，不加模式、不猜型号、不改输入解析器或UI能力判断。完整组合另发现并修复Windows Worker持久状态原子替换的瞬时EPERM故障，见下文。

## 公共接口、依赖方向及数据归属

`scripts/video-compiler-input-equivalence.ts` 调用真实Next监听器，通过现有上传控件、ReactFlow手势、提及选项、保存/重载和生成按钮执行输入动作。不替换组件、不拦截HTTP、不注入React状态。HTTP仅建立空项目/空视频节点作为初始布置；数据库观察节点/账本，既有受控Worker接口推动处理。

上传仍由 `/api/video/references`、`/api/video/assets` 及媒体/作品owner管理；三条入口读取同一登记Artwork，而非重新上传三个同名副本。编译、权限、真实字节、任务冻结及结算继续由产品实现负责。

## 实现与验收范围

1. 三种真实文件：32×24 PNG、1秒H264 MP4、1秒PCM WAV。每种文件只通过实际浏览器上传一次，验证登记响应与原始字节SHA、类型和项目归属。
2. 上传入口自动附加；连线入口通过实际源/目标端口拖动，检查命中元素后操作；提及入口通过真实编辑器和候选菜单选择素材，持久提示词使用正式 `{{ref N}}`。
3. 对每种媒体分别运行三个实际视频任务，验证仅有一个直接素材输入，Artwork ID、storageKey、SHA、角色一致，图片为reference、视频为source_video、音频为source_audio。
4. 比较身份、意图、原始/有效参数、计费事实、完整素材事实和语义wire模板。输入行ID可因创建方式不同而不同，比较时只规范化本地行ID及引用这些行ID的wire占位；**不声称三个planDigest或短期签名URL逐字相同**。
5. 九个单素材任务均由独立Worker生成真实可解码MP4，父资产是所属原素材，每任务单账本17 fixture积分。
6. 三种媒体混合提及后，在高级参数中将第三个引用上移，保存/重载保持身份、角色、顺序；实际第十个任务的manifest按image/audio/video完整消费，不丢音频或视频。
7. 扩展反控：另一用户对三种素材的真实预览均拒绝，任务/计费/供应商无增量；删除被提示词提及的素材保留显式失效引用，不静默改指向或继续生成。

本地供应商recipe在fixture中明确增加音频和混合媒体映射，其能力声明仍保留旧text/零图片限制的poison数据；不是修改线上模型或声称任意上游都支持三媒体。测试账户额度只在该隔离fixture中提升，产品余额检查保持原样。

## 验证记录及证据层级

证据：`E:/Workspace/naumi/output/video-compiler-input-equivalence-20261114`。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres:video_compiler_local_fixture@127.0.0.1:15579/video_compiler_fixture'
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-compiler-process.ts --projected-worker-env --input-equivalence
```

产品未改的首轮有效基线 `baseline-runtime/run-f626dbe9-4154-4550-9df0-8fc015d01a3b`：底座14＋三媒体等价17，共31项，exit0，输入增量10任务/170 fixture积分。第一次驱动把PG bigint revision字符串当数值比较，实际上传和保存成功后观察断言失败；修正测试观察的Number转换，原始失败保留，产品未放宽。

跨用户/删除提及的最终增量及独立解包组合已经完成，最终回执见下节及四件套；主线整合另记，不等同发布。

## 组合运行发现的Windows状态写入故障

首次完整组合已通过原75项并完成新增图片/视频等价，至音频第二个结果完成后的drain返回503 `WORKER_CONTROL_FAULT`。Worker故障保持原样，没有自动重启或重发付费任务；该次运行退出1，13个自有子进程和3个浏览器上下文均关闭，schema和pool清理。该失败不解释成输入编译差异，也不擦除。

独立真实 `fileStateStore` 连续控制写入复现 `EPERM: operation not permitted, rename ... .worker-*.tmp -> state.json`。状态文件约24KiB、99个控制回执，未触发4MiB/4096操作上限。具体Windows占用者未确定，不据此删除数据或关闭外部程序。

修复只在 `scripts/worker-runtime.mjs`：`renameWorkerState` 对Windows EPERM/EACCES/EBUSY，原已fsync临时文件→原目标路径最多8次尝试，累计等待上限710ms；不删除旧目标、不重写任务、不重试供应商、不重放tick。非Windows、磁盘满/文件不存在等错误不重试；耗尽后继续现有 `WORKER_STATE_WRITE_FAILED`/paused/拒绝resume行为。文件同步和写入串行队列不变。

新增 `scripts/test-worker-state-rename.mjs` 5项：同源目标重试、持续拒绝有界、非Windows拒绝、磁盘满/源不存在、持续失败Worker不恢复也不发送。真实500次控制/501次状态写入已通过；不是供应商压测或Linux发布证据。


## 最终独立解包组合验收（2026-11-15）

六路径交付包的最终代码已在独立工作树运行：`copy-runtime/run-4d5e0317-ea2a-4d9e-807e-561d6811bda2`，完整96项通过、exit0：底座14、预算10、Agent6、远程工作流10、工作台4、Canvas10、Workflow13、ComfyUI8、输入等价21。这里的计数来自各模块逐项回执，不将底座末行的CHECKS=14误写成整个组合仅14项。

输入等价21项覆盖真实PNG/MP4/WAV经上传、ReactFlow端口拖线、@提及的九个单素材任务，混合顺序的第十个任务，三种跨用户预览拒绝，以及删除提及后的失效引用。结果父资产、原素材hash和单账本一致；增量10任务/170 fixture积分。完整组合31笔517 fixture积分，托管JSON创建30次、成片下载34次。三种浏览器上下文关闭、13个自有子进程退出、随机schema删除和连接池关闭。供应商实际读取字节与签名素材SHA逐个核对，见SUPPLIER_BYTES.log。

Windows修复后Worker49项、真实500次控制/501次状态写入、核心137、App138和完整类型检查通过。独立原子替换反控：基线单次EPERM退出1且原revision0保持；修改后第二次替换成功退出0、revision1；六路径真实回滚后再次复现基线退出1/revision0。回滚恢复源码字节，不回灌数据库、媒体或已受理任务；完整命令和原始输出见VERIFICATION.txt及COMMANDS.json。

产品输入规则没有为测试放宽；产品修复仅是Windows Worker本地状态文件的有界原子替换重试。首次组合503及真实EPERM失败日志继续保留。独立副本测试的四个脚本与最终包逐字相同；之后仅补充本模块文档和验收账本。

## 未完成项与下一步

此切片不泛化为所有字符/场景/多轨等高级素材组合已验收，也不新增递归祖先输入。稳定身份、前序未完成拒绝、显式历史选片与直接下游输入沿用已有独立证据。

固定生产Next构建、旧开发缓存冷加载异常、完整Storyboard编辑/审片/成片及报价按钮专用浏览器验收、全部在用/env-only绑定、Linux混合版本/中断/排空回滚仍待完成。

总目标ACTIVE。真实付费0、生产配置/数据库修改0、部署0；47 HOLD。Next为development，独立应用Worker为生产bundle，本机供应商fixture不代表付费上游质量。
