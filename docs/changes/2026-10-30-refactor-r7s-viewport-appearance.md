# R7S：画布视口与外观归属，主线增量整合

日期：2026-10-30。独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。整体重构 ACTIVE；未合 main、未部署，47 HOLD。

## 固定来源与调研

原始基线 `c4333f12665de70ecef56c0ff465b1e9268b4610`，完整5161文件raw哈希及归档保留；本片固定 incoming main `1754dad45d920db991233c59f82c6ffb1fedfe66`，相对上次来源新增17提交。普通merge的两个冲突保留模块化Canvas和DB facade，将实际增量迁入原owner；不恢复旧页面28037字节节点定义/多份composer或237925字节DB实现。

分支超过48小时未合main的债务仍在：完整整版core/Linux/产品及容量验收未全部完成；分支推送不当作主线或生产完成。原始材料、三侧冲突和命令存 `output/refactor-r7s-20261030/`，不覆盖R7R。

## 模块、端口与依赖方向

- `useCanvasViewControls`拥有用户手动导航和本地外观。默认light，SSR/首个客户端树一致；layout effect恢复本地偏好，既有显式dark选项保留，不改变站点主题。Fit/zoom/pan的手动意图递增本组件navigation revision并撤回尚未完成的focus。
- 新 `useCanvasViewportFocus` 拥有深链/定位节点的动画调度，读取现有纯`canvasFocusViewport`和`flowNodeSize`；只写ReactFlow视口，不写节点/SQL/history/任务。输入为原focus、文档/视图身份、尺寸及现有Flow端口。两帧等待、原280ms动画与原几何规则保留；旧帧、旧完成回调不能抢过后到的手动导航或新目标。
- Canvas页面只提供focus意图、当前文档参数、Flow refs和用户交互接线；不再保留独立定位effect。原快捷键/尺寸/数据owner不变。
- 外观用原`SurfaceAppearanceProvider`穿透portal；样式变化分别归图片/文字节点、image composer/generation controls、text composer、import status，未把已拆出的UI粘回页面。
- 数据库主键探测`schemaDb`修复已存在于`persistence/schema`。保留该owner与pool-keyed readiness，只迁移真实PG verifier定位；不假造本片新增修复。
- APIMart单次语义→wire映射接入原计划/适配器：冻结semantic质量权威，effective wire alias不再当semantic重映射；历史preset、原完整报价保持。
- Flash比例资料修复保留纯policy/运维脚本，不执行正式DB更新，不修改冻结历史任务或当前管理员配置。

## 反例与实际验证

- 原完整c433副本的scene实际Next/真实PG/Worker/storage/billing原生整链 **PASS/exit0**，模拟供应商5次、实际付费0；因此旧R7P偶发失败不冒充本片稳定复现的产品缺陷。
- 独立实际React钩子反例明确复现另一时序：原focus effect排队后用户Fit/zoom，原effect仍后到写视口。原7组REPRODUCED/exit1，新15组PASS/exit0，覆盖两帧间手动操作、在途ACK、新目标、换文档、未就绪和0尺寸。ReactFlow命令端口/帧时钟受控，不冒充真实Flow命中测试。
- 实际组件浏览器：theme controls15、panels23通过，无pageerror/外部请求。实际PG bootstrap28检查（max1、无第二checkout、旧数据保留）通过；APIMart17case/63检查、Flash policy18检查通过。
- 完整固定源码core目录从143增至150，新增视口、主题三入口、bootstrap、single-pass、ratio policy。最终同SHA完整core结果及scene/原生theme实际控件只以REPORT/DELIVERY记载，不由上述局部结果推断。

## 交付、回滚与剩余

最终四件为同目录MODIFIED_FILE.tar、byte-exact DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；副本回滚前完整hash guard，恢复原5161哈希并重现旧视口竞争，开发树保留新版。精确命令/输入/输出/退出码和完整验收由DELIVERY登记。

仍需最终完整Linux同镜像、全产品混合负载/容量、其余热点与普通main最终整合；既有层反向边不因本片新增context被算作消失。原scene基线通过与本片固定源通过分别留证；不承诺全环境偶发问题永不重现。整体ACTIVE，47 HOLD。
