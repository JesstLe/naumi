"""Story-level curation. Complete works are counted once, never by shot/frame."""
from collect_public_cases import DATA, OUT, SHEETS, dump, read, file_sha

STORIES = {
"pc-story-pepper-carrot-03": {
    "title": "小女巫与猫 03：秘密原料", "category": "漫剧动画", "narrativeForm": "漫画改编动态漫 / motion comic",
    "scene": "小女巫与橘猫在热闹魔法市集得知药水比赛消息，穿过雨云、密林和火山寻找稀有原料，最后揭晓这些原料只是为了泡一杯能让她熬夜备赛的咖啡",
    "beats": ["市集开场：原料价格让主角犹豫，竞争者大手笔采购形成对比。", "目标出现：明日比赛与奖金海报建立时间压力。", "连续冒险：云、密林、火山和奇兽分别成为取材关卡。", "误导观众：精致操作看起来像在制作决胜药水。", "反转收束：成品其实是咖啡，真正比赛留待下一集。"],
    "dialogue": ["Carrot! Get ready, we'll hunt the ingredients together.", "Best... Coffee... Ever!"],
    "comic": "https://www.peppercarrot.com/en/webcomic/ep03_The-secret-ingredients.html",
    "shots": ["手绘水彩魔法市集全景，戴大帽子的年轻女巫与橘猫走入画面，暖色阳光，缓慢推镜。", "女巫看向比赛海报，切到她坚定的表情；人物造型和服装与首镜一致。", "女巫与橘猫依次采集云雾、森林果实与火山蛋壳，以三段短蒙太奇表现冒险，色彩连续。", "木桌近景，女巫把神秘原料放入器皿，蒸汽升起，镜头收紧制造悬念。", "咖啡杯特写后拉回女巫满足的表情，橘猫在旁，保留反转后的短暂停顿。"]},
"pc-story-pepper-carrot-04": {
    "title": "小女巫与猫 04：灵光药水", "category": "漫剧动画", "narrativeForm": "漫画改编动态漫 / motion comic",
    "scene": "比赛前夜的小女巫制成灵感药水，四处寻找橘猫测试，猫饮下后尝试书写字母，女巫误解信息后离开，结尾用猫的行为揭晓笑点",
    "beats": ["深夜实验室与时钟建立比赛前夜的紧迫感。", "主角寻找躲藏的猫，通过猫粮声诱它出现。", "发光药水成为核心道具，以反应镜头表现效果。", "猫写出字母，主角连番猜测，观众比角色更接近答案。", "误解后离开，最后一个动作补足笑点并结束本集。"],
    "dialogue": ["The potion of Genius.", "You... You write?", "What else can this mean?"],
    "comic": "https://www.peppercarrot.com/en/webcomic/ep04_Stroke-of-genius.html",
    "shots": ["水彩手绘深夜木屋实验室，时钟与魔法器具近景，蓝色窗光和烛光形成对比。", "同一位戴大帽子的女巫在床边寻找橘猫，用食物声引出猫，保持角色外观一致。", "蓝色药水瓶近景，切女巫期待表情与橘猫反应，短停顿后进入动作。", "橘猫用白色笔在木板上写出一个简单字母，镜头在字母和女巫困惑表情之间切换。", "女巫转身离开，猫完成最后动作揭示笑点，空镜保留一秒后收束。"]},
"pc-story-pepper-carrot-06": {
    "title": "小女巫与猫 06：药水大赛", "category": "漫剧动画", "narrativeForm": "漫画改编动态漫 / motion comic",
    "scene": "小女巫睡过头后被橘猫送往空中城市，四位女巫在广场展示药水，连续效果叠加把小鸟变成巨兽，主角用一个意外道具吓退巨兽并赢得比赛",
    "beats": ["空中醒来的主角与猫，迅速交代迟到和赶场目标。", "广场主持人与四位参赛者登场，建立角色差异和观众期待。", "连续三轮药水效果升级，前一轮效果保留并叠加。", "巨鸟失控成为全城危机，其他角色逃离，主角被迫应对。", "以不起眼瓶子吓退巨鸟，赢得奖金后揭示瓶中并非神奇药水的喜剧反转。"],
    "dialogue": ["As Mayor of Komona, I declare the potion contest... Open!", "Wanna try one last potion?"],
    "comic": "https://www.peppercarrot.com/en/webcomic/ep06_The-Potion-contest.html",
    "shots": ["手绘奇幻空中城市远景，年轻女巫与橘猫乘坐飞行生物赶往广场，暖色云海。", "广场全景切主持人近景，再逐一给四位服装和配色不同的参赛女巫中景，保持统一水彩风格。", "三位参赛者依次在同一只小鸟身上展示不同药水效果，逐步升级并保留前一轮变化。", "巨大彩色鸟从广场抬头，人群分散逃离，交叉剪辑主角观察与巨兽压迫感。", "主角举起不起眼小瓶面对巨鸟，巨鸟退走，领奖后揭示瓶子用途，表情停顿形成尾梗。"]},
"pc-story-big-buck-bunny": {
    "title": "大雄兔：森林恶作剧", "category": "叙事动画短片", "narrativeForm": "完整3D动画短片，非AI生成",
    "scene": "温柔的大兔子在明亮森林中被几只顽皮小动物捉弄，忍耐到转折后布置机关，最终以反转动作让恶作剧者自食其果",
    "beats": ["树洞与晴朗草地建立温柔主角。", "顽皮动物用连续小动作制造冲突。", "蝴蝶事件让主角态度改变。", "机关准备与对手行动交叉剪辑，形成期待。", "机关兑现与最后一个表情收尾。"], "dialogue": [],
    "shots": ["明亮三维森林，圆润白兔从树洞出来，镜头平稳展示角色体型和环境。", "三只小动物在树旁互相示意，用动作和反应镜头构成恶作剧节奏。", "蝴蝶近景切白兔表情，短暂停顿明确情绪转折。", "白兔准备绳索与树枝机关，交叉剪辑对手走近，保持地理方向清楚。", "机关触发，用远景交代动作结果，再以主角表情和宁静环境结束。"]},
"pc-story-sintel": {
    "title": "辛特尔：寻找幼龙", "category": "叙事动画短片", "narrativeForm": "完整3D动画短片，非AI生成",
    "scene": "旅人在街头救助受伤幼龙，幼龙被带走后她跨越荒野与雪地寻找，在洞穴对峙中得到关于时间与误认的悲剧性真相",
    "beats": ["危机中的旅人开场，问题引出回忆。", "幼龙救助与共同生活建立情感关系。", "分别与漫长寻找通过地点蒙太奇推进。", "洞穴对峙把寻找转成误认的高潮。", "时间线索揭晓后，新的幼龙接续情感余波。"], "dialogue": [],
    "shots": ["写实三维荒野旅人近景，风雪与疲惫衣物，低饱和电影光。", "回忆中的石城小巷，女旅人发现受伤幼龙，手部与眼神特写建立联系。", "保持人物装备和幼龙特征一致，以山地、雪原和荒漠短镜头表现漫长寻找。", "昏暗洞穴中旅人与成年龙对峙，反打保留空间关系，动作前加入识别线索。", "以镜面或倒影揭示时间流逝，镜头停留在人物反应，再转向新的幼龙。"]},
"pc-story-tears-of-steel": {
    "title": "钢铁之泪：记忆与和解", "category": "真人叙事短片", "narrativeForm": "完整真人科幻短片＋CG特效，非AI生成",
    "scene": "未来城市中的团队尝试重建一段过去的感情场景，人物关于身体与关系的冲突与机器人危机交叉呈现，最后以记忆对话推动危机解决",
    "beats": ["未来危机场景建立团队任务。", "过去的桥边对话引出人物关系与机械身体冲突。", "团队搭建记忆重演装置，现实与回忆交叉剪辑。", "重演失控让人物直面原始误解。", "关键对话改变对抗关系，危机与情感线共同收束。"], "dialogue": [],
    "shots": ["真实城市运河旁的未来废墟，人物团队检查全息装置，实拍质感与CG光源一致。", "暖色回忆中一对人物在桥边对话，机械手臂细节与眼神反打建立冲突。", "团队在实验室重建街景和人物记忆，设备近景与操作反应交叉剪辑。", "机械危机逼近，保持同一人物外观与场景方位，用中近景反打推进情绪。", "关键人物完成和解式对话，机器动作放缓，最后以环境远景与人物反应收束。"]},
}


