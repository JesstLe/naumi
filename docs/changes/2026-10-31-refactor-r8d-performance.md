# R8D：整体重构的固定机器性能对照

## 原始要求与当前状态

原退出要求继续为 `REFACTOR_MIGRATION.md` 第5节：固定规模的UI响应与排除供应商耗时的准备/入队p95、PG查询、RSS，不以历史PASS或180秒读取替代；10%为原建议调查阈值，不是新业务护栏。

本轮源码基线 `2fb9da5a8f22c9b229898f26293dc70db26d4ad6`，完整5240原文件raw hash/tar保存在 `output/refactor-r8d-20261030`。比较原应用为首个重构实现前 `4478cdca88a6e52b5db186d30ace4ef8724263c7`，产品源码及package与已整合的质量/Canvas定价修复 `9fc2845` 一致。候选复用R8C完整镜像，应用 `290b3772`；不改任何src/services字节。

## 测量归属

- 复用 `benchmark-ui-performance.mjs`，新增显式完整镜像入口。旧受控API模式保留，不把它包装成真实PG模式。
- `refactor-performance-fixture` 在各自源码下编译，仅用各版本原数据API建立300图片节点、20文字节点、12张确定性1024px PNG、固定6积分报价；不替换业务handler。
- 浏览器使用真实登录、真实Next/ReactFlow和HTTP；相同1440×1000、4倍CPU节流、5Mbps/80ms，冷/暖页和原生工具切换/平移，保留既有虚拟化。
- 相同measurement-only preload观察原HTTP完成、真实PG查询、20ms RSS与Linux终身VmHWM、10ms事件循环分布，不更改SQL、响应或任务路由。
- 5轮交替先后顺序，每次仅一个自有完整Web/PG栈；实际读取60次、报价准备30次。UI与报价准备不提交付费执行，不以此声称供应链/入队或10万用户容量已验收。
- EventTiming结果标为实验室交互延迟/会话INP估计，不冒充真实用户field INP。

## 已发现的准备边界

原版完整Dockerfile两次在npm下载ECONNRESET终止，第二次同时存在apt网络失败；原日志保留。原锁与当前锁有82项差异，不能把依赖升级算成架构收益。随后建立明确标注的“原应用字节＋当前已缓存运行依赖”测量镜像：应用源不变，测量配方不是原历史发行版。

该配方首次遗漏原Dockerfile全局NODE_BASE_IMAGE定义，随后已纠正。使用当前依赖分别触发原测试脚本的BlobPart和原产品Sharp类型不兼容；这些失败原样保留，**没有产出可测量的matched-deps镜像**。随后从主机恢复原锁的Linux/glibc依赖，缺失包下载后逐一核对原SHA512，最终offline npm ci成功。原应用及原锁完整构建通过，未修改产品或跳过类型检查；唯一测量配方变化是deps预安装运输，原build/runtime阶段保持。原版与候选的82项依赖差异仍单列，结果只支持整体候选对照，不把全部变化归因于模块化。

## 实际复现与修复：公开本地媒体规格错配

真实320节点校准的前两次环境错误分别是fixture全外部依赖打包导致lucide CJS加载失败、探测子进程继承release preload；第三/四次定位setup root创建私有文件而Web uid1001读EACCES。以上均为验证准备问题，已修正，原失败和自有资源清理保留，不算产品缺陷。

之后实际Web/PG浏览器取得冷/暖交互样本和90次真实API结果，但公开本地MEDIA_PRIVATE=0下缩略图请求稳定返回409。源码链为：manifest按thumbnail生成版本→response只在private分支解析variant→公开路径仍读原图→用缩略图版本校验原图，因此409。该次性能运行exit1，不能称测量通过或把回退原图耗时当基线。

修复将规格选择归`media/representation`，manifest与response共用同一key+asset；私有素材仍先检查原始key归属，再解析派生规格。真实manifest/response＋文件/Sharp专项：原38检查复现2个公开variant错误409，新44检查错误409为0，字节、MIME、过期版本409、私有匿名401/外账号404及拒绝前零元数据读取保持。尚待固定新镜像的真实浏览器验收。

当前尚未取得成对性能结果，不宣称性能改善、10%目标达成或整体退出。后续以实际测量决定是否存在待修瓶颈；既有UNKNOWN、原operation、报价、钱包与scope规则保持。整体ACTIVE，未合main未部署，47 HOLD。
