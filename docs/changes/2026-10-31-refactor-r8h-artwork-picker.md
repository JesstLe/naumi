# R8H：历史作品选择与原复制回执归属

## 基线与职责

完整基线7b7b976b8d10298c9ca97eb9bfbeb2aa63016782、5264文件rawSHA与tar保存在output/refactor-r8h-20261031。原Canvas将历史选择器的open/point、busy/error、分页、键盘关闭、复制受理及结果选择放在全局页面state，未随原document scope退休。先保存原树，再对实际原函数/原React控件与新owner对照；不以静态疑点当已运行缺陷。

- canvas/artwork-picker：scope级选择会话、原坐标换算/元数据过滤/分页/同步busy准入、复制成功/失败投影。
- use-canvas-artwork-picker：现有document scope绑定与React订阅，消费原document作品数组，不另发图库请求。
- CanvasArtworkPicker：原浅色/深色选择器视图、原文案、原CachedImage与原生键盘/按钮；不新增辅助文字。
- CanvasClient：只捕获屏幕坐标，组装现有copy和selection端口。
- node-operations/history继续唯一拥有copy原operation/body、已知ID只读恢复、事务和undo。新owner不导入fetch/React/DB，不新建API/表/复制队列；项目、owner、权限与账务保持。

## 迁移与验证计划

原60/加载更多60、已有模型/画质/供应商路径不改；空白项目复制仍由原server receipt确定projectKey，目标项目来自原active?.key。scope切换后关闭选择器，迟到原结果不选择新视图，旧finally不清空新会话busy。原unknown不改成未受理，不自动换operation或重试；手动再次点击仍回到现有copy owner恢复。

集中验证包括实际旧函数/真实document+node-operations+history、实际React原/新控件、原真实PG复制/父子引用/像素/undo以及完整固定Web/Worker产品浏览器。未执行结果不提前记通过。本片为第三模块，完成后普通fetch/merge main并将计数归零；整体ACTIVE、未合main未部署、47 HOLD。

## 第一批集中结果

实际旧函数/新owner共同使用原document/node-operations/history：原13项REPRODUCED，新19项PASS；原3类身份切换保留旧弹窗位置，新版均退休。原复制wire/headers/坐标取整、原operation和body的lostACK重试、已知ID只读恢复、空项目server决定目标、同步busy准入与共享undo保留。新增scope ABA和旧finally不清空替代会话busy通过。真实React原/新各7项通过：60/65分页、Escape、busy禁闭、失败明确手动重试、3类切换及pageerror0。当前DOM使用显式copy/auth/workspace/image端口，非PG。

初次规则baseline fixture未共享VM Error构造器导致读失败文案判断不匹配，修正fixture后通过；DOM夹具virtual image没有resolveDir导致jsx-runtime解析失败，修正夹具依赖目录后通过；旧useState在open后尚未提交时过早数tile=0，增加实际point可见等待后原60断言通过。所有失败输出保留，不当产品失败或被清洗的成功。初始类型exit0、lint38warning无新增；固定同SHA集中检查及完整产品验收待后续结果。

## 全量集中检查暴露的验收接线

原固定1aba第一轮core父fixture secret过短，34PASS/1setup失败/146未执行；改为现有CI配置后57PASS/1失败/123未执行，抠图脚本要求独立CANVAS_FEEDBACK_TEST_DATABASE/canvas_feedback_fixture而CI未创建。保留抠图的显式数据库保护，CI同PG服务增加专用fixture DB和env，runner自检补接线断言（真实子进程12用例233检查通过）。本地同源57精确日志续跑至114PASS/1失败/66未执行，音频静态断言仍寻找R8G已迁走的内联settings kind。音频/时间线各自完整行为断言保留，只将settings接线定位跟随实际native registry；18/67及17/70通过，不恢复旧页面实现。

完整同镜像产品第二轮74项通过，新增历史选择器6项含1次POST/真实PG原回执、原像素、同ID undo/redo、刷新；第一轮在既有ZIP原图GET socket hang up（21项通过、pageerror0/Web无OOM），原日志和清理PASS保留，传输根因OPEN不因复验成功关闭。截图检查发现拍在CachedImage完成前，补原生冷启动隔离镜像可视验收：2张原图均实际授权cache/Blob解码1024×1024、无deny/pageerror，截图已打开检查。仅验收截图等待实际decode，不改产品图片或guard。

