# Omni原项目对照与整合修正

## 实现与来源

基于主线2d3e2ee继续本目标，未修改共享checkout。对照固定IC 68b37db的handler/kie_video.go第716—744行及真实原前端→原Go direct-request→隔离供应商调用，发现Naumi把reference分支的静音限制错误应用到了transformation。

- Omni duration采用原协议的number；其他KIE分支保持各自类型。
- 带图片的视频编辑保留显式音频与请求比例、时长；纯视频编辑采用auto并省略duration，仍保留显式音频。
- 只有reference带视频时限制audio=false；双图image分支采用auto，与原Go一致。未推断或改写管理员能力和冻结映射。
- 应用协议验收补带图audio=true编辑、纯视频audio=true编辑、纯视频audio=false参考；检查实际供应商收到的比例/时长类型/完整对白/音频及编辑无结构化分镜、元素。修正按profile选择子集时结果报告仍错误按全部用例计算的问题。

## 原项目实际证据

独立原项目后端仅监听127.0.0.1:15372，原SQLite与原创素材；六段调用实际执行原create/poll函数和原Go转换器，外部供应商完全替换为严格隔离传输，无网络兜底。结果：

`E:/workspace/naumi/output/canvas-video-fusion-20261013/reference/ic-68b37db-20261014/native-video-826a9496-904f-44f9-ba18-cdb01a690ebe/result.json`

开场、四格拼图12秒、硬切、同机位、前传、编辑全部完成。检查完整多行对白、4×3秒原文、拼图全图非首帧、元素身份、直接前序完成后引用；实际输出字节SHA与ffprobe对应12秒静音/4秒带音频素材。编辑audio=true、16:9、number 4与实际带音频结果一致。

正式视频API调用0，真实LLM策略未执行；不能扩大为真实上游生成质量或原浏览器完整故事生成成功。原浏览器历史/任务展示局限保留。

## 集中验收与后续

TypeScript全量检查通过。四种Omni profile共六个应用用例在真实App/Router/PostgreSQL/Worker隔离链路全部通过，结果application-protocols-a6f446d3-870a-49cf-aea7-b6dfbd3b5451。供应商实际收到number duration、正确audio及比例；两账号私有媒体、下载SHA、预扣/幂等、重启后无重复提交/结算同时检查。选定6项报告plannedCases=completedCases=6，不拿6项冒充全53项重跑。

受影响拼图完整应用流程mosaic-00a094b2-c52b-4b2c-8227-a2143f16f136通过，实际12秒/四段原文/正式音色元素/任务恢复/权限与一次结算保持；连续链当前主线回归continuity-5cb483be-5207-40c4-abf8-9621856b943f通过，四个真实前序依赖任务、冻结身份/SHA、硬切/同机位/前传及重放保持。对应更新覆盖登记45份，V12/V13关闭后32/34；S01/S02和最终交付门槛继续。

独立CLI只读完整源码包补审51228 exit0，结论No actionable findings in this correction scope；输出omni-parity-review-20261017.txt。这是本修正范围审阅，不能替代新整合主线的全分支审阅，wholeBranchReview已重新设pending。原6689审阅证据仍保留为其范围历史。

原生复现脚本已保存scripts/video-fusion/verify-reference-native.mts；VIDEO_REFERENCE_ROOT指向隔离原项目与原创素材目录，沿用原web tsconfig通过tsx加载。上游真实浏览器局限及公开演示站版本/验证码限制保留在comparison.json，没有以本API补证伪称浏览器全流程成功。

首次恢复自有PostgreSQL时遗漏启动端口参数，启动到回环5432；识别后等待自身崩溃恢复完成，正常关闭自有cluster并以原53292重新启动。没有连接/修改其他数据库或服务器。后续启动明确传-h 127.0.0.1 -p 53292。

旧6689三种Linux镜像已构建并补启动检查，但已落后整合主线。最终候选、兼容回滚、S01/S02完整保护和103发布仍未完成，不持发布锁。

## 4094967合并后的保护检查

普通原子推任务分支与main到40949675a1ae828eb37909e263b7ac3c25d13ada，未强推或切换共享checkout。当前源码18组计费检查exit0，含真实DB/直接实际路由和服务的报价/预扣/结算、未知提交、恢复及并发；可复核日志billing-all-4094967-20261017.log及SHA元数据，不将其称浏览器或最终Linux候选验收。

四尺寸1440×960、1366×768、1600×1000、390×844的稳定生图真实HTTP/Chrome流程exit0：透明像素、画选区蒙版、普通节点dock、双击/重载无重复、免费WebP、本地输出转换、JSONL批次ZIP，以及桌面三页/作用域API/共享链接。模拟图片供应商调用14，正式外部调用0；当前1440/390截图已查看。日志stable-image-browser-4094967-20261017.log。

Agent三尺寸/关闭页面/实际App重启/Worker原依赖链也已通过，当前证据agent-browser-c2b74acc-a321-4126-b4f1-57088669d417。1366/1600/390面板与控件边界、浏览器错误0，真实人类确认前模型自确认拒绝，完整文本和两个原结果恢复、重放不重建。Agent-restored截图实际显示已完成视频及完整第二段输入，但右侧为新对话欢迎态；历史恢复依据实际早先读取与断言，不把该图冒充历史对话截图。管理计费浏览器按顺序继续；S01/S02未提前关闭。

完整分支新上下文review84197基于6048ae7审4094967正在执行；shell helper不可用后已转只读Node工具读取，必须等具体结论，不能把进程启动或exit0直接当无问题。

本次push对应GitHub38989685958镜像与38989685976回归均在无steps的初始job失败，镜像构建/发布跳过；未获取新镜像。当前token读取check annotations被403拒绝、resolve日志不存在，因此此次失败原因未独立确认，不仅凭历史支付限制猜测。本地验收继续，后续沿用已验证的固定Linux构建流程，不将本次CI标绿。
