# PR8 Verify：视频描述 contenteditable 回归断言

## 原始失败与输入

通知对应2bd54020 / Verify41615992878 / job125849458370；当前基线294761d8b1699530474e6d24509b21af2ba97e1b。原16项billing UI在视频工作台及Canvas视频重试最后提示词断言失败：14PASS/2FAIL，`toHaveValue` 报Not an input element。

两入口均经过VideoSettingsFields→VideoPromptEditor→InlineReferenceEditor，真实控件是div role=textbox/contenteditable，不是input/textarea。CI在最终检查前已经完成原请求身份/上传/冻结参数断言，但日志本身只证明断言类型不匹配；本轮在实际本地production-mode Next build和自有PG中再现两个相同失败，截图确认提示词仍可见。

## 最小测试修复与职责

产品源码0改动；`scripts/billing-ui.spec.ts`仅修改两个contenteditable提示词保留断言：原label locator保持，显式要求role=textbox、contenteditable=true，并用textContent的精确poll匹配原字符串，不用默认空白归一。工作台另加提交payload.prompt精确等于原提示词。

原两次attempt完整deepEqual、上传/注册各1次、idempotencyKey、billing原价/模型、orderedInputs源素材、零confirmation和原30秒case/5秒expect预算全部保留。没有将其改成检查非空，没有恢复textarea或绕过editor owner。

## 验收层级与四产物

本轮复用同一实际本地优化Next构建做前后比较；build exit0且完整type/lint检查执行，但Windows traced node_modules symlink有EPERM warning，原日志保留。实际app已启动、原失败已复现；不把它当作自包含Linux生产镜像或部署证明。业务PG为自有fixture，video失败/quote/upload为明确本地HTTP fixtures；无收费供应商调用。

全部command/input/literal stdout/stderr/exit、截图、JSON runner报告及四产物归 `output/pr8-video-prompt-assertion-20261103/`。独立源码副本baseline/modified/rollback以相同实际build重现2FAIL→2PASS→2FAIL，修改版另跑原完整16项。具体最终结果见VERIFICATION.txt/DELIVERY.json。

整体重构ACTIVE，新头CI独立验收，未合main/未部署、47 HOLD；原restore反例证据和产品合同保持。

## 最终本地集中结果

- 相同构建/相同产品源：baseline精确2FAIL，均Not an input element；截图显示原提示词仍在。
- 修改版原完整billing UI单次16/16PASS，33.5秒；新workbench payload.prompt精确匹配。原beforeEach真实权限/账务版本重置、PG发布/恢复断言全部执行。
- spec lint exit0 / diff-check exit0；src/services产品逐hash与294基线一致，未扩预算。
- full local Next build exit0，含类型/lint阶段；Windows tracing symlink warning原样保留。浏览器actual app前后可运行，不宣称产物可直接部署或Linux镜像完整。
