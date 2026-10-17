# 整合分支新复核与最终保护修复

## 范围与当前状态

按用户最新要求，每轮先fetch origin/main并核对交接；本轮主线与任务分支均40949675a1ae828eb37909e263b7ac3c25d13ada，无落后。共享E盘checkout仍在同事分支，不切换、不重置。完整目标保持32/34应用审核；S01/S02、固定Linux运行/兼容回滚及103发布仍待完成，无SSH或部署锁。

Native新上下文完整分支复核84197（会话01a14769-140a-7083-bc90-82bfc6e6c2a2）以6048ae7为base实际审4094967，终态exit0且有四项发现；shell helper失败后实际使用只读Node读取源码，不是空审阅。完整回执whole-branch-review-4094967.txt保留。exit0不能当无问题。

## 四项修复

1. P1安装器：Compose要求独立MEDIA_WORKER_SECRET，但install.sh及.env.example缺失。安装器补缺失/空/旧占位值生成，已存在有效值保持；不重用SETTINGS_SECRET/VIDEO_WORKER_SECRET。
2. P2 Worker包装：新runner的旧版控制分支动态import video-worker-legacy.mjs，Dockerfile未复制。补入固定runtime镜像；必须在新真实镜像中启动该分支验收，源码存在不能算运行通过。
3. P2混合引用：single_image中音频可以在图片前，旧逻辑错误改refs[0]角色。按已验证的imageIndices[0]分配首帧，音频顺序/角色保持。
4. P2播放清单：私有远程存储默认redirect时，HLS/DASH被排除重定向后仍没进入proxy。已就登记remote_ready的manifest走鉴权代理；二进制segment继续原签名重定向，逐文件授权和相对同源地址保持。

当前集中验收：verify-installer-worker-secrets.py在真实Linux bash中执行原安装器密钥区块，缺失/空/占位/有效四场景及二次执行字节保持通过，三密钥独立；没有运行完整安装器或Compose。本机Docker未安装compose插件，不能写Compose实际插值通过。

完整TypeScript、video-fusion-contract通过，新增音频在前/图片在后的实际归一化断言。verify-video-fusion-manifest-access.ts使用真实应用media route、独立PostgreSQL schema、验签隔离S3对象服务：remote-ready无镜像HLS/DASH原字节、content-type、Cookie/Vary/私有缓存、匿名401/其他账号404且网络调用0、Range206、故障503/私有镜像回退、二进制仍307全部通过；此为清单交付回归，不冒称真实视频生成/播放器质量。日志checkpoint-a/manifest-access-app.log。

四项完整源码包只读补审3041已exit0，结论No actionable findings in this correction scope；明确真实镜像旧Worker入口和完整Linux验收待补。先前candidate-4094967只有源码包，尚未构建，已被本轮必要产品修正取代，不可发布。

## 浏览器保护与测试适配

4094967稳定生图四尺寸及Agent三尺寸/原链重启已通过，原证据保持。管理计费浏览器完整15项首轮12通过/3失败：两项使用原生select API操作已升级的自定义模型选择器；另一项Assistant重试未发出预期请求，原因待独立复验，不能归为已修复。首轮billing-ui-4094967-initial-failure.log及Playwright error-context保留。

自定义模型选择器现在通过真实combobox/option操作，兼容只有一个已选模型时禁用的正常状态，并继续核对实际任务/HTTP冻结的模型身份。对应更新settings/history/creation/advanced-settings与billing-ui用例，不改应用UI来迎合旧测试。三个原失败用例集中补验全部通过（35.6秒）：工作台视频重试、画布视频重试、Assistant流中断原身份/完整对话重试；最后一项未改功能便通过，首轮原因未独立确认。合并首轮12项及本次3项作为各自范围证据，不冒称同一轮15项全绿或CI绿。后续完整画布实际应用回归尚未终态。

首轮执行后半期间开始修改contract/manifest源码，开发HMR可能影响后续测试；保留此执行因素。当前补验使用本批固定未再改动的应用源码，依据实际结果判断剩余问题，不把首轮失败直接作产品或测试结论。
