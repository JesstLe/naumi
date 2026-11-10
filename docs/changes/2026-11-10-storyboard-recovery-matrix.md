# VV-02完整画布恢复矩阵

## 模块与职责

承接同一完整画布13项创作交付，继续验证登录失效、真实工作空间切换、双窗口CAS、已采用素材删除、真实媒体合成失败和仅媒体重试。原稿、方案、任务、采用、工程及账务继续由原业务owner负责，不新增运行时或第二套状态。

## 固定基线与依赖方向

- 任务基线main：`78a472a0098565ed40e88406390bf4b8292a920a`；独立分支`codex/storyboard-recovery-matrix-20261110`。
- 复用已验证固定Linux完整生产App／SDK，实际产品源码2458a4d5；后续主线只改验收脚本／素材／文档，当前不声称镜像源码是更新的main。
- 新增`verify-storyboard-recovery-native.ts`作为浏览器完整业务后续阶段；原生控制器`--case storyboard-recovery`加载精确SHA的只读测试脚本，复用原完整流程13项后再执行恢复矩阵。
- 企业身份、口令和媒体文件故障只在拥有者标记／当前fixture schema／两个随机测试账户内准备。登录走实际原生密码表单及`/api/auth/login`；空间走实际选择器，产品响应不伪造。模型仍受控供应商，真实供应商调用0。

## 已实现的验收动作

1. 清除真实浏览器登录cookie后保存返回401，原方案revision不变；另一标签页通过真实密码表单登录，再核对原保存操作，正文／采用／任务和账务不额外变化。
2. 两个独立浏览器上下文在同一revision编辑保存，只有一处成功；冲突处保留草稿，明确载入已保存方案后才替换。
3. 个人空间保留未知保存操作后切到实际企业空间，个人项目跨空间写入被拒；切回后沿个人原操作恢复，不跨空间复制草稿。
4. 完整画布删除已采用素材后，制作预检提示素材不可用，新建粗剪拒绝且不替换采用；保留原粗剪与费用。恢复素材后继续。
5. 显式合成旧采用，真实本地文件故障令媒体引擎失败，核对预扣释放；用户点击仅重试合成，新媒体任务成功，视频任务／采用不重放。

## 命令与当前证据

新固定完整Linux生产App实际通过19项：原13项完整创作＋五类恢复动作＋跨源分镜成片下载／解码。命令：

```text
python -X utf8 scripts/verify-native-application.py run --sdk-manifest output/fixed-sdk/SDK_RESULT.json --case storyboard-recovery --out output/vv02-recovery-fixed
```

cwd：`C:/Users/13357/.t3/scratch/nrm-fixed`。字面结果：`STORYBOARD_FLOW_NATIVE=PASS CHECKS=19 FULL_CANVAS=1 REAL_APP_PG=1 REAL_SUPPLIER_CALLS=0`，退出0；父级固定App校验及自有容器／PG清理通过。主浏览器page errors为空。

固定源码`0f4845aa4f7e35eaab2b1d7c7d564ccc5598ad2a`，构建版号`1794309071`；完整生产Image ID`sha256:1c47d946e58359ddfd394745b4142991ad37cf6a9ae53ac2462150762f6acbf9`，SDK Image ID`sha256:bfbc8fc97e16cc4b605165e0204362b7fe4cf71ce115e02159d99e3b9a70f3b6`；SDK探针对照生产server／buildId／Worker字节一致。全Dockerfile构建exit0；不是旧镜像上覆盖前端源码冒充修复。

实际矩阵结果：

- 登录cookie丢失→真实401；原生密码表单实际登录200→重开原项目→原operationId/body核对保存200，未收费。
- 两个独立浏览器上下文同revision同时保存，HTTP200／409各一；冲突草稿保留，用户明确载入已保存方案才替换。
- 实际空间选择器切企业后不显示个人项目；同浏览器以真实HTTP显式携带企业空间写个人方案返回409。切回个人、重开节点后恢复原个人pending操作。该409是浏览器HTTP权限探针，不伪称用户可在企业界面看到或点击被隔离的个人节点。
- 完整画布菜单删除已采用素材，实际制作预检报告不可用，新建粗剪拒绝；原采用、原粗剪、任务／账本／余额保持。通过原历史恢复素材后继续。
- 真实媒体文件路径故障令concat失败；失败预扣释放、charged0／ledger0／reservation0。点击“仅重试合成”，新媒体job成功，只收费3积分一次；视频create／task均保持4，方案采用和原粗剪不变。
- 分镜成片使用统一下载入口，浏览器download事件、真实文件保存和完整FFmpeg解码通过。

恢复矩阵开始前fixture状态：video tasks4／media jobs1／新增账本5笔、可用9947。结束：video tasks仍4／media jobs3（含失败及重试）／新增账本共6笔、可用9944。真实供应商调用0，商业模型支出0。

基线／修复／回滚原始哈希、精确命令／输入／字面输出／退出码及四项真实产物见`E:/Workspace/naumi-task-evidence/storyboard-recovery-matrix-20261110/VERIFICATION.txt`。恢复矩阵／下载及原始失败现场均保留，活动修改快照不回退。

完整浏览器矩阵覆盖本PRD列出的故障类别，但不是所有可能组合或容量证明；真实供应商、部署连续性及线上验收独立。

## 未完成与下一步

这条矩阵完成后仍需真实模型／创意质量、真实通道声音与辅助检查、以及获准发布和线上验收。VV-01真实环境／余额条件独立，47暂停保持，持续目标不因本地矩阵自动关闭。

## 实际发现并修复的交付缺陷

旧2458完整App的五项恢复动作已实际通过，最后分镜成片“下载成片”未触发浏览器download事件，页面转为内联媒体、DOM为空。分镜面板直接`href={output.url}`＋download属性，与已有多轨／播放器使用`mediaDownloadHref`不同；跨源私有S3地址会忽略download属性。旧版本浏览器完整失败回执位于`vv02-recovery-5/NATIVE_CASE.log`，退出1；此前登录、CAS、空间隔离、素材删除和真实引擎失败重试均通过，不能把最后下载失败省略。

本次只将分镜下载链接改为既有`@/lib/media/download-href`的统一`/api/download`入口，保留预览与“打开成片”原链接、归属校验、文件名和任务／账务语义，不新增下载代理或数据owner。新增恢复产物真实浏览器下载、统一入口及完整FFmpeg解码断言。修复后须重新构建生产App并集中复验，而非只改测试期待。

## 修复后原链回归

同一新固定生产App再次执行原正式分镜套件：`python -X utf8 scripts/verify-native-application.py run --sdk-manifest output/fixed-sdk/SDK_RESULT.json --case storyboard --out output/storyboard-regression-133`，字面`STORYBOARD_APPLICATION=PASS CHECKS=133`，退出0。真实App／PG／Worker／存储／账务及CLI/MCP原链通过，自有测试容器／PG均已清理。完整TypeScript及4个受影响文件定向lint通过。
