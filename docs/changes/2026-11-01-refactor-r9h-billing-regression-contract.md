# R9H：账务整模块回归与现行合同

## 模块与职责

本轮继续最终整合，不叠加产品模块。基线5adb9415的5347个文件已按原始字节归档。上轮Image远端完整构建已实际PASS，后续Configurable billing and transactional regressions首次到达并FAIL；Core同轮仍在运行。部署0、47HOLD、整体ACTIVE。

账务回归驱动拥有夹具准备、原始子进程输出和现行业务合同；产品模块继续拥有服务端冻结报价、真实余额、身份归属、幂等结算和UNKNOWN。不能为旧确认断言恢复重复积分确认，也不能只删除失败测试。

## 已观察证据

- 新Image run41271729775的实际job表明Build full application通过，账务整模块失败，其余后续步骤未运行。
- 该run原始job日志下载仍TLS EOF，记录保留；没有把本地结果冒充已读到的远端内部栈。
- 本地原始18项顺序runner使用独立真实PG，前四项价格基线、动态规则、配置并发、钱包事务PASS，第五项verify-billing-api.ts实际503而旧预期200。原exit1及cleanup保留。

## 当前实现与验证

先增强失败响应诊断，核对其实际原因；随后按真实模型配置、报价与原operation合同修复确定问题，集中验证整个账务模块。旧源码和失败材料不改写。最终对照、回滚、源码及新head远端状态以本轮VERIFICATION/DELIVERY为准。

## 已复现的边界与候选修正

1. API夹具只有管理员cookie，没有创建报价所属的app_users行；真实quote函数通过，真实保存函数报23503/owner外键。现用既有billing fixture创建真实普通账号，用原生cookie请求公开报价，管理员cookie只测管理接口；核对不泄露私有成本、opaque报价归属与配置发布后原报价不变。没有改产品外键、错误净化或账号校验。
2. 原图任务测试把两次串行请求都挡在同一barrier前，等待第二次再释放，实际只能到达一次。候选等待首个实际请求、改价、以同operation取原回执，再释放原请求并核对原两次n=1及部分交付单次结算；不调大原20秒等待。
3. tools与canvas-extra旧断言要求缺浏览器积分回显返回409；候选改为正常受理、真实服务端价、相同operation回执/一次账本/供应商无重放，原拒绝与UNKNOWN不重提、余额、SSE和留存结果核对继续保留。
4. Agent旧断言要求跨轮“再说确认”及current变价阻断；候选验证服务器报价直接准备、同call身份稳定、原计划不被改写、新call按新价格、40次不累计待确认、真实余额不足与零供应商请求。
5. coverage扫描了video/service与db兼容门面。候选跟随creation、submission与accounts/administration实际owner，同时保留兼容re-export核对，其他功能映射、价格与禁止旧常量扫描不删。

上述原先未到达的13项在冻结5adb原始源码、各自独立真实PG数据库中一次诊断全部执行，5项FAIL/8项PASS；这不是18项顺序gate通过，也不把独立结果拼成通过。原始顺序gate仍是前4PASS、API FAIL、13未到达。

现有18项runner保留顺序、命令、fail-fast与原退出码，新增逐case原始stdout/stderr、hash、实际退出和未到达记录；失败只读注释与always artifact归原Image工作流。不新建任务/执行框架，不忽略失败或删业务测试。

## 集中执行结果

修改版首次完整gate前6项通过，tools的tryon在结算前返回合法OPERATION_PENDING；该次FAIL保留。测试没有强迫在途任务变成已完成，而是沿原20秒结算等待之后检查原回执及无重放。随后四个定向用例真实PG通过，诊断报告仍是PARTIAL/exit2；最终原顺序18项单次完整PASS、0FAIL、0未到达、exit0。原部分上游400是测试注入，交付一张/扣10/其余释放按原断言核对，并未删除错误分支。

## Core 历史输入依赖

同轮Core实际在admin-member-history-pg失败，执行源48d532a1是GitHub PR merge对象；原脚本向浅checkout索取cb1d2f4的历史文件，Git exit128。本地真实无历史对象Git副本及真实PG已复现完全相同的缺文件错误。

该历史账号schema现以原Git blob完整9325字节存入普通fixture，sha256=d36b129d7a64420ba2b3c657196caabffee314c754dc88d25cfaf354794d8c8a，原提交/路径存元数据并在运行前校验；.gitattributes禁止转换其原始字节。原业务断言不删，在同一个无历史Git对象cwd下，实际API/PG原19检查PASS、供应商0。不是用手写旧schema代替旧实现。

目录还存在有意比较祖先版本的request-workflow等用例；两项历史ref均已核对为当前HEAD祖先。Core checkout显式fetch-depth=0提供这项真实测试依赖，不提高业务超时、预算或跳过断言。仓库完整历史与本案例的独立fixture职责分开：前者支持全目录版本对照，后者使该账号回归自身不再依赖运行机器的Git对象库。

本轮产品源码继续0变更。全项目类型、原始fixture负例、更新后的runner合同及副本回滚收尾后，才固定源码推送；新head整版CI和最终main合入仍独立验收，不借旧216通过替代。

全项目非增量TypeScript已exit0；最终runner为20场景360检查，原业务18项PASS独立于fixture driver合同的0/7结果。历史原19组业务检查/55条assert完整保留，新增原字节checksum一条；篡改自有副本时child exit1，发生在PG构造前。原源码Git blob、9,325字节、SHA与断言桥接均在本轮证据中核对。
