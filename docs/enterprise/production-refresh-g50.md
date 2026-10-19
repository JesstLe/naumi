# G50 当前完整Linux生产组合与交付镜像刷新

## 目标与基线

把G49及此前各完整业务模块从Windows/Next开发态证据推进到真正Linux生产镜像。仍使用仓库根Dockerfile的完整Naumi Web、同主干独立工作流运行镜像、原18482产品HTML，不创建另一套企业UI或精简功能Web。

本轮刷新47：既有生命周期CLEANUP_PENDING/MIGRATED_CLEANUP_PENDING revision74仍在，且三把部署锁由另一个在运行的python进程持有；不争抢、不删状态、不停他人槽位。只在本机构建与隔离验证。用户尚未回复工作流部署位置，来源选择47不等于部署地点确认。

本机Docker数据位于D:/DEV/DockerData/wsl，D剩余约31.6GiB，E上下文约43GiB；C约7.6GiB但不用于构建上下文/镜像存储。构建前核查仅本项目一次性Linux验收镜像，删除4个无任何容器引用的旧测试镜像，保留最近2个；未删除生产/回滚镜像、volume或被先前环境拒绝的文件缓存。未将Docker对象逻辑删除量冒充宿主VHD实际回收量。

## 实际发现

原Linux验证器停留在G15：把sharp原生依赖打进esbuild验收脚本，在Linux执行到图片预检时出现Dynamic require失败；且硬编码checks16。实际BASELINE_LINUX运行exit1，日志和清理证据保留。

旧生产镜像组合默认external会跳过后续大部分业务模块，只验证10组旧链路；与当前代码完整程度不匹配。刷新验证器：生产full-modules模式显式启用所有已实现运行功能，测试驱动包含相应测试模块/固定依赖，执行同一完整业务验收而非缩小用例。兼容旧proxy/baseline模式需显式选legacy，不默认掩盖新版模块。

## 验收与产物

实际Linux/amd64 UID1000 API/Worker，root只读、独立受限临时卷、无Docker socket/宿主端口，固定Image ID/源码/HTML/依赖摘要；原生密码登录完整生产Web，同源BFF与独立源库/工作流库，真实附件字节与权限，当前全部模块。退出经原有drain/stop和Web SIGTERM，所有合成资源按本轮标签精确清理。它不是47完整容量或生产无感切换的替代证据。

最终固定源码、镜像、镜像导出校验、原数据保持和源码副本恢复，以本轮VERIFICATION.txt为准。基线原Linux检查失败需据实保留，回滚副本恢复该行为不等于修复被保留。整体目标ACTIVE。

## 本轮修复与版本固定

Linux验收46组及原生产镜像API/Worker实际启动/下载/健康角色错配/只读文件系统/正常退出已通过。46组不等同于Windows带全部旧版本运行包的61组，前者额外覆盖Linux容器边界，后者包含历史版本拒绝门禁。

完整生产Web已完成原根Dockerfile的Next15.5.27编译、类型检查、90页静态生成和standalone。测试驱动缺tests目录导致首次组合构建失败，已补到显式文件清单与验收Dockerfile；仅测试驱动带测试源码，生产运行镜像不引入测试入口。full-modules开关同时控制显式迁移激活、后续业务测试与数据数量断言；不是只提高最终计数。

生产运行速度快于Next开发编译，实测触发原60秒限流。测试驱动仅对明确429等待61秒，再发送完全相同请求体/命令ID；不重试未知5xx或收费请求，不更改生产限流。组合driver超时扩至720秒以容纳冷却。

重复Docker build的attestation会令相同releaseId的镜像索引ID变化。新增--runtime-report，复核既有固定Image ID/标签/源码/release标签/UID后复用，从而最终Linux独立验收与Web组合使用同一个已验证镜像，而非“内容似乎一样”的重建索引。--web-report仍严格核对固定Web；正式模式拒绝dirty或Git不一致。

```powershell
node services/enterprise-workflow/verify-linux.mjs --output ABSOLUTE_LINUX_OUTPUT
node scripts/build-enterprise-web.mjs --output ABSOLUTE_WEB_OUTPUT
node scripts/verify-enterprise-production.mjs --output ABSOLUTE_COMPOSITION_OUTPUT --web-report ABSOLUTE_WEB_OUTPUT/WEB_BUILD.json --runtime-report ABSOLUTE_LINUX_OUTPUT/LINUX_BUILD.json
# 旧跨版本代理验收仅显式使用--full-modules false，不冒充当前完整模块覆盖。
```

生产镜像导出按这两个已验证tag执行docker image save，重新打开tar核对配置标签/平台/用户/各层字节与摘要，并在本机docker load后核对Image ID保持。保留当前与先前有效回滚镜像，不将tar存在当作已发布。47源数据和原18482入口保持，真实试点尚未应用。