上述修改均为验收/CI接线，src/services与原已验镜像hash全一致；现在重新固定完整源码进行最终core和完整镜像/产品验收，不把不同SHA结果拼成单SHA全绿。

## 固定候选最终记录

固定应用源码 `c8f76e93cb0fecf0449f481c21d0c320fa4381b1`，完整生产Dockerfile同Web/Worker镜像 `sha256:3019f6edfa9dffb0fd15ba67dcb7e6b030c1e71ba04e7b39bf29eed2c9661c78`。原页面历史作品选择器的open/point、busy/error、分页/元数据过滤、复制等待与结果选择迁入canvas/artwork-picker；React hook只订阅，CanvasArtworkPicker保留原视图/文案/CachedImage/Escape，Canvas只捕获屏幕点与组装既有copy/selection。只改1个原产品文件+3个新职责文件，其他2120原src/services哈希保持；页面4470→4364行不是验收目标，真实状态/流程归属才是。无新的图库fetch/DB/API/复制系统，原node-operations/history继续唯一拥有operation/body、已知ID恢复、事务和undo；原父子/素材授权/钱包/任务/冻结报价均不改。

原实际页面函数13项→新owner19项；真实React原/新各7项，3类project/account/workspace切换原保留旧弹窗/坐标3→新0。原复制wire、坐标取整、原60/加载更多60、busy/Escape、失败必须显式点击重试、原UNKNOWN身份和已知ID只读恢复保持。新增ABA拒绝旧callback、旧finally不清空替代busy，原共享undo一次语义通过。原node-operations19用例59检查保留，旧inline-wiring断言改跟真实hook/copy端口，不恢复已退休页面函数。

初始1aba的18受影响入口全新执行PASS（subset PARTIAL/exit2）单列；最终固定源码c8f重新完整catalog181全新执行、0reuse，实际结果status=PASS passed=181 failed=0 notRun=0 completeCore=True，不跨SHA拼绿，原逐项日志/PG清理均保留。类型exit0、lintexit0/既有38warning、固定源4类SCC0；2条release fixture lib→app及1条dist/worker生成边单列。DOM测试的copy/auth/workspace/image是明确端口，规则测试实际node-operations/history，不当真实PG；完整产品另验。

完整固定镜像真实双browser 74 项通过，原68项保留。新增真实history控件/Escape、实际tile复制、原PG copy receipt、原parent/坐标/图片字节、共享同IDundo/redo与刷新恢复：copy POST=1，原operation绑定原source/result/project，无新收费。原图/文字/任务/fixture7笔42积分在选择器流程前后保持。复制最终undo后保留原回执，不删除server历史冒充清理；31张原图ZIP仍逐字节完整。上游为本地隔离fixture，非真实供应商/私有R2/10万容量证明；180秒混合读取不是持续混合生成容量。POSIX排空与自有容器/网络/tmpfsPG清理通过。

第三模块普通fetch/merge main `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，新增待合0，实际Already up to date；计数2→3→0。原5264rawhash、完整5271源码、字节patch、副本原13+7行为回滚及later-edit零写入以本轮DELIVERY/VERIFICATION为准。初始fixture VM Error跨realm、esbuild虚拟图片resolveDir和React commit等待问题及原失败输出均保留；修fixture不放宽业务断言。原首轮core父fixture secret长度错误导致34PASS/1setup失败/146未运行，原日志及自有PG清理保留；57续跑至114后暴露R8G已退休inline audio/timeline kind静态接线，保留行为断言跟随实际native registry；CI补专用receipt DB与env并实际执行YAML代码/冷PG读回。最终重新固定完整源码/镜像并181全新执行，不拼接旧SHA或仅改数字。后续整轮使用现有CI fixture配置，不改产品门槛。首轮完整产品在既有ZIP原图GET处socket hang up，pageerror0、Web无OOM，清理通过；本轮后续原镜像整轮复验不抹去该传输根因OPEN，未改下载测试或加入自动重试。整体ACTIVE，未合main未部署，47 HOLD。**候选分支超过48h原因仍为完整退出未达成：剩余Canvas Shell/编辑器组合、持续混合生成/入队容量、有效CI、最终main整合及生产验收。**
