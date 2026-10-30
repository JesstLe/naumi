# R8C：Canvas 长图拼接的完整应用归属

## 原始边界与基线

独立工作树 `E:/Workspace/naumi-refactor-20261024`，原始SHA `737a1d74d7390f1da2db038f7fa9ca696d3e9c22`；5230文件raw hash/tar/只读副本在 `output/refactor-r8c-20261030`。开工fetch main仍e2f56255，无新提交。

原Canvas主组件同时拥有拼接JSON/请求、结果同步/撤销/选择和busy；原route同时拥有图片授权、网络/Sharp、上传、作品与位置两笔提交。没有operation回执。这里采用客户端拼接owner→typed server use-case→像素准备/原作品writer，不另建任务、账务、文档或撤销引擎。

## 已实际复现

完整旧route/真实PG/原Sharp字节25检查复现：相同operation重复和并发均创建2张；位置UPDATE故障时已插入的作品留下1张；旧输出未写image_width/image_height。原图片顺序、半透明白底、8×10PNG、父子关系与位置已取hash。

原实际Canvas函数/真实document scope/history、受控HTTP：8组22检查复现；丢ACK和同步失败重做POST，旧闭包双击可发两次，迟到项目/账号回调更改当前选择。实际原文档owner已有账号隔离，因此没有把旧merge伪报成跨账号文档写入。

## 实现归属

- `canvas/stitch-contract`：原2–12图片输入和兼容POST，新增可选operationId；GET只读原回执。
- `canvas/stitch-pixels`：原read/rotate/scale/flatten/compose，无SQL，网络/解码/上传不占数据库事务；像素语义沿原实现。
- `canvas/stitch`：复用app_canvas_node_copies与原账号锁；同意图fingerprint，重新核对真实来源/项目/工作空间，作品+像素尺寸+位置+receipt一个事务。随机上传key仅输家/确定回滚清自己的；COMMIT丢ACK保留可能胜出字节，只查原回执。
- `canvas/stitch-run`/窄React hook：原operation在POST前保存，未知结果只GET；已知结果同步失败只同步原ID；共享history记录一次。原文档可在项目导航后完成，当前选择/提示仅属原view；账号/workspace退休后不回写。
- HTTP route只解析/认证/错误映射，主组件只绑定选中节点与几何、document/history/选择端口。保留旧公开URL、原无operation POST、静态本地拼接不收费。

## 验证进度与边界

首轮modified PG失败仅因verifier将新增GET回执外层result误当顶层id，原日志保留；修正响应断言后42检查通过。追加owner/project/legacy/上限和操作identity检查后，统一集中完成受影响回归、完整候选/真实控件/字节回滚再封版，不用阶段数字替代最终结果。

整体ACTIVE；本片为同步后第1模块。旧R8B167/177/50只归原固定源码；本片最终source、commands/literal/exit、rollback和四产物以DELIVERY为准。未合main未部署，47 HOLD。下一步仍为剩余Canvas组合、同机性能/INP/容量、有效CI及最终整版退出。

### 模块集中验收已执行

实际旧Canvas函数8组22检查→新拼接owner12组33检查；实际旧PG/route/Sharp29检查→新54检查通过。覆盖原位置/谱系、同operation并发一张、原像素尺寸、位置故障整笔回滚、source在像素完成后删除时不发布、真实COMMIT已提交但ACK丢失只查原receipt且原字节可读、输家/rollback自己的随机文件清理、跨owner无回执、跨project拒绝、旧无operation POST和2–12上限。suite batch的两张独立group旧误拒已复现，新产物保留原batch，不落到另一个tree。

原route的真实pixel语句AST与新像素owner对照12组36检查：EXIF JPEG、alpha白底、不同横纵比/最大宽度/12图顺序等最终PNG逐字节相同。全项目类型/lint已通过（原38warnings），四类SCC0；初次新verifier误解GET响应壳、初次新owner字符串类型收窄错误均保留原日志，不抹为PASS。稍后新增的unknown日志与输入权限前置仍属于固定源码验收对象，最终集中受影响回归与实际控件按固定SHA执行。

## 最终固定候选

固定应用/受影响验收源码 `290b3772c9722cd46e9860c1385581fa5619def9`。原route里的像素与写库拆为stitch-pixels/stitch应用owner，Canvas请求/原意图/只读恢复归stitch-run和窄hook；原作品document/history/node-copy回执继续唯一归属，未建新表、任务或计费引擎。原接口无operationId的POST仍兼容，当前控件在POST前保存原operation；未知只GET、已知结果只同步原ID，scope隔离迟到选择/提示。

实际旧Canvas8组22检查→新12组33检查；原route/真实PG/Sharp29→新54检查。旧同operation重复/并发创建2→新1，位置失败遗留作品1→新整笔0，源图在像素准备后删除不发布；真实已提交COMMIT丢ACK保留可能胜出字节并按receipt恢复，输家只清自己的随机文件。12组原route像素语句AST对照PNG逐字节同，普通谱系/位置不变；新记录真实输出尺寸，suite batch产物留在原batch。

34个受影响入口同SHA/digest全部PASS，subset仍PARTIAL/exit2，不冒充完整169；新完整生产Dockerfile同Web/Worker镜像的实际产品双browser54检查通过，其中4项是原生多选/拼接、原receipt+PNG、共享undo/redo和刷新，拼接POST1/供应商新增0/消费新增0。固定类型/lint38warnings/四SCC0，2106个原产品文件hash不变；Canvas4586→4564行。上一片完整167/runtime177仍归R8B原source，不给本片代验。

最终只补文档和新浏览器验证器：首轮原50检查已过，但固定坐标点被先前Comfy产物遮住；第二轮原50检查也已过，但新verifier误用了不存在的select工具名，实际为move；第三轮命中实际move工具，但原第二图被已完成的Comfy产物完全覆盖，同样未发送拼接POST。三轮原失败与清理证据全部保留；最终使用真实move工具、根图普通点击及同项目实际露出的已有图片原生Shift多选，请求URL由当前页面转换为绝对地址，不force、不注入选择/修改应用。最终完整5240文件包/5230原hash副本回滚/远端状态见R8C DELIVERY与VERIFICATION。整体ACTIVE，未合main未部署，47 HOLD；同步后1/3。后续优先补原退出要求中的同机性能/INP/容量，同时继续剩余Canvas组合与最终普通main整合，不能用文件拆分或历史PASS替代整版交付。


当前新浏览器54只以最终BROWSER_RESULT/CLEANUP为准；三次50后定位失败、类型初次2错误、GET壳fixture误断言均保留原文件。复制回滚必须恢复5230原hash及旧client22/PG29行为，真实工作树保持新实现。
