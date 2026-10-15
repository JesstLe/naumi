# 47取消生成静默裁切：核心修复完成，发布链路未闭合

## 要求与诊断
用户要求取消静默裁切；编辑原图默认跟随主图比例，主动选择其他比例则按选择构图，不靠返回后删边。

灵溪截图对应 job-80a19ceb-a2c1-4cf3-afa9-c5d3470dc96f，3:4结果1024×1365，标题在保存原图内已缺失。线上8458.js及源码存在attention/cover裁切，离线真实函数1024×1536→1024×1365删除171行。该笔上游未裁回包没有留存，不能排除模型自身构图出界；不将复现当作该笔逐像素证明。

## 已实现（仅generate-image核心）
- 移除自动cropToRatio/cover及旧ratiogen提前裁切；无显式像素尺寸时形状处理逐字节返回上游完整图，不自动补边/拉伸。
- 显式宽高使用contain，透明图补透明、其余补白；保留四边。原有分辨率档位放大、显式后处理仍独立存在，不把整个处理链冒称原始字节不变。
- legacy请求ratio=auto时从第一张输入匹配标准比例（0.1%像素舍入容差）；显式比例优先，非标准保持auto并在OpenAI构图提示中写真实尺寸。
- 保存实际结果宽高及约分比例，EXIF旋转方向正确；请求比例不冒充实际比例。
- 精确线上chunk overlay生成器按唯一锚点修改当前8458.js；无关模块/供应商适配字节保留。不是完整主线镜像，也不是正式发布脚本。

## 尚未实现/上线
- imagegen计划和高级面板未改，旧默认1:1仍存在；不能声称所有编辑入口已默认跟随原图。需单独整合显式/默认比例来源，再验证报价与冻结计划。
- 上游只有原生三档时不保证精确任意比例；保留真实完整画面而非裁边伪装达标。
- 原作品及冻结任务未重写，原先丢失的边缘不会自动恢复；无付费调用、无余额修改。

## 发布窗口与发现的阻塞
- 收敛线程阶段A已完成。必须保留13068画布、13052容量回调、13063登录、13070/71、API适配及Worker；13072/73为APIB拥有的候选。
- /api/imagegen内部直接import generate-image，单独网关/api/generate-image切流不足。
- 当前Worker NAUMI_APP_ORIGIN直连http://naumi47-green-5fc5efe79267:3000。旧App的recoverDurableImageJobs经自身INTERNAL_APP_ORIGIN（缺省127.0.0.1:3000）恢复generate/imagegen，绕过Nginx；旧模块可能重新裁切。
- 当前47 Linux Sharp的提取函数无付费fixture也验证了旧1024×1365、新1024×1536、副本回退1024×1365；主App和恢复App的真实chunk均仍存在attention裁切。仅是函数验证，不是完整HTTP/Worker恢复E2E。
- 协作线程已明确“先不要切流”，本轮不创建候选、不改入口/13052/Worker、不占部署锁，不声称完整取消裁切上线。待统一新提交、查询、Worker恢复执行版本，持三锁刷新基线/资源/备份后再蓝绿。
- 新旧任务遵守原operationId、租约、冻结配置和幂等，不重放用户任务。后续临时路径发布须登记所有者和统一候选接管后的退出条件。

## 验证与Git
- 源码原始四边fixture、透明/显式尺寸contain、auto/显式比例、EXIF及实际metadata验证通过；线上精确chunk提取函数的旧/新/副本回退验证详见output/no-silent-crop47-20261015/VERIFICATION.txt。
- 原imagegen intent/contract/capabilities/postprocess四项集中通过；全量TypeScript仍只有既有canvas-action-menu.tsx:82的RefObject类型错误，退出2，不称全量通过。
- 独立codex/no-silent-crop-47-20261015，开工/收尾刷新main均c2634fb；APIB新增e076c0f设计文档、运维98b749d不并入业务；model-health/channel-live-guards为尚未合主线/上线的独立模块，已检查其最新交接，不未经统一候选验收整支混入本核心补丁。共享checkout不切分支、不覆盖未提交内容。
- 功能迭代1/3，发布计数未增加。四件交付/原hash/副本回退及字面测试结果存本任务output目录。仅任务分支提交推送，待完整链路验收后合主线/发布。
