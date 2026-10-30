# R7Z：Canvas 项目导航会话归属

## 基线与职责

独立目录 E:/Workspace/naumi-refactor-20261024，基线1f547e01f1cbb7211082a629b779149b111a0fab；完整5214原文件hash/tar及原版副本保存于output/refactor-r7z-20261030。开工刷新origin/main仍e2f56255，无待整合提交；上一片同步计数0，本片完成后1/3。整体重构ACTIVE，未合main未部署，47 HOLD。

项目导航独立负责activeKey/browsing/creatingNew、URL节点意图、刷新恢复、桌面initialProject、浏览器back/pop与延迟工作流启动的生命周期。项目列表/名字归project-catalog，选择归selection-controller，持久文档/history/付费operation和原回执继续原owner；新模块没有HTTP、供应商或钱包能力。React hook只组装当前账号/查看对象/workspace epoch、browser history、storage、frame及既有selection/focus端口，不新增状态库。

## 当前实现

页面全部项目状态setter和9组导航effect迁入project-navigation owner及useCanvasProjectNavigation；所有真实模板/原生节点/历史/上传/文本/生成结果/工作流复制消费者调用open/browse/requestNode/empty。RAF+timeout工作流初始化由同一owner维护navigation epoch与取消句柄，切项目/账号/workspace/卸载后的旧任务不会向新画布写入。刷新位置按actor/target/workspace保存v2，兼容既有nv:canvas:last一次归属迁移，不把另账号/工作空间旧项目作为新会话恢复目标。

## 已执行与验证边界

真实React DOM+实际页面函数+实际新hook/controller，外部文档/选择/框架时钟受控：原版24检查、19条共同轨迹、4组旧行为反例复现exit1；新版28检查exit0，19共同轨迹当前实读逐项相同。反例是延迟工作流导航后执行/切号后执行、workspace继承旧activeKey、退役命令切号后仍导航；这些是本地受控时序，不冒充线上事故归因。首轮baseline缺同盘依赖为脚手架准备错误exit2保留；两处初始TS错误已修，完整tsc当前exit0。最终对照、真实Next与受影响集中验证/四产物/回滚/远端尚待，不把已写断言当通过。

## 未完成与下一步

补齐浏览器后退/旧帧与ABA/storage异常/卸载控制，迁移旧实际caller脚手架端口，再做本模块集中类型/架构/页面与相关回归。原R7Y完整core160和同镜像177/37是上片证据，不能记成本候选全core通过。完整源码包/字节diff与5214原hash副本回滚以本片DELIVERY为准。

### 集中模块检查点

原版25检查/20共同轨迹复现exit1，新版30检查/20共同轨迹EXACT/四反例关闭exit0；真实browser back、刷新scope账号/workspace ABA、旧frame取消及storage全异常均覆盖。实际native-actions12/38、primary57/129、local-edits23/68、history67/184、local-node-history16、node-operations19/59通过；完整类型及lint通过。首轮架构在新增文件未进入tracked inventory时仅作准备扫描，最终必须包括新增owner/hook全部边后再核查，不拿未解析的扫描当SCC通过。

现已把完整产品浏览器新增导航七项接进既有runner：catalogue/back/refresh/new/workflow draft及原PG/账本不变；尚待新固定镜像执行。这里没有另建浏览器框架。
