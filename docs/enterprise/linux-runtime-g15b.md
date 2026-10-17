# G15-B Linux 独立运行镜像与容器验收

## 目标与当前交付对象

延续18482原产品界面，将G15-A工作流运行包落实为可重复构建、非root运行的Linux/amd64镜像。Naumi Web仍是登录/源权限的上游，/admin不是协作界面。此模块不创建真实员工、修改真名花名映射、迁移真实导入库或启动外部通知。

产物包括生产运行Dockerfile、Linux组合模板、精简上下文构建器、实际Linux进程/生产镜像验收器，以及固定版本镜像交付材料。独立API和Worker使用同一镜像；shared/dedicated继续由同一运行配置控制，不另开企业代码分支。

## 镜像与供应链

- Node基础镜像和隔离验收PostgreSQL镜像按仓库摘要固定，明确linux/amd64；具体摘要在build-linux.mjs和LINUX_BUILD.json。升级基础镜像是显式改动，不由latest静默变更。
- 依赖按服务package-lock.json执行npm ci --omit=dev --ignore-scripts。镜像没有应用源码开发依赖、真实配置、签名私钥、Excel、数据库和媒体。
- 构建上下文是每次新建目录，只复制manifest枚举并核验的运行文件、同hash的依赖元数据、Dockerfile和健康脚本；不把整个仓库发给Docker。
- 默认要求Git干净且完整40位revision。--allow-development true只允许开发验收，交付镜像再从干净提交构建。标签不是固定部署依据，实际发布记录完整Image ID/registry digest和releaseId。
- esbuild显式设置工作目录，仓库根和服务目录调用产生相同运行包releaseId。固定基础镜像/包文件不等于Docker导出tar逐字节可重复，构建证明以实际manifest、Image ID和包hash为准。

## Linux运行约束

|项目|实现与配置|
|---|---|
|操作系统/架构|Linux/amd64，Node 24；其他架构未验收|
|用户|UID/GID 1000:1000；应用不以root运行|
|根文件系统|read_only；只有独立交付目录和/tmp有写权限|
|额外权限|cap_drop ALL，no-new-privileges，pids_limit 128；不挂Docker socket|
|配置|绝对路径、普通非软链文件、Linux模式0600；由UID1000读取，父目录须允许遍历|
|数据库|运行账号低权限，管理员连接仅给显式迁移/初始化CLI；应用启动不迁移|
|端口|仍绑定127.0.0.1，正式Linux组合使用host网络，不用-p把数据库/API暴露公网|
|进程|同一镜像两容器，API=serve，Worker=worker；Worker先standby|
|存储|配置deliveryRoot=/var/lib/naumi-enterprise/delivery，挂明确独立目录；两槽使用同一已初始化存储|
|健康|同时核对本容器PID命名空间里的实际CLI角色/配置和readyz的role/installation/release/slot；错角色不借另一端口冒充健康|
|停止|先显式drain，观察活跃工作归零，再stop；SIGTERM也先排空。Compose有限宽限期不构成排空证据|
|默认重启|restart=no，避免候选或已退役槽位被隐式重启；正式重启策略由部署控制器明确管理|

Compose每个服务512MiB/1CPU是初始运行上限，不是4核8GiB整站容量结论。双槽、Naumi Web/原Worker、PostgreSQL、Redis、代理和附件峰值必须一起计量。测试容器单独使用768MiB/2CPU限制；这不把宿主机等同于目标配置。

## 操作顺序

