# R10H：媒体元数据写入归属与原图/探测一致性

## 模块与基线

基线`2efa8c9594750e557ee72f93adc748c86cd98330`；独立`codex/core-refactor-20261024`，完整5414文件原始hash及源码归档已保留。整体重构ACTIVE，本线程未部署、未合main。W1不重复开发，本轮推进R10F审阅W2。

## 实际调研与基线

- Canvas原图拥有自己的媒体表INSERT/关联事务；视频探测在自己表写probe后独立更新media尺寸。跨模块3处媒体写入把metadata规则分散。
- 实际PG/Sharp/本地存储/媒体GET handler的原33检查，保留原字节、原浏览器预览、跨账号拒绝、并发幂等及整组回滚，并复现三个counterexample：probe先提交但dimensions失败、保留v1 canonical probe却用后到输入改dimensions、原图元数据消失后关联0行仍返回成功。
- 这些是本轮可复现实验，不冒认为生产事故唯一根因。

## 职责与公共接口

- `media-assets/writer.ts`是媒体元数据写入owner，使用准备好的事实，零codec/存储I/O/隐式连接/commit。`registerOriginalWithPreviewsTx`拥有原图与两种预览的同owner/digest注册及关联；`updateMediaDimensionsTx`只在key+sha匹配时投影。
- 现有`media-assets.ts`仍是服务端公共入口：`assertOwnedMediaVersion`执行存储前只读检查；`registerOriginalWithPreviews`初始化后开一个短事务；Tx版本供已有事务使用。普通mutable `registerMediaAsset`也转交writer，原owner保留、SHA变化清预览的既有行为不改；不把所有历史mutable对象强制变immutable。
- Canvas只处理上传意图、原图/浏览器预览校验与对象保存，全部metadata事实在开事务前准备，随后调用媒体公共接口，不再读写媒体私表，不在metadata事务内运行sharp或存储I/O。
- video保有probe及decoder_version规则，`recordMediaProbeTx`在传入Tx写probe后读取真正保留的canonical probe，再通过媒体owner写尺寸；普通入口在schema readiness之后用同连接事务编排。v0升级、v1保留、旧SHA不覆盖新资产均保持。
- media-assets内部variants/mirror仍属于同一个媒体模块，不为“一个SQL文件”机械重排所有已有内部实现。未新增储存框架、DI容器、全局事件总线或用户业务限制。

## 事务与边界

原图+预览仅metadata原子提交；对象字节仍先持久化，metadata失败可能留下未公开的对象，不声称对象存储参与PG回滚。并发不同owner的专项race只证明prepared metadata API的CAS，不冒充任意同key并发对象写入的跨存储原子性。旧格式、私有ACL、镜像状态、原URL/字节及一般mutable注册继续兼容。

本轮不做全库历史probe/尺寸回填；原recordMediaProbe可按同key+sha幂等修复原记录。新事务防止新的部分提交，不把既有历史数据状态自动写成已修复。无新增计费或供应调用。

## 验证记录

原33检查BASELINE PASS代表反例成功复现；新版38检查PASS，含actual media GET、exact原图/preview字节、caller Tx回滚/零嵌套checkout、两个metadata contender一个owner、旧摘要及decoder升级。集中回归：browser-reference-upload 121检查、private-media-db、media-variants、project-media-owners 33检查、W1账务写入35检查均exit0。generation原23个子用例全部执行通过，局部runner仍按合同PARTIAL/exit2，不代表完整core通过。runner合同20case/372check、非增量tsc、定向lint均exit0；实际类型输入5121个及4配置hash绑定。四类源码SCC均0；两条lib→app仅release fixture。

实际Worker bundle构建2427输入、2个外部包、HTTP route输入0，真实createDirectWorkerApplication导出加载通过，未执行DB或供应调用；这不是新完整Linux Web/Worker镜像验收。

两次完整video-fusion媒体formats/interface命令分别exit1，均在harness.ts:39解析空Router URL时退出；未设置VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL，也未提供带hash校验的独立Router binary、私有fixture配置和素材。本轮没有伪造地址/凭据或连接现网来绿化测试，没有进入其App/媒体业务验收。原始失败保留在CONCENTRATED_COMMANDS.json，两项仍待专属原生夹具下验证。

完整5414原始文件、当前5417源码及9路径改动（4产品/3验证与登记/2文档）由最终MANIFEST逐项绑定；四产物、独立副本恢复原33反例、later-edit首写前零写、binary patch replay和自有PG清理结果以本轮VERIFICATION/DELIVERY实际终态为准，不将预期当通过。

W3工作台/Agent协议应用规则、九类故障剩余维度、最终完整CI/main及整体退出继续；本模块通过不等于整体重构完成。
