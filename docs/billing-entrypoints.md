# 现行计费入口基线

本次基线为 e75846c。质量价格 low/medium/high/xhigh/max/auto=4/6/10/14/18/6；分辨率附加价 1K/2K/4K/5K=0/2/6/10。以下以接口实际调用为准，不以旧常量注释推断。

| 功能 | 路径（src/app/api 下） | 现行报价/收费 |
| --- | --- | --- |
| image.generate | generate-image | 质量×实际成功张数+逐张分辨率附加；BYOK 平台收费0；创建冻结成本 |
| image.suite | suite | 默认13张或请求指定张数；质量报价，实际成功收费 |
| image.aplus | aplus | 模块数量×质量价；审核后预占，按成功模块收费，母图阶段按原流程 |
| tool.cutout/upscale/ipcheck/printfile | 同名接口 | 固定1/1/1/0，先预占后结算 |
| tool.garment/avatar/dewrinkle/dewatermark/style/tryon | 同名接口 | imageQualityCost，以质量计价 |
| tool.retouch/recolor/replicate/inpaint/extract | 同名接口 | imageQualityCost，需保留各接口有效分辨率和自定义尺寸映射 |
| tool.garment3d/packaging3d | 同名接口 | 实际 imageQualityCost，旧 GARMENT3D_COST 9/18/24 不代表当前实扣 |
| canvas.image | canvas/image-tasks | 持久化，创建预占，完成同事务写作品和消费 |
| canvas.expand/text-edit/annotate | canvas 下同名接口 | 图片质量/分辨率报价 |
| competitor.action | competitors/[id]/action | 报价预占；租约、作品和计费保持原事务 |
| video.generate | video/tasks、video/generate | VIDEO_TASK_COST 有效正整数或20；持久化创建，稳定流水 led-video-id |

积分批次购买有效期2个日历年、注册赠送默认30积分/30天；先到期先扣，然后按创建时间。预占占用 credits_used，消费扣批次和写负流水，释放预占不是支付退款。旧图片任务计费状态已冻结；旧视频/画布结算时会重新查开关，兼容路径需保留。

其他金额链路：6个积分包见 scripts/fixtures/billing-baseline.json；signup_bonus_credits、credits_metering、pay_enabled 为旧配置。高质量充值门槛99900分；Agent 大额确认门槛20积分。充值总入口目前关闭，旧 plan/pro 商品只展示或处理历史权益，不恢复销售。

付款回调用订单记录中的金额和积分，fulfillOrder 已有锁与幂等。兑换码领取和到账当前分两步，迁移为同事务。BI 管理账务有自己的 operation/log 和稳定 led-bi-id，必须保留其审计和用户保护规则。
