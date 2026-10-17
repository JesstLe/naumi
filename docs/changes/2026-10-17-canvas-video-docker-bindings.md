# 画布视频发布：Docker 有效绑定比较

## 已实现

开工刷新 origin/main，基线 e8ba512。修正历史 UI 退役工具对 Docker inspect 原始挂载数组顺序的依赖：实际 103 的 /data、/data/media 顺序会变化，配置和启动实例并未变化。

release_legacy_ui_retirement.py 使用 effective-mounts-network-name-sets-v2：挂载按唯一 Destination 排序，重复目标拒绝；保留每个挂载全部字段。网络只排序 Aliases、DNSNames、Links，保留重复数、null、缺失与空列表的区别，其余字段原样参与摘要。Config.Env/Cmd 不排序，重复环境变量及其顺序保持约束。

摘要内容包含格式标识；两种退役策略的 manifest、恢复 intent 必须显式使用 v2。旧格式在访问宿主机前拒绝，必须重新采集并准备，不把旧摘要默认为新算法。观察和新 intent 记录格式。retained-CID 恢复时网络配置中的别名顺序也规范化。原有启动身份、锁、源、任务、引用、静态材料和维护网关门槛保持；没有放宽停服务条件。

## 验证

Linux root 执行三个集中测试模块，共 27 项全部通过，无跳过：test_retirement_binding_format.py、test_release_legacy_ui_retirement.py、test_release_runtime_ui_retirement.py。涵盖正常排列、字段真实变化、重复环境变量顺序、挂载源与读写变化、新增字段、别名重复计数、null/缺失、异常类型、旧格式在任何 host 调用前拒绝，以及原有停服/恢复/实际 flock。

实际 103 通过原有已授权 TCP relay 只读执行修正后的完整库，对精确 13033 CID/镜像/boot/PID 连续核对五次：原始挂载摘要出现两个值，v2 immutable/network 摘要各只有一个值。productionWrites=0、retirementAuthorized=false。没有重跑耗时的全 realm 审计，没有再次打开 Inspector。

独立 Native 只读审查读取五份完整源及 SHA，未发现可操作问题；不是线上验收替代。证据保存在忽略目录 output/canvas-video-fusion-20261013/checkpoint-d/canonical-bindings-20261017/，含 sources.json、verdict.txt、actual103-binding-library.json。

## 当前有效引用观察

只读检查 38 个 Docker 容器的 Env/Cmd/Entrypoint/Labels，未发现其他容器直接引用目标 13033 的精确 CID、名称、端口或地址。原 Worker 的 NAUMI_APP_ORIGIN=http://app:3000；其共享网络中 app 别名唯一匹配受保护的核心 13012 CID 18c31dc9e0cf324f670c8d97a591c5fa688961f1f3713029ac12a29f0d094211，IP 172.18.0.16。Nginx 完整摘要仍 fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e，目标 boot/PID 保持。

systemd 联集 283 个服务名超过原工具 256 上限。分离 29 个未实例化模板后批量读取有效属性，得到 236 个规范 Id；别名、未加载单元和模板不能当作已完整检查的执行器。所读有效属性/fragment/drop-in 未匹配目标，但 10 个单元含 EnvironmentFiles，文件内容及 ExecStart shell 包装、动态调用尚未核查。因此结果明确为部分引用观察，不满足完整引用闭合。初次批量读取被无效模板中断，只得到 5 个 Id 的回执未当作完整证据。最终观察见 actual103-effective-references.json。

## 未完成

仍需源自治入口与实际任务归属证明、完整有效调用引用，以及可恢复的历史 UI 串行退役；之后实测可用内存并完成 103 锁内发布、回滚与线上受影响功能验收。原硬编码 boot pins 仍旧，不可用于当前实例停服。本次没有停止容器、释放 RAM 或发布新应用，没有持有发布锁，维护计数不增加。
