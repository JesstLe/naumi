# R6K：固定依赖与实际运行兼容

基线 `ec0f37c9392a437c9e058e79ea746a044ccd143b`，4541原文件hash与归档位于 `output/refactor-r6k-20261027/`。独立工作区依赖目录为本地普通目录，未改其他工作树依赖或发布现场。

## 实施

- 根据实际registry/audit，固定Next15.5.28、MCP SDK1.32.0、Nodemailer10.1.4、Sharp0.35.5、Zod4.6.6；eslint-config-next同步15.5.28，PostCSS8.5.23。
- Next仍精确要求旧PostCSS8.4.31，使用单个明确override引用本项目同一PostCSS8.x版本；不升级Next大版本，不执行auditfix --force。
- 在独立候选目录用原lock解析，定向刷新兼容范围内的body-parser/proxy-addr/fast-uri/hono/ip-address/nanoid/source-map-js。53个lock节点改变，其中包含Sharp跨平台原生包。
- 独立原依赖目录由原package/lock安装，旧新均运行同一份实际imagegen postprocess、mailer和MCP stdio宿主；语义及协议对照，外部供应商/真实邮件0。
- Next15.5.28仍未await body.finalize，已有CJS/ESM补丁核对相同调用点后扩大明确支持版本；不移除原多图请求体修复。

## 进度

候选生产依赖audit已从13→0、exit0；不等于运行验证或线上已升级。完整模块后集中执行原行为/PG/core、完整Linux镜像与同镜像Web/Worker链。原失败和完整命令在output保留，四产物/回滚/Git在封版登记。整体active，不合main、不部署；本轮同步后第2模块。

## 必要兼容调整

Sharp0.35改为明确ESM default构造器类型，18个原动态加载点只改类型声明，运行表达式保持。Node24新类型需要TS5.9及@types/node24，同实际Node24运行时对齐；由此显式区分SharedArrayBuffer与DOM ArrayBuffer。浏览器hash、Agent素材和ZIP使用一个零拷贝webBytes边界（仅共享底层才复制），缓存chunk数组及chroma变量仅补精确类型；测试fixture的File/Blob/Request输入改为显式字节视图，没有用any/关闭检查。

第一次类型检查保留原Sharp namespace/默认导出错误，第二次保留TypedArray/DOM差异，后续按真实字段修正。既有Next专项harness不再硬写15.5.27，改记录实际安装版本。全量开发依赖audit原还5项，定向兼容刷新后当前完整lock审计total0；不把这一点当作所有可达安全风险关闭。
