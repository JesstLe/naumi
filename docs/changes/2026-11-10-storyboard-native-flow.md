# VV-02完整画布创作链路：原生浏览器验收

## 模块与职责

在同一真实Canvas／Next／PG／Agent／Worker／媒体和计费服务中，以浏览器贯通正式原稿→分镜方案→预演与预算→生成→选片采用→时间码定位→单镜返工→保留旧采用→粗剪→人工剪辑→导出下载→重开。供应商模型回答与生成视频使用明确fixture，不据此评价真实创作质量。

## 公共接口、依赖与状态归属

不新增产品运行时或工程状态；仍由原稿、正式storyboard方案、workflow任务、timeline工程和账务owner负责。浏览器不拦截或伪造任何产品HTTP响应，只有既有fixture上游脚本返回固定模型回答和测试媒体；所有保存、恢复、账务及下载走实际App。

固定镜像验证控制器新增`--case storyboard-flow`。完整流程脚本作为只读测试适配挂载；固定生产App／Worker不变，控制器记录适配精确SHA，SDK与父级私有PG没有外网、发布端口或Docker socket。子级不删除父数据库。

## 基线与实现过程

- 本任务基线main：`3eadebf7e5d658416099ffa5c8d57d3b02f8cbd1`；独立分支`codex/storyboard-native-flow-20261110`。
- 复用上一阶段已验证的完整生产App／SDK，固定产品源码`2458a4d5644ce7d669c8ba7c520e90a6e05648b5`；3eadebf7相对它只有验收脚本、素材和文档改动，未更换产品代码。源指纹和实际App版本仍核验为2458，不写成新产品镜像。
- 新增`scripts/verify-storyboard-flow-native-application.ts`。从真实原稿按钮启动站内Agent保存正式三镜，后续动作使用实际完整画布控件；不通过测试注入React内部状态。
- 开发测试首轮纠正正文卡片和底部编辑器同名locator，明确定位底部编辑器；第二轮纠正列表API不返回正文的读取方式，改用正式原稿详情API。它们是测试定位／契约错误，不冒称产品缺陷。

## 验证命令、结果与证据层级

固定Linux实际完整画布13项通过，命令：

```text
python -X utf8 E:/Workspace/naumi-storyboard-native-flow-20261110/scripts/verify-native-application.py run --sdk-manifest output/vv01-native-sdk/SDK_RESULT.json --case storyboard-flow --out output/vv02-native-flow-8
```

cwd：`C:/Users/13357/.t3/scratch/nvf-2458`（精确2458a4d5干净验证树）。字面结果：`STORYBOARD_FLOW_NATIVE=PASS CHECKS=13 FULL_CANVAS=1 REAL_APP_PG=1 REAL_SUPPLIER_CALLS=0`，退出0；父级`NATIVE_FIXED_APPLICATION=PASS`及自有容器／PG清理均通过。Page errors为空。

覆盖：

1. 原稿正文按钮→实际站内Agent流与业务工具→正式三镜方案，规划不生成视频。
2. 实际浏览器断网后编辑方案，保留原保存操作，恢复网络后成功；全页重开视频编辑器可接回同一方案，不再次调用Agent。
3. 正式预检与原生预演不产生视频任务。
4. 生成已受理后重启App并重载页面，继续原制作链；三镜完成后逐一人工采用。
5. 1.2–1.8秒批注实际定位原片，只重做第三镜；原三镜采用保持不变。
6. 创建粗剪→真实多轨编辑器→首镜裁剪3.5秒；旧采用素材身份不变。
7. 从方案原稿读取唯一正式对白“爸爸，我到了。”；实际浏览器上传已有中文录音，绑定独立声音，3.2–5.7秒跨过首镜切点；人工校时与字幕烧录保持原文。
8. 实际导出、采用、浏览器下载MP4和SRT；SRT台词只出现一次，时间3.2–5.7秒；全视频／音频解码通过，实际烧录帧打开检查中文清晰，无缺字。
9. 关闭后从完整画布重开工程，裁剪、采用、对白、音频和下载保持；没有重复生成。
10. 390px窄屏实际重开，无文档横向溢出；1440px／390px实际截图已打开核验。

本次fixture真实业务账务：4个视频任务（每个20积分）＋1个媒体导出（3积分），账本新增5笔，总扣83；正式账户接口可用积分10030→9947一致。`app_users.credits_used`是占位而非本链实际消费累计，检查改读正式账户可用余额，不用旧镜像字段误判费用。以上全部为隔离测试账务，真实供应商调用和商业积分支出均0。

真实产物与原始失败现场位于`E:/Workspace/naumi-task-evidence/storyboard-native-flow-20261110/`；原始源码SHA／基线、修改／回滚命令、字面输出／退出码及四项产物见其中`VERIFICATION.txt`。原控制器没有storyboard-flow选项，独立副本回滚后恢复该状态，活动修改快照保持。

开发过程还纠正了测试误读render.jobId（实际回执job.id）、URL定位不自动打开多轨（使用原生“编辑多轨”按钮）、对白嵌套summary locator，以及旧credits_used消费假设。没有为让测试通过改产品行为或绕过账务。

## 未完成条件

真实供应商试片、全恢复矩阵、真正创意Agent质量、线上及生产发布另验。VV-01的正常入账和当前分镜环境前置条件不因本地完整浏览器证据解除，47暂停保持。