def main():
    decisions = read(DATA / "editorial-decisions.json")
    processed = read(OUT / "processed.json")
    for c in processed:
        if c["id"] not in STORIES or c.get("mediaStatus") != "verified":
            continue
        note = STORIES[c["id"]]
        page = c["id"] + "-story.jpg"
        prompt = "制作原创叙事短片的分镜方案：" + note["scene"] + "。先固定角色设定、服装、道具与场景，按「建立—目标—升级—转折—收束」拆成独立镜头；逐镜生成并剪辑，使用单独录制或获授权的对白与音乐，不把整集当作一次短视频生成任务。"
        decisions[c["id"]] = {"decision": "accept", "title": note["title"], "category": note["category"], "tags": [note["category"], "完整故事", "角色一致性", "分镜", "反转"],
            "prompt": prompt, "steps": ["先写一句话梗概与角色目标，确定冲突、转折和结尾；参考完整原片的叙事节奏，不逐帧照抄。", "输出角色设定表、场景表和5段分镜，为每个镜头记录景别、运动、动作起止与对白。", "分别生成关键帧和短镜头，检查角色、衣着、道具、视线和运动方向连续。", "后期剪辑、配音、字幕与声音设计；保留原片署名，改编素材按对应 CC 许可处理。"],
            "storyBeats": note["beats"], "shotPrompts": note["shots"], "narrativeForm": note["narrativeForm"],
            "originalComicDialogueExcerpts": note["dialogue"], "dialogueProvenance": "verbatim-original-comic-transcript-not-audio-transcription" if note["dialogue"] else "no-dialogue-transcription-claimed",
            "originalComicSource": note.get("comic"), "promptUse": "multi-shot storyboard adaptation, not tested reproduction",
            "editorialReview": {"method": "opened-15-frame-multi-scene-story-sheet", "sheet": page, "sheetSha256": file_sha(SHEETS / page), "result": "accepted-full-narrative-work"},
            "audioPolicy": "Original audio retained; full credits retained", "redistributionObligations": "Keep author, source, license, change notice and full credits; distribute adapted media under CC-BY-SA-4.0." if c["sourceKey"] == "pepper-carrot" else "Keep author, source, CC-BY-3.0 license, change notice and full credits."}
    dump(DATA / "editorial-decisions.json", decisions)
    print("NARRATIVE_ACCEPT", sum(x.get("decision") == "accept" and k.startswith("pc-story-") for k, x in decisions.items()))


if __name__ == "__main__":
    main()
