# 后台文字模型显示名称修复（2026-10-10）

用户将gpt6Astra改为GPT-6Astra，前端变化但后台仍显示ID。只读新机检查确认生效模型版本74，实际保存label已为GPT-6Astra，真实供应模型仍由原target指定。

根因：后台为稳定排序先汇总图片/文字/视频混合inventory，再使用compactImageModelOptions处理家族。该图片专用函数把非图片label也回退为ID，后续工具目录不会覆盖已建行。旧6446fab函数实际复现输入label=GPT-6Astra而输出gpt6Astra。

修复仅在图片家族聚合中跳过明确的非图片项，同时图片家族成员筛选排除文字/视频。保留非图片label与位置，防止带landscape/portrait后缀的文字或视频被当成比例分支；没有重写任何已保存配置、模型ID、路由、参数或积分。

类型检查和原生模型管理通过，包括混合inventory文字名称、实际hy4-preview不变、再次改名、文字与图片家族前缀碰撞、视频名称、图片比例分组与顺序；旧发布重试/冻结执行/草稿保持。隔离完整Next+PG浏览器通过文字改名/保存/标题/目录/刷新/再开编辑框，并回归图片改名/来源切换/积分/范围/排序/手机/权限。证据output/management-text-name-20261010/ui.log，收费生成0。

候选按既有新机锁、完整备份和固定镜像流程发布，回滚至6446fab，保留最新用户配置。最终运行SHA、版本与线上只读验收由发布后跟进补录。本候选记录不冒充已发布。


## 最终上线

新机120.27.162.85已发布固定源码7099f06959934e3a2a8145ba76f4e973d0b5cb2b。APP/Worker镜像ghcr.io/jesstle/naumi:7099f06959934e3a2a8145ba76f4e973d0b5cb2b，Image ID sha256:d37d28cda1eea2da592ad6587f4005148dceab1c78b3e38665372cca08a8337d，实际版本1791601939 / v2026.10.10-111219。

全程deploy.lock下备份完整DB/env/Compose、验证固定6446fab回滚、clean SHA离线构建、切换前核对main和实际镜像、最终健康db.ok/版本/浏览器验证；COMBINED_RELEASE=PASS，锁确认释放。预构建和切换前最新用户配置均为v76，保存配置581dd140e52f1ec557ec5761b242fa03、所有草稿fc059b565ed507dd7e38df5c38bc59af、计费v8保持。元数据861条/97fd756df9c7ca5b661c46db71a48a24、修订863条/593f44ae5f54ca1f021109b792cf08df、采购价格0条完整指纹前后相同。

线上原生所有非图片名称与保存label一致。真实浏览器逐项核对后台文字标题、编辑框、前端文字目录，专门核验gpt6Astra为GPT-6Astra、取消/刷新保持名称，真实模型hy4-preview保持。参数映射/单个画布系统/模块用途/元数据库弹窗/手机，以及四个图片家族品牌/稳定排序/选择刷新/报价/扩图通过。没有提交配置或收费生成，模型ID、实际模型和现有用户改动保持。

证据/完整备份 /opt/naumi-staging/evidence/management-text-name-20261010，live/GPT-6Astra.png与GPT-6Astra-edit.png为实际页面，live/name-result.json记录名称与真实目标，live.log/canvas-live.log为回归。ROLLBACK.sh --apply取锁并核验候选后恢复固定6446fab，保留最新用户配置/DB/媒体。临时浏览器会话和容器helper清理，隔离PG停止。DB容器/媒体/Compose/其他env/公网代理保持，旧机未连接/回传，local媒体及视频/OSS延期保持。文档跟进不另发镜像。
