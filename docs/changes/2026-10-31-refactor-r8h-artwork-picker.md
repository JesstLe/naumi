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
