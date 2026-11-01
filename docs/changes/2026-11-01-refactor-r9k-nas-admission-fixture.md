# R9K：NAS交付验收的准入输入归属

## 模块与职责

基线a31dfb8b，完整5352文件原始字节已冻结。本轮针对3fa的Core失败`nas-delivery`：执行源为PR merge对象71a61b8c，原断言是`delivery is independent from stalled NAS`。不把它归因于尚未推送的首页重构。

产品的对象存储runtime仍拥有64MiB、4GiB余量和remote-first/local-first的决定，mirror/variants/ACL/原任务语义保持。测试夹具拥有容量读输入、自己创建的PG/HTTP/文件和验收证据，不依赖运行器在完整构建后的偶然可用磁盘。

## 已取得的对照证据

原测试在本机真实24GiB级可用空间、真实PG/HTTP/Sharp和文件下通过。仅以显式I/O夹具把本测试MEDIA_DIR的statfs容量读改为0，保持原生产源码、真实时钟、原NAS transport超时与5秒断言，得到相同断言失败：实际PUT约9013ms后TimeoutError，其余阶段保留。该反例说明原测试把defer flag误当已准入；已有2026-10-30 NAS probe合同也明确低于4GiB加对象大小时合法remote-first。

未取得GitHub当时的statfs读数，故不宣称已证明历史唯一根因。该次完整artifact下载仍TLS EOF，尝试和已读失败注释保留。容量读夹具不冒充物理磁盘空间或真实NAS验收。

## 实现与依赖方向

- `scripts/fixtures/media-capacity.ts`只在隔离loopback PG验证环境中，替换本测试目录的statfs读；其他目录读、实际原子文件写、Sharp、PG和HTTP仍是原实现。还原时校验当前夹具身份，其他运行任务不参与。
- 原即时交付用例显式提供8GiB准入容量，原5000ms、PUT/GET数、权限、字节、Range、镜像CAS、变体CAS及事务断言全部保留。
- 同一个实际模块补零容量反例：观察真实PUT到达且未确认，确认没有提前本地落盘；再释放同一远端请求，验证remoteReady和原始字节。没有把不准入路径误标成local-first成功。
- 真实runner向nas-delivery子进程提供专属证据目录，记录容量fixture/底层读数/实际耗时。选中单case的报告保持PARTIAL，不冒充完整218通过。

## 验收与未完成项

集中执行的命令、输入、原/新/回滚literal和exit以及最终源绑定归`output/refactor-r9k-20261101/VERIFICATION.txt`、`DELIVERY.json`。本轮不修改任何产品源码、实际存储预算、NAS deadline或供应商配置，不增加用户护栏。

新head完整218、远端Image终态、main普通整合、首页剩余发送SSE职责以及生产容量/历史根因仍分别验收。整体ACTIVE；未部署；47 HOLD。
