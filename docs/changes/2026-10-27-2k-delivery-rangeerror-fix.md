# 2K 交付 RangeError 修复与验收（进行中）

## 固定对象

- 交接分支 `codex/2k-delivery-handoff-20261027` / `c275f65aa36961e6eac6e6a5432f391347e9abcc`；基线 origin/main `cde64c6aedd75c5197ee2ae17e7bac8759fb8bed`。
- 独立工作树 `E:/Workspace/naumi-2k-delivery-fix-20261027`，保护共享目录18个未提交UI文件；不合重构。
- 当前现场再次确认 source `a33ed3aead88e87d617ad859a5b59ecf53dd27ed`，Web13118，同镜像Worker。修复发布之前不变更2K配置。

## 已取证

- 10:40北京新鲜只读：同签名2K卡单16笔，原sample PNG 3,923,041 bytes，SHA256 `c9a58309318604df80b2dccff950e46a88e15763fc65a234016ff780e45278ab`。
- 16笔父任务 `deliveryRecoveryAttempts=5`，父子无lease；恢复源码本来已选择error状态。交接的“扫描不认error”与源码及现场不符，不能直接再加一遍status条件。
- 样例实际参数是3:4 / canvas / 1参考 / transparent=false；其冻结modelVersion150无business/postprocess配置。原文样例坐标其他参数与现场不完全一致，后续以固定原行证据为准。
- 原始helpers、相同Linux Node24.21及实际线上编译helpers的纯输出段均通过；目前尚未拿到真实RangeError抛点，不把怀疑当根因。
- 原始失败保留：辅助Node误继承HTTP observer而自退出；清NODE_OPTIONS后的只读进程未影响主服务。宿主/tmp样例不在应用容器；之后以已验证原图字节作为stdin输入。一次本地GBK读失败、一次SQL JSON减字段括号错误也保留在ignored证据。

## 待完成

- 获取真实stack；根因与恢复失败必须分别证明。
- 集中回归、原版对照与独立副本回滚；四产物。
- 非重构已完成分支整合、三锁蓝绿发布与历史卡单原结果交付。
- 原交接四项线上验收（2K30分钟、卡单/holds、20秒扫描例、1K前后30分钟）仍全部待验。

所有原图、账号、任务、配置与原始日志仅留ignored output/2k-delivery-fix-20261027，不提交。
