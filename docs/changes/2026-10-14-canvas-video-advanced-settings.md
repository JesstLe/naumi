# 视频高级设置集中验收与模型菜单加载修复

当前完整矩阵逐条件复核为18/34项（约53%），注册29份证据。该数字是验收覆盖率，不是代码开发完成率或整个交付完成率。V06—V11本批补齐；上游完整实操对照、真实文字模型策略验证、完整分支复核、固定Linux候选与排空回滚、103正式发布仍待完成。

## 实际应用证据

`scripts/verify-video-fusion-advanced-settings.ts`顺序启动独立App/PG/Go Router/Chrome/Worker，供应商只接收隔离模拟请求，媒体为既有原创素材。没有改生产模型定义。

- V06：真实设置界面的时长/分辨率联动、640×360尺寸和seed=0入原生请求及任务冻结；不合法组合、单边尺寸、不支持精确尺寸的模型均在实际API拒绝且无任务/费用；换模型清除不支持的尺寸且完整描述保留。
- V07：声音false、水印false、seed=0、完整负面提示词实际发送；管理员send=omit字段不显示、不发送、不冻结。恢复默认/清空后请求中省略对应字段。
- V08：真实摄影设置编入完整原生提示词并冻结；跨项目复制保留摄影对象、不复制任务；刷新后禁用摄影，新的原生请求和冻结对象均移除摄影参数。
- V09：自动多镜头与自定义多镜头走不同原生字段；实际界面排序保持完整对白与2+2秒时长，错误总时长禁用生成。
- V10：真实界面角色元素加入图片/视频/音频，达到声明的3个引用上限停止新增；原生图片视频组、音频组和冻结引用完整。
- V11：沿用实际运动控制界面、换模型归一化与Worker完成证据，补核原生KIE/APIMart/TokenDance方向和清晰度映射；TokenDance字段在settings下。

首批`advanced-settings-d3b39555-c555-45c6-925a-75e8706196ea`完成V06后，复制测试错误使用targetProjectKey和201预期而失败；实际接口使用projectKey并返回200。修正测试，续批`advanced-settings-a217965c-408b-46e4-9361-27f39c007f3d`仅运行受影响的KIE两组，终态exit0。保留首次失败，未把续批单独冒充全量通过。

`verify-video-fusion-advanced-summary.mjs`核对两次原始记录及SHA、V06—V10全部明确条件与5次实际原生创建，结果`VIDEO_ADVANCED_SETTINGS_SUMMARY=PASS`。证据位于`output/canvas-video-fusion-20261013/checkpoint-d/advanced-settings-summary.json`。运动映射另见`protocol-coverage-audit.json`。请求尺寸的通过不代表模拟视频具备真实模型对应生成效果；付费视频调用0。

## 模型菜单加载时序

4b2ba13的Image gateway工作流38542613525终态失败在业务管理浏览器验收：目录先到达，账号与功能权限加载随后使页面重新挂载，已打开的模型选项消失。FeatureModelSelect现等待身份和功能权限均ready才启用菜单，避免用户在该阶段操作失效。

验收以route暂缓实际`/api/auth/session`请求，先证明目录出现但菜单禁用，再释放原请求并操作真实选项。没有伪造响应或删减原业务断言。本机实际App/Go Router/Chrome集中验收终态exit0，`business-ui-auth-ready.log`记录后台发布、原生Router应用、75积分报价、工具/画布目录、390px及非管理员404全部PASS，供应商调用0。新的远端CI终态还需核对，不能据本机通过改写旧CI失败结果。

完整TypeScript及git diff --check通过。当前仅本机开发和Git阶段整合；本批没有服务器连接、部署锁、103上线或维护计数增加。目标继续进行。
