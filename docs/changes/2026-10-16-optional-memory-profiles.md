# 可选512低内存档与896默认档：真实大图/持久写入验证

## 固定边界

无新构建、无业务代码修改，使用最终0614/build1792134697的main镜像d04a89…与HK镜像0145e1…。896默认配置及此前旧客户端/46项runtime/三UI6262结果不变；512为**独立可选实验档**，未改默认值或现场计划。所有数据库、账号、媒体、Skill及包装记录均位于本任务本机合成环境，供应商调用0、生产连接0。

## 512MiB / heap256：失败，未放行

独立输出 `E:/Workspace/naumi-release47-app-drain-20261016/output/optional-profile-0614-512`。Web memory=memory-swap=536870912，Worker128MiB。先完成实际旧客户端跨版两轮、main实际46项runtime；4096×4096 PNG真实私有上传、owner原字节精确回读、其他账号404也通过。

随后**第一轮**实际HTTP POST `/api/canvas/local-image-edit`，`mode=process`、原4096×4096 PNG、`output={format:'png',downscaleMaxDim:2048}`，请求返回socket hang up。Docker inspect确定该main **OOMKilled=true / ExitCode137**。payload runner退出1，没有提高档位、没有重发或重新启动同低档来掩盖失败。

这不是壳页面内存测试：原图解码64MiB RGBA，实际产品postprocess还执行原生Sharp重编码/像素检查/fit-inside resize/再次解码。压缩PNG小于12MiB上传限制，但解码缓冲显著增加。低档不能仅凭浏览器通过就用于生产。

**准确缺项**：512三轮Sharp仅启动第一轮后OOM，后两轮、Skills导入保存、包装保存、HK单Web三UI6262与HK大媒体均未执行。死亡进程cgroup被Docker回收，未取得该main最终peak/events；不将仍活着的PG/旧Web计数或Docker事件历史查询空列表冒充main事件0。OOMKilled/137为确定失败证据。

- inspect证据SHA256：`b3564fda75a89acdeaaabc56ddd74f40d65c7ae0c42d95beae6c22ddcb0e86e6`
- payload失败JSON：`7c2a7d3b4faf1531ca4c29719c702500fdbaf5d783d2eba827309a26714d2af9`

因此512+Worker128+reserve1024=1664MiB **不作为可用发布档**。896+128+1024=2048MiB，原47可用1753MiB、HK1045MiB仍不满足这一门槛；本机默认档通过不解除现场资源缺口。

## 896MiB / heap512：主站及HK大图单任务通过

root明确要求后，独立新输出 `E:/Workspace/naumi-release47-app-drain-20261016/output/optional-profile-0614-896`，不是512的自动重试。复用已有896旧客户端/46/6262结果，只补此前缺的代表性媒体与持久读写，不重复创建假“全量通过”计数。

真实4096×4096 RGBA梯度PNG（64MiB解码缓冲），通过产品`/api/artworks/add` multipart上传到私有存储，再走实际HTTP本地图像处理**连续3次**，每次独立operationId、原始4096输入、fit-inside2048输出，读取结果后完整raw解码验证2048×2048×4=16,777,216字节，其他账号读取404。

同一次50项模块还覆盖实际账号Skill文件导入201→PATCH版本保存→GET精确指令回读/其他账号不可见；包装brief保存→revision更新→GET字段精确回读/其他账号404。action仅save，未解析或调用模型。

| 实际镜像进程 | 结果 | actual cgroup peak | events / swap |
|---|---|---:|---|
| main d04a89… | 50项、三轮完整通过 | **602.67MiB** | 所有事件0，swap0 |
| HK统一Web0145e1… | 50项、三轮完整通过 | **582.74MiB** | 所有事件0，swap0 |

main结果SHA `8b035a9ea9bdbecdba2ca7d673bf8db58e6232566bfcf07b1d5d643ddeec5683`；HK结果SHA `4dafa5037709dd4fe1bda237f489fb39ee0a23a0162aeeff64244c4a6d0b5199`。此后runner增加100ms cgroup实时采样，HK与并发测试均保留原始采样日志。

## 896：仅两个真实并发大图请求通过

按root追加要求，对同一个受控HKmain进程、同fixture owner和4096原source，同时发出**两个**真实POST，operationId各异；timeline中两个start都先于任何response，不串行伪装并发。两响应均200/2048×2048，实际进程未死，OOMKilled=false，所有cgroup事件0。**峰692.93MiB（726,589,440字节）**，cap保持896，没有扩大到3/4请求或重试。

字面结果：`CONCURRENT_MEDIA=PASS TWO_ACTUAL_POSTS=YES RETRIES=0 OOMKilled=false EXIT=0 PEAK_MIB=692.93`，runner退出0。结果JSON SHA `b7afe0cdbcb236ec06f92926ee0a76a12b92a61b54f3514074ca856bc0f97f60`，100ms采样日志记录相同peak与事件0。

这只证明本次两个合成4096处理在当前固定镜像/配置下通过，不证明3+并发、FFmpeg/其他Agent任务同时重载或任意用户输入容量。业务图像semaphore/内存优化未在本任务实现，原上线RAM门槛仍由root核对。

## 可复用工具与退出状态

- `test_release_memory_payloads.mjs`：默认不自行启动服务，只接受fixture runtime与精确label，实际HTTP媒体/Skill/包装50项；首次错误即退出1，没有重试或升档。可用`NAUMI_PROFILE_ROLE=new|variantunified`切被测自有进程。
- `test_release_media_concurrency.mjs`：仅896档、明确两个实际POST，记录timeline、结果、inspect与原始cgroup采样；不自动提升并发。
- `test_release_unified_three_ui.mjs`只把期望内存参数化为`NAUMI_REAL_COMPAT_EXPECT_MEMORY_MIB`，默认仍896；没有因512失败而降低原6262覆盖或断言。

```powershell
$env:NAUMI_REAL_COMPAT_OUTPUT='.../optional-profile-0614-896'
$env:NAUMI_REAL_COMPAT_EXPECT_MEMORY_MIB='896'
$env:NAUMI_REAL_COMPAT_HEAP_MB='512'
node scripts/ops/test_release_memory_payloads.mjs
$env:NAUMI_PROFILE_ROLE='variantunified'
node scripts/ops/test_release_memory_payloads.mjs
node scripts/ops/test_release_media_concurrency.mjs
```

512原退出1/OOM现场与896成功结果分别保留，不覆盖；分别按精确fixture label清理5/5个容器、network与其匿名volume，保存原inspect/log后再移除。未停止用户或他人容器、未连接服务器、未发布。
