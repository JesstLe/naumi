# 视频前端旧能力裁决与素材角色改写退出

## 模块与职责

UI只表达草稿/意图/素材图谱，参数控件由公开编译合同投影；模型切换只改变身份。视频服务端/compiler继续拥有正式编译与真实物理校验，Canvas拥有连线/节点与历史，Agent拥有本轮选择的冻结。

本切片覆盖Canvas紧凑Dock、完整设置、Workbench、Storyboard既有共用设置、首页Agent创作设置、原生节点创建和画布连线。既有新编译链不变；服务端未绑定legacy链路仍未退出，不能把UI清零当成全局P3完成。

## 确认缺陷与修改

- 原createCanvasVideoNodeActions即使模型已有新版execution，仍读旧definition.modes，把单张普通图改first_frame并保存mode。原link-command目录缺失/删线时仍按mode重新分配素材角色。现在创建/连线只保存原身份、顺序、用途，不猜首尾帧，不改模型或执行配置。
- compact/settings/modelpicker不再调用supportsVideoIntent、mediaFits、reconcileVideoSettings或videoModeRoles。模型切换不清空提示词、参数、workflowTaskId或素材；模式选择只改变显式意图，不暗中切换其他型号。
- validateVideoSettings只检查可见依赖、结构与引用，旧modes/zero limits/supportsCamera不再否决。真正请求的Profile/政策/参数错误由同一服务端compiler/preview报告；BYOC结构/素材完成状态校验保留。
- VideoSettingsPanel、参数面板、时长及高级字段使用同一个VideoContractFields。已配置合同提供选项/默认值/结构约束，历史未映射值继续显示并可编辑。shots/elements/camera现有内容不因换模型消失。
- 首页Agent不再用videoParameterChoices清空resolution/aspectRatio，不再按旧能力限制时长，切换模型保留其他参数；复用合同字段编辑。Agent本轮参数schema从猜测模型规格改为有限JSON类型：fractional/automatic duration、adaptive比例和供应商规格标签可冻结，再由实际Profile裁决，不把这些值直接发送上游绕过编译。

## 未迁移通道与历史兼容

没有为调用清零而批量关闭旧通道。尚无execution的条目仍可选择/新建/编辑，初始化只读其明确default字段，不按能力列表选择或虚构默认值；通用草稿字段无能力白名单。其编辑仍保留原top-level mode/参数请求形状，原报价与服务端兼容链不变，但这不证明所有自动输入语义仍可执行。单图普通reference在旧single_image-only normalizer中会被判reference而拒绝，已单列验证为UNBOUND_LEGACY_AUTOMATIC_INPUT=NOT_MIGRATED。因此本切片不是可直接上线的全局替换：必须在发布前完成实际绑定迁移/服务端切换，或维持原发布版本，不能把保留请求形状误报为全链路兼容。新绑定通道继续使用intentPreference/parameters和编译预览。此兼容翻译明确在selectVideoUiIntent和共享字段编辑边界，将在实际绑定迁移完后退出。

旧前端规则集中移至legacy-client-settings/legacy-mode-selection，仅原规则对照测试与旧操作恢复使用，新产品UI不导入。旧测试显式标明historical，不把它们的PASS当作当前产品行为证明。旧mode-ui入口默认运行新版实际UI验收，baseline模式保留原历史驱动。老运维video-family-activation不接受新的PLAN/APPLY能力模板操作，已有APPLY_REQUEST可恢复、VERIFY/ROLLBACK不变；未在本轮执行该运维程序。

## 公共接口、依赖与状态归属

UI→ui-draft/公开UiContract→原compile-preview/submit；图谱创建/连线→Canvas保存与历史事务。前端不读DB、凭据或供应商SDK。旧normalizer模块因VideoContractError共享类型可能仍出现在编译输入图；因此同时检查原调用AST和真正tree-shaken运行bundle，不能用模块搜索数量伪造函数可达证明。

## 验证与证据

证据目录 `E:/Workspace/naumi/output/video-compiler-ui-exit-20261114`，最终完整command/input/literal/exit/hash见VERIFICATION.txt。

- 相同真实输入基线：UI_VALIDATION=图片参考素材数量超过或缺少已配置上限；NEW_NODE_MODE=single_image；NEW_NODE_ROLES=first_frame。修改后：UI_VALIDATION=null；NEW_NODE_MODE=undefined；NEW_NODE_ROLES=reference。
- 纯UI/原生创建/连线18项：旧zero limits不否决、待完成仍拒绝、缺目录删线保留尾帧、未知型号可创建、不虚构默认、显式意图不改素材/模型、Agent冻结自动/小数/特殊标签但不绕过后续编译。
- 实际React/Edge10项：无绑定零上限、连线/删线、参数互不清空、旧通道请求形状、模型切换、首页Agent共享合同/小数adaptive、只读、390px和无生成网络。
- 九个实际前端/图谱根：源码旧函数call0、tree-shaken运行bundle旧函数标识符0、legacy UI modules0。GLOBAL_BACKEND_EXIT=NOT_YET。
- 既有新合同实际React20、结构/无端点8、Storyboard6通过；角色/场景、原生Canvas动作、Agent24与119项真实隔离App/PG/媒体Worker/本地HTTP/账务/资产链集中回归。完整tsc、原规则fixture和解压副本/真实复制回滚以最终证据记录为准。
- 新驱动早期alias/类型、原生删线测试缺edgeId、AST过度要求共享parameter-options模块不出现、esbuild CSS缺outdir、Agent驱动括号/role选择器错误原日志保留；修正驱动后未放松实际业务断言。

## 未完成项

服务端submission/workflow-freeze、新任务legacy adapters/fallback、环境接入和全部实际无Profile组合仍继续。后续应在明确执行绑定与发布准备条件下退出，保留已受理任务/旧stage/显式重试和UNKNOWN；不把移除前端重复门禁写成已解除所有上游拦截。完整Next/独立应用Worker/restart/全RFC A01-A19/授权上游和蓝绿仍待完成，目标ACTIVE。生产绑定/配置写入0、付费0、部署0；47HOLD、103隔离线与共享25路径保持。

## 整合状态：前后端切换未闭环，暂不合主线

实际补验确认未迁移single_image-only通道在普通图片reference的自动模式下仍走旧服务端normalizer并报UNKNOWN_VIDEO_CAPABILITY。新图谱已经不再按能力改成首帧，因此这是前后端过渡兼容缺口，不能仅凭本切片UI检查通过就合main/上线。当前实现、39文件可回滚包和复现留在独立分支；main仍fd505379。下一轮必须在同一分支收口真实执行绑定/新任务与旧stage恢复边界、补齐未迁移通道策略和实际验收，然后再整合，不把待迁移直接当成关闭通道。
