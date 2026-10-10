# 前端仅显示后台开放的质量档位（2026-10-10）

用户指出后台未开放“超高”和“最高”，画布仍显示两个灰色不可选选项。原因是共享ImageQualityControl固定渲染CANVAS_QUALITIES/IMAGE_QUALITY_IDS，再按allowedQualities置灰；独立生图页也使用相同的五档固定列表。

两处均在渲染前按当前模型allowedQualities过滤。后台开放哪一档，前端才显示哪一档；共享组件覆盖画布生图/扩图/改字/标注及其他生图工具，独立生图页同步。开放档位保持后台显示名称、现有价格与排序；已有useImageQuality有效选中档位回退继续适用，缓存中的已关闭档不会成为提交参数。通用菜单的键盘、定位和加载时禁用行为保持，不更改参数映射、原生能力或积分配置。

已有隔离Next+PostgreSQL真实管理发布浏览器验证：开启五档/自定义最高名称→前端五档且max报价/请求一致，关闭超高后隐藏并拒绝报价，再关闭最高后画布和生图页仅三档、缓存max回退，保留原草稿/售价并恢复原配置；真实供应调用0。菜单定位/键盘回归、TypeScript和diff检查通过。

已合入main并发布新机120.27.162.85，业务源码ba84ea3e7c6d05b797338cc0de55427df8aeaaca，APP/Worker固定镜像同SHA，Image ID sha256:152de000953f139c39808182d41a966ecd656f33cbf42f9ab1f8c4612831ff8b，实际版号1791610783 / v2026.10.10-133943。线上真实目录与浏览器验证GPT-Image-2.5五档、Nano Banana Pro和Nano Banana 2各三档，生图页及画布只显示配置允许项、所有可见质量项可选，手机通过。页面测试只拦截节点偏好保存，不写业务数据或提交生成。

模型v98、计费v8、整个配置/所有草稿及元数据库/修订/采购价格完整指纹与发布前相同。完整DB/env/Compose备份、固定95ac9306a516e61e96f5ca26636c6a4421e2fa01回滚及证据 /opt/naumi-staging/evidence/quality-options-visibility-20261010。无数据库Schema或配置迁移，DB/媒体/Compose/其他env/代理保持；最终健康、APP/Worker镜像和实际版本通过，持续deploy.lock验收后释放、临时会话清理。旧机未连接，原SSH私钥保持；文档跟进不另发业务镜像。
