# R6G：系统配置面板与共享会话提交边界

基线`2ba3cf5abf375c76e4912bb8538bb87be98e2c04`，4495原文件哈希及完整原字节归档，独立重构分支，main同步后第1模块。

## 实施

- 系统配置1971行剩余字段、加密提交和所有UI仍混在一起；提取接口、登录支付、品牌/页面、账号积分四个真实面板，主组件保留鉴权gate/导航/组合，不建立全字段mega-hook或第二套设置store。
- 共享`useSettingsSession`只持有原鉴权结果、安全视图和共同提交生命周期。原RSA-OAEP4096/SHA256、400字节UTF8分块及HTTP既有两字段fallback移至原字节credentials helper；API与数据库不改。
- 面板保持挂载但未激活时返回原空分支，草稿不因切分区丢失，不加hidden包装改变DOM；安全快照按具体字段变更同步，不再每次品牌保存把未保存微信/SMTP字段清回去。
- 共享mutation承接原Settings、owner-account、SMTP测试、Logo上传和账号积分动作，保留实际payload、header、成功清空指定密码、不自动重发。原密钥准备尚未提交时管理会话变化，旧异步continuation不得再POST；已提交的POST不取消/重放。
- 实际源码确认GET额外返回modelConfigurationActive，而POST安全视图没有该字段；共享视图合并原mode标识，避免托管Replicate保存后误露legacy表单。鉴权重新验证403后隐藏原面板与草稿，不保留旧isAdmin显示。
- 复用已有完整AdminSettings浏览器fixture入口，提至scripts/verification供用量/设置两项验收共用。session/Next导航/非目标子面板/图片明确fixture；目标完整React和真实WebCrypto不替换。

## 验收进度

首轮完整旧55/新57检查、15组HTML精确相同，真实浏览器RSA加密→Node私钥解密，短key/长UTF8证书、SMTP/站长/品牌Logo/页面/原积分payload一致；跨区草稿旧RESET→新RETAINED，旧会话加密续提交旧POST→新NO_POST。加强真实POST不含mode/鉴权撤销及真实PG入口后集中封版。首个baseline尝试placeholder非exact命中SMTP用户名与发件人两元素，仅修harness selector，原失败保留。最初tsc发现SMTP测试提取漏保留prompt变量，已恢复原prompt及成功文案，原失败保留。

四产物、全源码绑定/core、相邻用量回归/类型/结构、独立副本回滚和Git以`output/refactor-r6g-20261027/DELIVERY.json`为准。整体active，不合main、不部署。后续大型model-management/测试资产、依赖与长时混合负载及最终完整版本整合继续。


## 集中运行已观察结果

- 加强后的完整旧57/新59浏览器检查、15组HTML精确相同；七类凭据使用实际浏览器RSA4096并由Node逐块解密，长UTF8字节精确。旧POST不带mode时托管面板退到legacy、重新鉴权失败仍显示旧配置均已复现，新版保持托管/隐藏撤销后的页面。
- 真正原pubkey/settings两个HTTP handler + PG + 原client encrypt helper36检查通过，六次公钥请求、RSA长字段与AES落库逐字节一致、safe view不含原始秘密、匿名/跨来源拒绝、空页面清除与空SMTP密码不改保持；EXTERNAL_HTTP/SUPPLIER均0。server源码未改。
- 原用量完整基线30/新版31、7组HTML精确相同（MODE=MODIFIED是原兼容检查模式，source-root明确完整R6G基线），原迟到详情/原动作/权限继续通过。
- 全项目tsc、9个新/改TS文件lint空输出exit0；原encryptKey/pemToDer/hasSubtle三个函数正文、ReadyBadge、导航策略精确文本保持；主组件1971→201行、只留3个导航state hooks。
- 加入原core runner两入口：admin-settings静态实际目标编译/RSA字节验证，以及实际PG合同；完整浏览器单列，不将静态PASS称浏览器验收。最终固定SHA core27与产物在封版时登记。
