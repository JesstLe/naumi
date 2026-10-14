# 原生协议错误及字段覆盖审计

新增集中错误模块 session80774 exit0：`checkpoint-d/protocol-failures-4cc066b4-420d-46f5-ab98-c1ee49ed26cf/result.json`。15 种原生错误响应经过实际 App/PG/Router/Worker，覆盖 OpenAI兼容、Ark、KIE、APIMart、Gemini、MiniMax/METASO、TokenDance 的 Ark/Kling/Wan/MiniMax 响应类、tfRouter 和 Compshare/H3/Vidu/Wan。

每项实际提交后收到供应商失败状态，最终 failed、错误可读取、没有视频地址或结果落库，积分恢复到提交前。原请求重放返回同一任务，Worker tick 和 App 重启后没有新的供应商创建或积分变化；另一个账号读取为 404。创建和轮询记录按 profile 保存。此处模拟原生供应商错误，不代表真实供应商故障率或效果，真实视频 API 消费为 0。

模拟 Gemini 供应商此前无论 rejected 状态都会走正常 operation 完成响应，不能用于失败验收。按现有 Gemini codec 支持的 `done:true/error` 结构修正 fixture，仅改变拒绝场景，正常成功响应保持。没有修改产品协议来迎合测试。

随后离线核对已有 51 个成功应用案例、41 个原生 profile 的实际创建记录，不重复运行已通过的成功链。`verify-video-fusion-protocol-coverage.mjs` 核对批准案例、profile 内完整案例顺序和数量、原生路径和 wire 模型，以及适用的分镜全文/秒数、元素分组、角色朝向、图片内联、首尾、混合音频、扩展和口型、seed=0/false 字段。初次运动控制审计把 TokenDance 朝向路径写在顶层，实际字段和源码均在 settings；修正独立审计路径后通过，未改产品代码。

```text
node scripts/verify-video-fusion-protocol-coverage.mjs --failures=protocol-failures-4cc066b4-420d-46f5-ab98-c1ee49ed26cf
```

结果 `checkpoint-d/protocol-coverage-audit.json` 为 7 组通过：P01/P02/P03/P04/P06/P07/P08。完整成功应用证据继续验证产物 SHA/探测、私有媒体权限及幂等结算；错误模块按共享原生响应类覆盖，不冒充所有 41 个 profile 各自重新运行了失败案例。P05 的工作流映射/取消/所有产物仍单独审核。

结合此前 V01—V05，本轮覆盖清单已逐条件审核 12/34。其余条件、固定上游完整实操、三尺寸保护、整分支复核、固定 Linux runtime/兼容回滚、103 上线和交接仍待完成，不宣称全部目标已完成。

dab963b 的 Docker CI38536867934 成功；Image CI38536867891 的 billing15浏览器验收在 Linux 通过，后续 business UI 在旧 garment HTML select 断言失败。修正为当前执行模型 combobox/listbox，保留唯一公开模型名称、价格恢复、目录不泄露 wire ID、文字模型、390px、非管理员拒绝和真实 Go Router 应用断言；本地 business UI session28258 exit0。新固定 Linux CI 需在推送后验证，旧失败不改写为成功。
