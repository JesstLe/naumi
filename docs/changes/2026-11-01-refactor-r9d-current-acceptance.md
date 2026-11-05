# R9D：整版取证与验证素材归属

## 当前真实结果

固定应用源码79705670的完整Web/Worker与原生SDK已构建，应用字节一致。第一次完整212在60PASS后theme重载等待超时；原参数重跑theme97检查通过，首因OPEN。第二次完整运行146PASS后真实timeline拖动检查失败；余65项独立执行全部PASS，runner仍PARTIAL。原版R8Z不可变SDK的相同timeline用例PASS，当前只读鼠标/导航观察下原用例亦PASS；这些诊断不关闭原失败或证明唯一根因。所有原失败和清理记录保留。

## 发现并修正的耦合

runtime实际依赖的timeline-rules已PASS、日志与应用同源，却因父报告另一个UI检查失败而被整体status拦住，尚未进入业务runtime检查。验证入口现通过小的runtime_vectors合同核对同源commit/digest、已通过的生产者case、实际日志hash/marker和5个素材；复制时再次核对素材hash。父报告FAIL/PARTIAL原样进入证据，不转为全core通过。生产代码、钱包、供应商、限额和UI均未改。

19个独立fixture状态检查已通过，包含同源/日志篡改、缺失/失败/在途owner、素材缺失与父级失败保持。新增用例登记原catalog，212→213；完整213当前尚未执行。实际Web/Worker runtime、browser、mixed结果按后续独立运行记录，不冒称此前setup拒绝为产品业务失败，也不使用R8Z旧通过替代。

## 职责与后续

runtime_vectors只决定输入素材是否可用，不决定发布或完整验收。完整core失败、两项间歇问题首因、当前有效CI、主线整合仍独立待办；源码/运行镜像/验证代码版本分别绑定。当前静态actor别名盘点48个零参数wrapper调用/31文件，不是运行事故证明，也不据旧AST候选0宣布全站闭合。整体目标ACTIVE；未部署，47HOLD。

## 本轮实际集中结果

- 应用79705670：Web/Worker同镜像`sha256:28513666ae28a09cd3f41df2e6e8d3e9dccf34b7bf04a3e7ea4a032254a53e4e`；SDK `sha256:0a30365db71107582407105b27831180cbd72d9f63a5355b57101e0e14d621b5`应用字节EXACT。原212全到达，211PASS/1FAIL来自同源完整146PASS与未到达65PASS，不复用旧case结果、不将两个报告合成corePASS。
- 验证9a1e8b2a：新合同19状态检查/登记case1实际PASS；runtime177、产品浏览器92、450秒mixed均实际运行通过。runtime的素材证明明确parentStatus=FAIL、parentCompleteCore=false。browser routeMocks=0、authProvidersReplaced=0；配置soak180秒，实际报告258.75秒。
- mixed实际165图+12媒体、177consume/1014积分、providerPeak4、每operation一次POST、原字节/像素核验、未完成父任务0、unknownUnresolved0；capacityClaim=false、productionTrafficCalibrated=false，不宣称10万用户容量。原load plan和超时未改。
- lint/非增量tsc exit0（37既有warning），5089编译器输入+4配置绑定，四类SCC0；全部2141生产文件与应用源码raw一致。只修改验证入口/合同/目录和模块文档。
- 初次启动CORE/core日志名冲突在任何fixture创建前退出，成功image/SDK不重建；原runtime因父报告FAIL在setup拒绝的exit1保留。theme与timeline间歇失败的原报告/截图/trace和诊断均保留，两项首因仍OPEN；不因诊断PASS写成已修复。
- 最终四产物、copy-only hash guard/回滚行为、源码桥接及最终push head CI以本轮DELIVERY.json、VERIFICATION.txt实测为准。主线尚未整合，整体ACTIVE，部署0，47HOLD。

```python
# Only the producer's verified output is consumed; release status stays elsewhere.
proof = verified_timeline_vectors(vector_root, fixed_image_source)
assert proof["ownerStatus"] == "PASS"
# proof["parentStatus"] may remain FAIL; this never means complete core passed.
```
