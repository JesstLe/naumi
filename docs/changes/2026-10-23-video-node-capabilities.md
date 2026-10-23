# 视频节点完整能力与参数接线

## 本轮目标及现场

用户在多个视频模型上都遇到只显示文生、单时长、少清晰度和比例。基线 `9ae4edff57efdaf34d1418ae58fcc12e1c4c1582` 中，33 条家族预设全部仅一档时长、一档分辨率，29 条仅 text、31 条仅 16:9。

这些数据原是成功 smoke 输入，却被 `makeVideoFamilyPlan` 写成完整人工能力。人工优先于供应商，所以资料更全也被遮住。两个旧供应商 codec 也有限定模式，单改 UI 或扩大列表不足以接通。

## 实现

1. 原 `video-family-presets.json` 原字节保留，33 份原 smoke 成功证据不变。新 `video-family-capabilities.json` 独立保存 32 个启用型号的文档声明、来源 URL/SHA256、核对日期与 smokeInput。特殊视频编辑型号仍不启用。
2. 新 `apib-video-v2`、`geek-video-v2`、`geek-h3-v2` 显式接线。旧 profile 和旧 codec 不改，历史任务按原模型版本、冻结能力和 profile 恢复。后续改变 wire 语义仍需新 profile，不复用既有冻结合同名称偷改。
3. 文档整数范围展开为离散秒数。稀疏 5/10 秒保持稀疏；不把文档全部型号统一成 4K 或 1080P。
4. `modeParameters` 表达模式的时长/清晰度/比例限制；`resolutionAspectRatios` 表达清晰度相关比例。UI 与服务端共用 `videoParameterScope`。来源优先级继续 admin > vendor > adapter，较低来源的条件表不覆盖管理员显式值，包括 null/[]。
5. 视频节点增加独立时长选择；参数面板、完整设置页按当前模式与清晰度联动。引用删除后重新分配帧角色，避免首帧可选模式删至一图后留错角色。浅色控件、390px 折行沿用现有组件。
6. 新安装读取文档声明；已有安装使用 `makeVideoFamilyCapabilityUpgradePlan`，只改 `capabilities.video`、`capabilities.maxReferenceImages`、`parameterMap.videoProfile`。它直接对比旧 smoke，只接受原值或目标值，管理员改动冲突，缺项不创建，启停、可见性、价格、凭据、绑定及业务策略不变。通过已有 draft/revision/version CAS 发布新版本，不更新旧版本或旧默认能力行。

## 精确协议差异

- Seedance 1.x：图生和首尾帧保留六个具体 aspect_ratio；1.0 用显式角色，1.5 用有序 image_urls。
- Seedance 2.x：比例发送 size；帧角色与普通图参考分开；2.5 帧模式固定 size=adaptive。
- Kling Turbo：首图发送 first_frame_image。Kling 2.6/v3/Omni/O1 的分辨率映射 std/pro/4k；V4 不发送 mode。Kling 2.6 首尾帧仅1080p；Omni 首尾帧显式 image_with_roles，不误用普通引用的 image_urls。
- Wan 2.5：发送 size，图生省略；480p 只含三个固定文生比例。Wan2.7 R2V 普通 reference 仅五具体比例，不发送文档外的 adaptive；single_image 跟随首图、省略 size。Wan3 使用显式角色区分帧与普通参考；Geek 单图 reference 显式 all-reference。
- H3：普通 image_urls 全是参考图，不按图数猜首尾。APIB 首尾用独立字段；Geek 保留所选六固定比例，不沿用旧 MiniMax 强制 adaptive 的行为。

## 实现边界

- 本轮实际开放文字、首图、首尾帧、普通图片参考，按型号证据决定；不是每个型号都有所有模式。
- 供应商资料中的视频/音频参考已研究，当前新 profile 尚未接线，执行能力 limits.videos/audios 全为0；原研究保留，不把未接输入显示为可用。既有声音开关保持，不扩高级参数或自动时长 -1。
- Geek 720p 组合 SKU 仍保留720P。文档虽说明 output_config 可选1080P，但未证实它能覆盖该精确SKU后缀；不代入其他型号范围。
- 文档支持不等于每个组合都已付费出片。原33条 smoke 不扩写成新组合实测。
- 新仓库声明不会自动更新线上不可变版本。47维持现有配置、合并后暂缓发布；未 SSH、未发布模型配置、未创建或重提供应商任务。

## 集中验证及证据

