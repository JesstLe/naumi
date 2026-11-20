# 2026-11-20 画布抠图报价模型回显修复

## 模块与根因

画布直接抠图复用浏览器报价、实际multipart `/api/cutout`、模型执行与同步计费。线上模型v157的隐藏默认抠图处理器已启用，报价正确选中它。浏览器submit按既有契约将报价modelId回显到`x-naumi-feature-model`；参数准备把该回显再次当作用户显式选择，隐藏可见性校验返回MODEL_UNAVAILABLE/409。09:25:34及09:26:40CST的实际请求对应此入口，未进入新增tool.cutout账务操作；不是供应商拒绝、通道未配置或画布当前GPT图像模型失效。

## 最小实现与边界

只修改`image-preparation.ts`的quotedDefault分支：经过账号/工作空间绑定读取的服务器报价，在其冻结模型版本中恰为配置默认、body没有显式model/modelId、header为空或与报价一致时，header是报价身份回显，保留隐式默认语义。无报价隐藏ID、其他默认/隐藏报价、不同header、body显式隐藏选择、停用/用途不匹配仍拒绝。不公开内部模型、不删除visibility校验、不改模型/计费/凭据配置，不重放既有任务。

## 集中验证

- 真实planner/preparation/executor/describe及选择约束36项通过。原源码副本使用`--quoted-header-baseline`稳定复现MODEL_UNAVAILABLE/HTTP409、供应商调用0；修改后通过，另副本hash-guard回滚后恢复同原错误。
- `verify-cutout-quoted-default.ts`：独立PG随机schema、实际billing quote POST→返回隐藏默认→带回显header的multipart cutout POST→loopback供应商→真实作品/alpha/账本→同操作重查。16断言通过：quote200、submit200、replay200、供应商仅1次、固定3积分一次；错owner/无报价隐藏/body显式隐藏/不同header均拒绝且无额外供应商调用。外部供应商调用0，schema/连接池/loopback/临时媒体清理完成。
- 完整Linux构建、固定版本蓝绿与公网受影响链路尚待本节后续追加，不能把本地fixture当作线上成功。

## 协作与保护

独立工作树从origin/main48949916开始，共享dirty不改；不修改同事尚未提交的生成进度模块。只47目标，保持同版本Web/Worker、三锁、备份、自然排空/旧槽restart=no与监督恢复。既有待核查任务保留，不自动重新提交收费抠图。生产当前仍为PSD试用版本71e54e07/镜像bc3a238d，部署完成后另记实际版本。
