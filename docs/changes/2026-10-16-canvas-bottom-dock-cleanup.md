# 画布底部重复图像创作入口清理

基线9c93ec9，独立codex/canvas-video-dock-20261016续改，不覆盖共享checkout。
仅删除canvas-main-toolbar内一处图像创作按钮；保留图片节点上下文工具条入口、图片创作Dock、添加菜单和视频Dock。
真实Next15/React19、1440/390隔离Edge验收底栏按钮消失、上下文按钮/Dock/添加菜单保持，pageerror0、供应商0；副本回退还原原hash与底栏按钮。详细记录output/canvas-bottom-dock-cleanup-20261016/VERIFICATION.txt。
本地完成后推独立分支，不合main、不发布、不SSH/锁/Worker操作。上传0457bd8增量保持，不复制整份canvas-client。
