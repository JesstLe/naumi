# 画布悬浮 Agent 小球

## 实现与调研

- 复用现有 `NaumiOrb` SVG 引擎，石墨球和柔白眼睛保持品牌一致；点击小球打开/收起现有 Agent 面板，顶栏入口保留。没有新建聊天、供应通道、调度器或计费路径。
- 小球位于画布 viewport 的独立悬浮层，不随节点坐标、缩放或画布平移移动。鼠标/触屏自由拖动，6px 点击阈值、pointer capture、取消复位，拖完不误打开面板。支持方向键移动、Shift 加速与 Enter/Space 打开。
- 位置按账号保存归一化坐标，ResizeObserver 适配桌面、窄屏和侧栏收缩；顶部、底部 Dock 留出边界。localStorage 不可用时仍可拖动。不拦截节点/画布交互，不新增动画 RAF。
- 表情来自画布已有真实 SSE 和历史恢复：请求中思考，真实检索工具检索，其他工具执行；工具结束回到思考，只有成功 `done` 且完整回复校验通过才完成；失败、断流和停止不显示成功。
- 关闭面板不停止任务，小球继续展示真实进度。换账号/项目/图片、新会话与删除当前历史重置状态；恢复运行中历史继续显示工具执行。
- 本轮只增加前端呈现与 tool 名/终态保存，不修改 Agent 所有权、工具范围、模型映射、报价或数据库 schema。

## 验收状态

- 基线小球：`NAUMI_ORB=PASS checks=102`。
- 新模块114项状态/边界/隔离/SSE契约与TypeScript通过。实际组件独立本地浏览器验证拖动、不误点击、不冒泡画布、刷新位置、键盘、六种状态、390px边界通过；这部分为组件fixture，非真实供应调用。
- 正式Linux构建、线上12项资源/版号校验通过。实际画布验证拖动不误打开、画布视口不动、刷新位置保持、键盘、390px指针拖动、开合侧栏通过。IAB触摸注入接口未支持，真实手机触摸尚未实机验收；实现使用Pointer Events/touch-action，不把鼠标拖动当成触摸实机证据。
- 真实调用get_balance、recolor_product、verify_image_output，亲自观察小球thinking→working→done；收起面板仍执行，生成1张绿色商品图回到当前项目。数据库持久历史恢复done通过，无重复生图。
- 首个只读停止探测在点击停止前已完成；未冒充取消成功。第二个只读任务在服务端受理后立即停止，小球显示stopped/idle；恢复该错误历史显示error，不显示成功。三次对话均扣费0，唯一canvas.image操作结算6积分、预留0；取消对话操作保留hold/0积分，不修改账务记录。
- 源码在独立副本回滚：原canvas-client与NaumiOrb精确字节哈希恢复，新增模块删除，原顶栏Agent入口和小球预览自旋保持；工作副本保留新功能。新机固定9ec5c1镜像回滚--check通过，未应用。
- 发布仅面向新机120.27.162.85，旧机不回传；视频和OSS保持延期。

## 后续接手提示词

```text
复用 canvas-client 的真实 assistantBusy/assistantSteps/assistantOutcome，
小球只调用 toggleAssistant。成功必须经过 SSE done.ok、非空最终回复验证，
失败或停止不可推断成功。位置保持账号隔离、归一化边界与取消拖动复位。
不要新建调度器或改计费，发布先刷新 main 和运行镜像，持 deploy.lock 到验收结束。
```

## 新机交付（2026-10-11验收完成）

- 业务源码 `5e4851fac70e9260a0cec800e101dc6a7c51ca68`，APP/Worker固定镜像 `ghcr.io/jesstle/naumi:5e4851fac70e9260a0cec800e101dc6a7c51ca68`；Image ID `sha256:322847ab7f484c7c42f5b2fb151e7cc74372e12f3e26a6fa5ee68bebffca5078`，实际 `1791647970 / v2026.10.10-235930`。
- 全程deploy.lock，从基线备份到真实浏览器/Agent验收；完整DB/env/Compose备份、临切最新数据快照、固定旧镜像回滚保留。只有NAUMI_IMAGE变化，模型v108/积分v8与设置/草稿/ComfyUI/供应商元数据/修订/采购价最终指纹保持，DB/媒体/Compose/Router/代理不覆盖。
- 真实任务 `job-65981649-f18a-45af-ae05-e82aac338b55` done/settled，单次canvas.image扣6积分、预留0；产物parent/group为验收根 `art-1791628326775-554772`、origin=canvas。原测试项目和收费流水保留，不操作用户正式项目。恢复历史未新增图片操作。
- 证据 `/opt/naumi-staging/evidence/canvas-agent-orb-20261010`，回滚 `ROLLBACK-STAGING.sh --apply` 先核对当前candidate并持相同锁，只切回9ec5c1固定镜像，不回灌DB或覆盖其他配置。
- 最终健康/实际版本通过、锁已释放、临时容器脚本/私钥副本清理，原私钥hash不变，旧机未连接/回传。维护后累计成功发布2次，约79%占用/21GiB可用，未达3次门槛；下次构建若超过80%或不足10GiB先清理。
- 本地四件套与截图位于 `C:/Users/13357/.codex/worktrees/naumi-orb-research/naumi/output/canvas-agent-orb-20261010/`。文档跟进不另发镜像，视频/OSS仍延期。
