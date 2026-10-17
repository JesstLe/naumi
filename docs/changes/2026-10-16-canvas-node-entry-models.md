# 画布三类节点入口与视频模型选择对齐

## 范围
用户反馈添加节点点击后直接生成文字，要求文字/图片/视频三选一；视频模型选择须与图片节点对齐。
独立分支codex/canvas-node-entry-models-20261016，基线origin/main7bdcd8b644e8771646003f68055585f257df40f0；保留所有已合上传/视频Dock/底栏/选择抓手。不操作共享未提交文件，不发布/SSH。

## 调研
最新底栏＋入口原有五项；空白右键“添加节点”直接创建图片占位，旁边“文字生成”直接创建文字。视频CompactComposer和高级设置仍使用原生select，图片使用带品牌图标的portal下拉，交互不一致。
本轮修复通用添加入口必须先显示三种节点，显式文字/图片快捷键保持各自意图。上线旧UI尚未验证，不据本地源码推断线上行为。

## 实现
- 通用添加入口只给出文字/图片/视频，点选前不创建节点；右键保留点击坐标，视频尊重原权限。
- 新增共用CanvasModelSelect，图片/视频Compact/高级设置复用同一浅色portal、品牌图标、勾选态、滚动与键盘交互。
- 保留图片选择原映射；视频保留provider/model复合身份与reconcile能力校验，选择不隐式生成。尺寸/时长等不混进模型名称。

## 集中验收完成
- 正确Next15.5.27 / React19.3.0 / XYFlow12.11实际CanvasClient+ReactFlow+HTTP合成状态+Edge：12项通过，pageerror0、外网请求0、供应商调用0。
- 通用入口三选一/取消零创建、分别图片文字视频原链路、右键先选后建、视频模型身份和能力reconcile保存、键盘、Compact与高级统一、模型弹层Escape不关闭外层高级设置、图片保留目录、390px、只读阻止写入。
- 全量tsc通过(exit0)；工具栏契约15项和整合工具栏业务保护检查通过；提示词/生成/路由/计费声明未改。
- 基线与副本回滚复现旧混合菜单/右键直接创建图片/视频原生select；已实际执行ROLLBACK.sh，原始hash全部匹配，修改版保持。
- 原有脚本中关于五项新增菜单的断言按新三类节点需求更新；另修正现有main中已过时的底栏安全区、FeatureVisible过滤和扩图面板计数断言，不更改业务实现来迎合旧断言。
- 浏览器初轮遮挡/屏外节点改用真实深链定位；发现模型弹层Escape关闭高级模态的问题后修正并回归。

## 交付状态
本地完成，未SSH/部署/创建候选/持锁/更新Worker。工作树独立，源码SHA提交后见本任务VERIFICATION.txt；不记录公开已发布更新。
四产物：output/canvas-node-entry-models-20261016/{MODIFIED_FILE.zip,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}；原始hash见BASELINE_HASHES.json。
开工与提交前fetch origin/main；功能同步计数本轮1/3。后续交统一线程按增量合并，发布另行三锁蓝绿。
