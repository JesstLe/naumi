# 固定生产包的三媒体输入交互验收（2026-11-15）

## 模块与职责

本片从main2da4034aa843300ebafda38266c90ca55a699531继续RFC A06/A08/A10/A17的生产前端证据。此前三媒体上传/连线/@提及等价在development Next通过，但生产包仅覆盖基本Workbench/Canvas恢复/Storyboard；不是生产三媒体已验收。

## 公共接口、依赖与状态归属

仅扩展既有测试driver/session，不改变产品源码、媒体/模型/任务/计费/发布配置。`--production-input-equivalence` 必须同时选择固定生产包与owned storyboard session，在DB初始化前检查；原直接在Linux运行Playwright的隐式browser/input-equivalence分支仍拒绝。

生产session在原Storyboard完成前不开放input观察口。原finish在未选择新flag时保持退出；选择时冻结账务/POST边界，待真实三媒体UI完成并复核10次POST/10笔账本170 fixture积分才结束。只读观察按actor过滤，node限定input-eq前缀，完成指令核验actor和实际来源node，媒体/模型/账本始终由原Web/Worker拥有。不提供任意SQL、任意HTTP执行、凭据读取或注入组件状态。

Windows host复用原verifyVideoInputEquivalence函数，从session目录读取真实PNG/MP4/WAV，使用实际Edge、上传组件、ReactFlow端口拖线、@提及、参数保存/刷新和生成按钮。观察/Worker控制通过已有原子文件回执桥接，Linux固定Web/独立应用Worker/native媒体不替换；host端不导入Route/submit/compiler来代替生成。原guard三项负控（阶段未完成、非input-eq节点、未知观察操作）单独拒绝。

## 实现与验证状态

同一素材的上传/连线/@提及三条入口比较真实资产身份/hash、默认角色、requested/effective参数和语义wire；不是比较本地行ID或短期URL。每类素材经三入口各生成一次，另有混合顺序生成；核对下游parent、单账本、混合重排/重载和删除提及显式失效。跨用户预览仍422且零任务/计费/供应商副作用，真实UI无成功响应替换/React状态注入。

生产产品包复用be535f6e/1794704116、image5d45aa0d4cc0；与当前main的src完全一致，仅测试/文档变化无需再次构建相同产品。原Workbench4/Canvas恢复2/Storyboard10与新增输入21共37项浏览器检查，另有实际Web/Worker底座15；最终源/独立副本结果、原始错误、子进程退出、账务/字节数、准确命令与exit以 `E:/Workspace/naumi/output/video-production-input-ui-20261115/VERIFICATION.txt` 为准。

AST调用图与flag反控只证明验收驱动装配，不冒充上述真实浏览器；基线没有生产输入桥/host调用，复制回滚应恢复该事实与原底座检查。完整tsc、核心137及已有UI调用图集中验证。所有临时服务/端口只绑定127.0.0.1，随机PG schema与本地外部服务peer，原生媒体边界保持。

## 实际站点与未完成项

本轮只读重试103默认SSH22（认证前关闭、exit255）/匿名version（空响应、exit52），既有受保护绑定网卡连接超时，未取得当前启用Binding/env-only配置；已询问当前入口，不探测其他/废弃站点，不索取聊天明文密码。不把历史配置或32候选当线上目录。

真实启用路线审查/迁移、真实授权上游、更多结构化组合与真实站点浏览器/RSC/TLS/蓝绿仍开放；固定本地生产UI不等于公网验收。目标ACTIVE，47 HOLD及103隔离线保持，生产配置写入/收费调用/部署0。下一步继续实际Binding与站点证据，四产物和主线普通整合另记。

## 最终源与独立副本结果

最终源与独立解包副本均exit0：真实Edge浏览器37项（Workbench4＋Canvas恢复2＋Storyboard10＋三媒体输入21），原生产进程底座15项；三项桥接反控各被准确拒绝。每组实际16笔video账本/262 fixture积分，其中三媒体10笔170；15份供应商读取的真实输入字节记录保留，10个输入结果的父子资产/单账本/语义wire相等。所有pageerror为0，成功HTTP替换/React状态注入0；五个原生子进程、随机schema、pool、relay及各浏览器context均退出。不是相加成52个独立架构需求。

第一轮缺少多模态fixture配方导致audio-only被原minVideos1正确拒绝；保留失败及完整finally清理。修复仅将production flag接到既有显式参考配方，未改产品编译约束。最终source/copy均证明三媒体独立及混合路径；原文档未完成条目中的真实站点和全部结构化组合不因此自动关闭。

新驱动AST16、缺package/session两项DB前反控、核心137、UI旧调用图与执行准备报告、源/副本完整tsc集中通过。六文件原始哈希/原不存在状态回退后，生产输入桥注册四项均恢复false，核心137复测通过；工作实现与ZIP保持修改。四产物、原始命令/输入/逐字输出/exit及主线普通整合以VERIFICATION/INTEGRATION为准。