1. 从干净固定提交构建，保存LINUX_BUILD.json，核对产品HTML hash和Image ID。
2. 部署管理员准备独立数据库/低权限账号，按G15-A运行备份、迁移预览/执行、存储初始化和企业账号初始化。没有确认的人员对应关系仍待绑定。
3. 配置文件由运行用户读取，模式0600；原始私钥保留在Naumi Web，runtime只收对应公钥。管理员连接文件不挂入常驻API/Worker容器。
4. 设置ENTERPRISE_IMAGE、ENTERPRISE_SLOT、ENTERPRISE_RUNTIME_CONFIG、ENTERPRISE_DELIVERY_ROOT。候选端口与旧槽不同，slot与配置一致；公共入口和Naumi BFF指向API，不指Worker。
5. Compose config只做配置展开；启动候选前核对实际资源和部署锁。候选Worker保持待命，先验收真实登录、当前企业范围和受影响功能。
6. 按既有蓝绿协议切流/排空/激活/旧槽停止；本模板没有替代外层部署控制器，也不执行自动生产发布。

```powershell
# 根目录；默认拒绝未提交源码。
node services/enterprise-workflow/build-linux.mjs --output OUTPUT_ABSOLUTE_PATH
node services/enterprise-workflow/verify-linux.mjs --output EVIDENCE_ABSOLUTE_PATH
# 仅开发隔离验收可加：--allow-development true
```

```sh
# Linux部署准备；参数均由实际安装配置提供。
export ENTERPRISE_IMAGE='sha256:VERIFIED_IMAGE_ID'
export ENTERPRISE_SLOT='green'
export ENTERPRISE_RUNTIME_CONFIG='/etc/naumi-enterprise/green.runtime.json'
export ENTERPRISE_DELIVERY_ROOT='/var/lib/naumi-enterprise/delivery'
docker compose -f services/enterprise-workflow/deploy/linux/compose.example.yaml config --quiet
# 真实旁路启动/切流应由持锁发布流程调用，不在构建或验证时自动执行。
```

## 集中验收与证据

verify-linux先构建生产镜像，再构建只用于验收的测试镜像。测试镜像含PostgreSQL客户端与编译测试；生产镜像不含它们。测试数据库没有宿主端口，网络internal，无Docker socket。测试以同一网络命名空间的127.0.0.1连接独立数据库。

16组Linux实际进程检查包含G15-A全部15组，以及UID1000/只读根/0600拒绝宽权限配置。pg_dump/pg_restore在测试容器内直接执行，不访问宿主Docker。完整任务流结束后保留仅合成数据的命名卷，再分别启动真正生产镜像的API和Worker，验证真实ENTRYPOINT、当前镜像ID、健康角色不串线、读取已签收任务/原文件字节、Worker待命、排空503、stop202和容器exit0/OOM=false。

生产镜像验证时的私钥仅是现场生成的合成测试密钥，存在隔离测试卷中，绝不进入镜像和交付包。验收后按本轮唯一前缀/标签清理容器、数据库卷和网络；不通过清理其他容器释放资源。

首次Linux测试暴露空命名卷copy-up导致所有者被覆盖的问题；现所有测试卷挂载显式volume-nocopy，并由一次性初始化容器设置新空卷属主。第一轮日志抓取遗漏stderr，已修正为同时收集stdout/stderr，原失败记录保留。镜像和已有真实数据无关。此修复不授权对现有真实目录递归chown。

开发态16组与实际生产镜像API/Worker首轮修复后通过；最终干净提交、健康错角色负例、Compose展开、Windows兼容回归及副本回滚，以交付VERIFICATION.txt最终命令退出码为准。

## 尚未完成

- Naumi完整Web + runtime的正式安装组合及真实源会话验证；当前本机来源代理不因此自动变成真实员工登录入口。
- 目标服务器/4核8GiB整站并发、长时间运行、磁盘峰值和双槽余量；本机64请求的参考负载不代替这些。
- 真实公司企业ID/账号团队/真名花名与钉钉userid对应关系、钉钉凭证和试投、聚水潭同步。
- 外层代理真实蓝绿切流、旧页面/会话兼容、目标主机恢复和生产验收。

本轮无新SQL迁移、无前端重做、无生产连接。真实schema8及原364行/292附件保留；总目标ACTIVE。