`output/video-node-capabilities-20261023/VERIFICATION.txt` 保存最终命令、输入、literal结果、退出码及之前的非通过尝试。入口：

```powershell
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-node-capability-options.ts
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-family-preset.ts
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-verified-video-profiles.ts
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-family-capability-upgrade.ts
# 显式隔离本地 PG；真实 repo 新版本冻结/旧版本保留/回退新版本
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-node-capability-publication.ts
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-frozen-source-authority.ts
# 无 API 和供应商的真实 React 控件 fixture；另终端运行 UI verifier
node --import tsx scripts/serve-video-node-capability-fixture.cjs
node scripts/verify-video-node-capability-ui.cjs
```

UI fixture 使用真实产品组件、文档能力和 client-settings，不是概念稿；没有应用 API、真实目录或付费生成验收。桌面1366px、移动390px截图均实际渲染并打开核对。

首次集中检查暴露并已修正重复 H3 mode、normalized 引用类型多余 inlineData 访问；首次 GUI 验证把原生 select options 也计入弹层数，限定 listbox 后重跑。PG配置测试首次漏 SETTINGS_SECRET，补本地专用环境后通过。新 publication verifier 收紧整份 definition 比较后，期望遗漏 `sources.videoProfile=admin` 导致一次夹具失败，补齐来源断言后重跑。ESLint 将局部函数名 use 识别为 React Hook，已改为 preferMode。

旧 `verify-saas-video-profile-integration.ts:72` 在旧 `9ae4edff` 整树副本及本轮当前源都失败：token 内 `sha256` 为 undefined，期望 `b814b48a3833a6fb2250a90ec6c9b89f33ebf7d4ba59da3f543ca981eaa38a22`，两次均 exit1。脚本没有本轮改动。该既存失败未删除断言或修产品，本轮不宣称全套 SaaS 视频集成全绿；新的配置发布/目录与旧冻结验证使用独立集中入口通过。

第二轮独立复审另发现提交/工作流把 frozen.definition 重新标成全部 admin、Omni 帧角色及 R2V reference adaptive 三项P2。托管消费现保留 frozen.sources，legacy adapter 才单独 resolve；Omni 用显式帧角色，R2V删掉两档清晰度下文档外比例。研究摘要与供应商留存原文冲突时，本轮依据原文修 wire，不把旧研究摘要当作正确性证明。

最终集中结果：options 32 型号 / 92 模式 / 912 wire 样本 / 1254 用例、8251断言通过；旧33 SKU 802断言与更新安装器886断言通过；选择性升级66断言通过；真实隔离 PostgreSQL 的32型号新版本冻结、旧33行hash不变、版本CAS及回退新版本通过；真实React桌面/390px交互8项通过，API提交及供应商调用0。完整tsc、限定ESLint及diffcheck通过。未执行完整Linux镜像构建和真实供应商出片。

冻结来源入口补测通过：真实隔离PG保存并重读5条冻结能力，实际 createValidatedVideo（execution scope为合成、冻结值来自PG）和实际 freezeVideoWorkflow（admin/executor/billing依赖均为真实实现）完成8场景/16次入口检查；旧表达式仅在内存编译对照中恢复，10项反例均能区分旧缺陷。管理员null/[]保持阻断，vendor冲突值被拒；合法管理员值在提交到参考授权时止于故意不存在的原图，工作流冻结获得真实quote，不将其记为生成成功。reservation、hook POST、供应商POST、HTTP均0，原冻结5行hash不变，随机schema及连接清理通过。最终定向独立静态复审 remaining=0、新增相关P1/P2=0。

原字节基线和独立回退副本均重跑旧安装器：`VIDEO_FAMILY_PRESET=PASS active_skus=32 declared_skus=33 disabled_skus=1 assertions=822 http_calls=0 paid_calls=0 fixtures=synthetic-config`，exit0；当前修改源保留。四件产物为差异源码ZIP（不是完整源码包）、二进制Git patch、VERIFICATION及可执行ROLLBACK，完整基线另存 `baseline-source.tar`。

本轮功能模块同步记录：开工/收尾刷新 origin，基线9ae4edff；选择性合入升级规划器aa96a9ea（父实际cherry-pick为901a986a），不切换共享main checkout。远端刷新和最终提交/推送以证据记录为准；未整合在途或未提交的同事代码。

本轮不生成正式发布版号，不向公开发布记录写入未上线条目。后续准备固定构建时，再绑定真实候选版号和面向用户说明。
