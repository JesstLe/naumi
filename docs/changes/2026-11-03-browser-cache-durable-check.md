# 来源 B 缓存刷新验收：等待器修正

## 结论与基线

产品基线 `be466fc5effdbc649e27373fe22cd7612bbdc02d`；对照未修改 `af877f15`。上一批保留的效率套件12/13失败，本轮已确认是验收等待器提前返回，不是已落盘记录被产品删除。

## 因果证据

旧测试用 `page.waitForFunction(async () => IDB事务结果)`。当前已安装Playwright对谓词直接返回值做真值判断，Promise对象立即为真；最终解析为false仍完成wait。

真实Edge最小反例：没有安装fake clock，`async()=>false`约25ms返回handle(false)，同步`()=>false`按400ms超时。

真实IndexedDB只读插桩：B素材读取149ms完成，存储探测150ms得到images=false/metadata=false，但wait151ms完成、152ms就刷新。B原本延后16ms批量写入，刷新之前未执行B put，也没有B delete/purge。旧测试实际上测到“异步缓存未提交便关页”，这与产品现有非阻塞写盘合同一致。

## 最小修改与职责

仅 `scripts/verify-browser-cache-efficiency.cjs`：导入expect，改为 `expect.poll(()=>page.evaluate(async IDB事务检查)).toBe(true)`。等待真实异步布尔结果，保留原fake clock、真实事务、三次reload、`media===1`、每轮新授权及实际像素decode断言。

没有修改缓存产品、容量、写盘策略或网络行为，不添加固定sleep，不放宽成功标准。

## 验证

- 原等待器：13项中来源B持久化检查失败，process exit2，原失败证据保留。
- 修正等待器＋未修改产品：原13项全部PASS，exit0。
- 修正等待器＋当前产品：原13项全部PASS，exit0。
- 定向时间线确认B的put成功/事务完成/读取true均在刷新之前；三次reload媒体总1、授权总5。

证据根：`output/cache-reload-20261103/`。独立诊断在 `agent-diagnosis/REPORT.md`、`trace-r1/TRACE.json`、`fixed-current/TRACE.json`；集中13项在 `baseline-product-corrected-test/`、`modified-suite/`。

本轮只消除这一已证测试缺陷，不把它当用户线上卡顿根因。图片离屏驻留另作独立模块，不以测试变绿冒充全站上线；未SSH、未发布、供应商调用0。
