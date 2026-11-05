# R9G：重构验收的执行输入收敛

## 模块与职责

本轮先收敛 R9F 最终远端验收的真实失败，不新增业务模块。原始源码为 `804ce5af0196300ba90fd00a9a193414ef838fdd`，5,346 个文件原始字节和归档已保存。整体目标仍是完整模块化重构；未合 main、未部署、47 HOLD。

CI/浏览器验证驱动拥有构建资源和测试语言等执行输入；产品继续拥有真实语言选择、提示词优化、权限、任务和计费规则。驱动配置不能依赖测试机器的默认语言，也不能把本地较大构建预算的通过当作不同 CI 环境通过。

## 当前证据

- Image gateway `41268979117` 在实际 `npm run build` 时 V8 heap OOM，约 2 GiB，Next worker SIGABRT。Core 同轮的固定 Docker 构建成功；其现有预算是 4 GiB。预算差异已经观察到，但在受控实际构建前不认定为闭合。
- Core `41268979043` 实际失败在 `canvas-theme-matrix`，等待中文“优化预览”时超时。实际 ARIA 树为英文界面；驱动没有固定 browser locale，而产品 SSR 按 `naumi_locale` cookie、`Accept-Language` 的现有规则选择语言。
- 新 run 的完整 artifact 下载仍遇到 TLS EOF，原尝试已保存；当前定位依据是实际 job/annotation 及源码，不虚称已读完整 artifact。

## 实现及验证状态

已完成同一份冻结源码、相同 Linux 环境与同一 `npm run build` 的 2/4 GiB 对照，以及英文浏览器下旧主题驱动失败和固定真实中文用户输入后的原完整主题断言。不延长超时、不删业务断言、不修改产品语言或 JSX 来迁就验收。

本轮源码、实际执行、远端结果、副本回滚和未完成项随进度更新；历史失败保留。

## 已执行的主题对照

用同一实际 Next Canvas，给原驱动明确输入 `en-US`：实际英文面板存在，中文“优化预览”定位器失败，child exit2。驱动现用 `locale: zh-CN` 和真实 `naumi_locale=zh` cookie；相同英文宿主输入下，原97断言加1条实际HTML语言检查共98项PASS，四种主题组合、重载、原任务恢复等断言保留。验证器未替换翻译组件、改变产品UI、提高超时或重试手势。

## 构建对照进度

冻结5346文件逐字节一致的Linux输入，2CPU/8GiB容器、Node24.22.2、原始npm build，唯一对照变量为NODE_OPTIONS中的old-space预算。2048MiB复现实际V8 heap OOM/exit1；4096MiB完整构建exit0，两次容器OOMKilled=false。cgroup整体内存峰值分别为4,423,110,656与4,714,049,536字节；这不是单Node堆/RSS或生产容量，Linux夹具也不冒充完全相同的GitHub宿主（本地Node24.22.2，原CI24.22.0）。

Image工作流只在构建步骤设置4096MiB，与已有固定Docker构建预算一致；其他测试及生产运行资源保持。runner18场景300检查PASS，真实Bash子进程验证预算实际传入、成功0/失败7原样退出，日志及错误注释保持；没有新增continue-on-error、跳过类型/lint、放宽断言或超时。2CPU/8GiB两次均固定，并未用增配容器掩盖基线失败。

两次准备错误留存：Dockerfile的裸sha256被解析为仓库引用，已先核对本地SDK tag对应精确image ID；SDK fixture根目录不可写，已仅在自有构建夹具赋目录所有权。它们不是有效内存对照，也没有更改产品文件。

## 当前剩余与交付边界

本轮产品源码0变更，原2141个src/services文件继续逐字节保持。旧9ba的216整版与运行/混合结果只属于其原源码；本轮为实际失败点的定向修正，没有重复旧全量批次。当前完整源码、副本回滚（原英文失败及未配置堆预算恢复）、最终HEAD与新远端CI以R9G的VERIFICATION/DELIVERY为准。最终主线整合仍等待新head实际required checks，整体ACTIVE、未部署、47HOLD。
