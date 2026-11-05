# R6E：共用工作台资产与显式环境边界

基线`e9968816f94268fae787106e23a5c3d1873d45ab`；4484原文件逐字节哈希与完整原字节归档。独立重构工作区，同步后第2模块；不合main、不部署，不动生产服务。

## 原问题与本轮实施

- 原prebuild/predev对共享HTML/JS执行全局字符串替换：API、导航、localStorage、IndexedDB、模型禁用语句。`ui.ts/adaptSource`还留第二份无人调用的转换。行为依赖源码具体写法，不是可维护的模块边界。
- 三个原页面和history脚本继续是唯一共用UI源，仍位于`services/reference-workbench/static`，不复制一套native页面、不改独立服务SQLite/媒体/账号/供应商协议。
- 共用`workbench-environment.js`只处理环境差异：API/导航、原有账号存储、模型控件和原IndexedDB名称/图片键。页面显式调用，不拦截通用fetch、不新增任务/缓存/配置平台。
- main构建只copyFile原字节与打包原native鉴权桥；删重复adaptSource；renderer只保留原鉴权脚本延迟与公有配置注入。single/chat补完整head/body，删除每次请求的结构修补；desktop参数进入公有runtime配置。
- 独立服务新增三个共用资产的固定白名单URL，鉴权保持，原根路径history/ZIP地址继续兼容；历史部署脚本和service目录打包不变。
- 原paid quote、receipt-first/unknown查询、原价、余额与幂等链保持。原Naumi存储前缀和IndexedDB名称/版本/图片主键保持；独立服务localStorage/历史库保持。

## 验收与剩余

模块完成后集中运行真实三页面×native/desktop/standalone A/B，使用实际build输出、实际renderWorkbench和实际native bridge；API响应为明确loopback fixture，不冒充PG/供应商/完整Next验收。验证原操作/原回执恢复、缓存键/模型/导航与未鉴权不执行页面。独立Python实际路由/既有tests、主应用核心回归、类型与产物字节同源集中记录。

原失败保留；最终结果、四产物、副本回滚和提交远端以`output/refactor-r6e-20261027/DELIVERY.json`为准。未执行前不写PASS。整体active，admin大面板/测试资产、长时混合生成负载/依赖问题及最终整合继续。


## 已观察与集中封版准备

第一轮实际三页面×三环境×两视口及未登录，共19场景：旧235检查/新368检查均通过，0页面异常、0未知重POST，原API/报价/提交桥执行。新六资产逐字节与唯一源码相同，旧三页+history四资产被build改写。最终补强图片实际解码、API命名空间与paid wire逐项精确对照后，以最终报告为准，不覆写早期结果。

真实浏览器发现single页面旧初始化在模型填充后又写空value，可能覆盖已保存选择；本轮只把既有value初始化放到环境模型填充之前，保留模型选择本身。新两种native环境/两视口的重载选择已验证。旧完整基线第一次验收在等待该旧选择时超时，原日志保留；不是通过增加等待修产品。

独立Python16旧测试通过；新增实际鉴权资产/原字节/旧URL兼容负例后首次17测试耗尽同一个fixture client的既有登录次数，最后旧geometry测试429。仅新增用例改用独立测试client标识，不改产品限流或跳过断言；最终17通过（1条第三方anyio弃用warning），原失败保留。

主应用全项目tsc、两文件lint已exit0。核心新增静态workbench-assets入口：实际CLI原字节复制、实际renderer和三个环境合同；不把静态子入口声称为浏览器验收。最终固定SHA core24和完整19场景报告、四产物/回滚/Git以DELIVERY为准。


## 固定源码最终结果

固定清洁源码`7ca81bccbee90f31a47686402e6e1361967967f0`，core全文件digest=`b7dbbff17cb6789f78086012a8033fac5fe318cf551fb67e4c4fd093e42b2bbc`：24入口全部PASS，failed0/not-run0、exit0。其中workbench-assets静态38检查，实际build/renderer/三环境合同，未启动浏览器；其它23入口全部沿原core。

- 实际浏览器最终19场景712检查，0页面异常、无积分确认、未登录不执行页面/读取settings、原unknown只查receipt；六资产原字节相同，三页CSS hash、页面/控件投影和原paid wire精确旧新一致。API/session/生成是loopback fixture，实际页面/renderer/bridge未替换，不冒充真实PG/供应商/完整Next镜像验收。
- 独立Python完整旧16/新版17测试均通过，FastAPI实际路由返回同源资产字节、未登录401、非白名单404、旧URL相同；仅保留第三方anyio弃用warning。
- 全项目tsc与两文件lint均空输出exit0，runner自测12类65检查通过；TypeScript擦除后的全仓静态/字面动态导入环均0。
- 234个共用页面/history函数在只还原显式环境表达式后文本相同，明确差异只有single.loadSettings的已存模型选择时序和history.source的canonical/desktop图片键；没有据此声称任意算法等价。样式原字节hash相同。

后续收尾只更新本文和主台账；被测应用/脚本/服务字节与最终文档提交分层绑定，独立副本回滚恢复4484原hash及原19场景行为。原失败记录、精确命令/literal/exit、四产物、远端SHA和自有资源清理以DELIVERY.json为准。R6E本模块完成不等于全项目完成，整体active。
