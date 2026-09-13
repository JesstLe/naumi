// Template seed library.
// The hosted service ships a large curated third-party prompt library that is
// NOT redistributable, so the open-source package starts empty. Add your own
// templates in the admin panel (/admin → 模板管理), or seed them here.
//
// Naumi 实例模板库:
//   naumi-*    = 自研模板(12 个):保健品电商主题为主,封面即真实出图,prompt 为实测提示词。
//   tpl-ext-*  = 外部吸收(25 个):github.com/newaiproxy/aidianshanggongju 电商提示词大全,
//                封面为该仓库公开示例图,tags 标注来源。
//   tpl-gpt2-* = 外部吸收(gpt-image-2-prompts 精选库):电商相关分类(产品视觉/包装/海报/
//                摄影写实/人像/信息图/文字渲染/3D场景),来源 github.com/peterRooo/
//                awesome-gpt-image-2-prompts(公开整理项目),tags 标注分类与语言。
import type { PromptTemplate } from "./mock-data";

export const TEMPLATES: PromptTemplate[] = [
  {
    id: "naumi-hb-hero-daily",
    title: "保健品主图 · 每日一瓶活力在线",
    category: "主图",
    industry: "保健品",
    description: "浅暖高级布景 + 橙子点缀 + 中文大标题,亚马逊/独立站通用的高转化保健品主图。",
    prompt: "保健品电商主图:一瓶乳白色保健品补充剂塑料瓶带金色瓶盖,浅橙色简约标签,居中,浅暖色高级背景,新鲜橙子切片点缀,上方留白排出中文标题『每日一瓶 活力在线』,专业商业产品摄影,可直接上架。商品以用户上传图为准,标题文案可按产品替换。",
    tags: ["保健品", "主图", "中文标题", "橙子"],
    image: "/demos/suite-demo/suppl-main.png",
    gradient: "from-amber-100 to-orange-100",
    popular: true,
    homepageFeatured: true,
  },
  {
    id: "naumi-hb-white-bg",
    title: "保健品白底图 · 标准SKU",
    category: "白底图",
    industry: "保健品",
    description: "纯白背景居中构图,柔和影棚光,平台审核友好的标准 SKU 图。",
    prompt: "一张白底商品图:保健品补充剂塑料瓶(以用户上传商品为准),金色瓶盖,浅橙色简约标签,纯白背景,产品居中,柔和影棚光,完整保留瓶身标签文字与外观。",
    tags: ["保健品", "白底图", "SKU"],
    image: "/demos/suite-demo/suppl-src.png",
    gradient: "from-slate-100 to-slate-200",
    popular: true,
  },
  {
    id: "naumi-hb-selling",
    title: "保健品卖点图 · 标注卡排版",
    category: "卖点图",
    industry: "保健品",
    description: "产品居中偏左 + 右侧卖点标注卡,成分/功效一目了然。",
    prompt: "电商卖点展示图:参考图中的保健品瓶居中偏左,右侧上下排列两个简洁卖点标注卡片(按产品替换为真实卖点,如『天然萃取』『0蔗糖配方』),浅暖灰高级背景,细线引导指向瓶身,电商详情页风格,中文排版清晰无错别字。",
    tags: ["保健品", "卖点", "详情页"],
    image: "/demos/suite-demo/suppl-selling.png",
    gradient: "from-amber-100 to-orange-100",
    popular: true,
  },
  {
    id: "naumi-hb-detail",
    title: "保健品细节图 · 瓶盖微距",
    category: "细节图",
    industry: "保健品",
    description: "瓶盖旋开微距特写,软糖/胶囊散落,突出密封与品质感。",
    prompt: "电商细节特写图:参考图保健品的金色瓶盖旋开微距特写,几粒软糖散落旁边,质感细腻,浅色背景,画面角落配小字标注『独立密封 品质可控』,商业产品摄影。",
    tags: ["保健品", "细节", "特写"],
    image: "/demos/suite-demo/suppl-detail.png",
    gradient: "from-orange-100 to-amber-100",
  },
  {
    id: "naumi-hb-spec",
    title: "保健品规格图 · 参数标注",
    category: "规格图",
    industry: "保健品",
    description: "瓶身正面居中 + 细线尺寸/含量标注,极简合规。",
    prompt: "电商规格展示图:参考图保健品瓶正面居中,旁边细线标注『60粒/瓶 · 每日1粒』(按产品实际规格替换),纯白背景,极简电商风格,中文标注清晰。",
    tags: ["保健品", "规格", "参数"],
    image: "/demos/suite-demo/suppl-spec.png",
    gradient: "from-stone-100 to-amber-100",
  },
  {
    id: "naumi-hb-ingredients",
    title: "保健品成分图 · 核心成分",
    category: "成分图",
    industry: "保健品",
    description: "『核心成分』大标题 + 三条成分卖点卡,1:1 方图。",
    prompt: "电商成分图(1:1 方图):参考图的保健品瓶居中,左侧竖排大标题『核心成分』与三条成分卖点卡(按产品替换成分与含量),点缀橙子与分子结构元素,浅暖色高级背景,中文排版清晰无错别字。",
    tags: ["保健品", "成分", "1:1"],
    image: "/media/aplus/aplus-1789205189288-0.png",
    gradient: "from-amber-100 to-orange-100",
    popular: true,
  },
  {
    id: "naumi-hb-scene",
    title: "保健品场景图 · 生活方式",
    category: "场景图",
    industry: "保健品",
    description: "山野/通勤等真实使用场景,传递健康生活方式。",
    prompt: "电商使用场景图:参考图的保健品瓶置于岩石台面,背景为山湖日落自然风光,画面上方排出英文场景标题(按产品替换),商业产品摄影,可直接上架。",
    tags: ["保健品", "场景", "生活方式"],
    image: "/media/aplus/aplus-1789222260393-1.png",
    gradient: "from-sky-100 to-teal-100",
  },
  {
    id: "naumi-hb-multiangle",
    title: "保健品多角度图 · 三视角排布",
    category: "多角度图",
    industry: "保健品",
    description: "正面/侧面/背面三视角并排,背面成分表可见。",
    prompt: "电商多角度展示图(横版):参考图中的保健品瓶以正面/侧面/背面三个视角并排呈现,下方小字标注视角名称,浅暖灰背景,顶部大标题,瓶子外观、标签、背面成分表与参考图完全一致。",
    tags: ["保健品", "多角度", "三视角"],
    image: "/media/aplus/aplus-1789222713587-1.png",
    gradient: "from-orange-100 to-amber-100",
  },
  {
    id: "naumi-generic-replicate",
    title: "爆款复刻 · 同构图换商品",
    category: "爆款复刻",
    industry: "通用",
    description: "参考山湖日落爆款构图,换上你的产品与卖点标注。",
    prompt: "爆款构图复刻:参照用户提供的参考图构图(山湖日落背景、产品居中岩石台面、右侧卖点标注栏),把商品原图中的产品(保持原样)放入同款构图,标注与文案按产品替换,商业产品摄影,可直接上架。",
    tags: ["复刻", "构图", "标注"],
    image: "/media/replicate/rep-1789207038397.png",
    gradient: "from-sky-100 to-teal-100",
    popular: true,
  },
  {
    id: "naumi-generic-retouch",
    title: "商品精修 · 画质升级",
    category: "精修",
    industry: "通用",
    description: "产品零改动,提升光泽、清晰度并校正色彩。",
    prompt: "对商品原图进行专业精修:增强产品光泽、修复划痕瑕疵、提升整体清晰度、色彩校正;商品本身(形状、品牌、标签文字、外观)与构图视角完全不变,观感自然不过度处理。",
    tags: ["精修", "画质", "通用"],
    image: "/media/retouch/ret-1789207515356.png",
    gradient: "from-stone-100 to-amber-100",
  },
  {
    id: "naumi-generic-recolor",
    title: "产品换色 · SKU 变体",
    category: "换色",
    industry: "通用",
    description: "同一产品换目标配色,纹理光影保留,多色出 SKU 图。",
    prompt: "产品换色:把图中商品的主体颜色替换为目标色(如绿色 #27AE60,可替换为任意目标色),商品的形状、结构、材质纹理、明暗光影、品牌与标签文字、背景全部保持完全不变,换色后颜色均匀自然、光照真实。",
    tags: ["换色", "SKU", "通用"],
    image: "/media/recolor/rec-1789207942512.png",
    gradient: "from-emerald-100 to-teal-100",
  },
  {
    id: "naumi-generic-thermos-hero",
    title: "户外器物主图 · 山野场景",
    category: "主图",
    industry: "通用",
    description: "保温杯/户外器物的山野场景主图,英文标题版式。",
    prompt: "电商营销主图:军绿色不锈钢保温杯(以用户上传商品为准)置于岩石上,雪山湖泊背景,画面上方排出英文大标题『24 HOURS COLDER. LONGER.』风格文案,四周卖点小图标点缀,商业产品摄影,可直接上架。",
    tags: ["保温杯", "户外", "英文标题"],
    image: "/demos/suite-demo/thermos-main.png",
    gradient: "from-lime-100 to-emerald-100",
  },
  {
    id: "tpl-ext-01",
    title: "白底主图",
    category: "主图",
    industry: "通用",
    description: "淘宝、拼多多、抖音小店、商品上架首图、AI电商主图一键生成免费体验。 ![](https://pic.imgdd.cc/item/6a0e7d40645f0b9",
    prompt: `使用我上传的产品图片作为唯一参考图，严格保持产品外观、包装、品牌标识、标签文字、材质和比例完全一致。不要重绘产品，不要改变颜色，不要新增或删除任何元素。

将产品置于纯白色背景中央（RGB 255,255,255），单一主体，正面或轻微45度标准电商角度，柔和均匀的影棚灯光，底部带有真实自然阴影，边缘锐利清晰，无道具，无杂物，无额外装饰，符合主流电商平台合规主图规范。生成真实商业产品摄影，高分辨率，超清细节，8K。`,
    tags: ["主图", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a0e7d40645f0b92777b278e.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-02",
    title: "爆款主图6张套图",
    category: "套图",
    industry: "通用",
    description: "新品上架、商品页主图套图、卖点图、细节图、促销封面。 ![](https://pic.imgdd.cc/item/6a3b4c68b8e72d31e4220e9",
    prompt: `基于上传商品图，生成一组电商爆款主图套图视觉方案，包含6张不同用途的商品图：
1 白底合规主图：商品居中、主体完整、背景纯净；
2 场景主图：把商品放入真实使用场景，突出使用感；
3 核心卖点图：用3个简短标签展示核心卖点；
4 细节特写图：展示材质、工艺、接口、纹理或包装细节；
5 尺寸对比图：加入手持、桌面或参照物体现大小；
6 促销封面图：加入优惠标签、限时活动和购买引导。
严格保留商品外观、颜色、logo、包装文字和结构，不重新设计产品。整体风格统一，适合淘宝、抖音、小红书、小店商品页。`,
    tags: ["套图", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b4c68b8e72d31e4220e97.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-03",
    title: "电商详情图",
    category: "详情页",
    industry: "通用",
    description: "商品卖点介绍、详情页长图、产品功能说明。 ![](https://pic.imgdd.cc/item/6a1029928fac20e3cd16e1db.webp",
    prompt: `生成电商详情图`,
    tags: ["详情页", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a1029928fac20e3cd16e1db.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-04",
    title: "电商产品介绍图",
    category: "卖点图",
    industry: "通用",
    description: "产品介绍页、详情页模块、功能说明图。 ![](https://pic.imgdd.cc/item/6a1029ad8fac20e3cd16e2b1.webp) ",
    prompt: `生成一个的电商产品介绍图`,
    tags: ["卖点图", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a1029ad8fac20e3cd16e2b1.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-05",
    title: "亚马逊A+详情页",
    category: "A+详情页",
    industry: "跨境",
    description: "Amazon A+ 页面、跨境电商详情页、欧美品牌风格商品页。 ![](https://pic.imgdd.cc/item/6a3b4c2db8e72d31e4",
    prompt: `设计亚马逊A+详情页。
产品置于高级背景，
展示核心卖点，
图文结合，
布局整洁，
欧美品牌风格，
科技感设计，
商业视觉设计，
真实材质细节，
高转化率页面，
高级品牌感。`,
    tags: ["A+详情页", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b4c2db8e72d31e4220c59.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-06",
    title: "TikTok爆款素材风",
    category: "短视频素材",
    industry: "跨境",
    description: "TikTok 广告素材、短视频封面、欧美家庭场景种草图。 ![](https://pic.imgdd.cc/item/6a3b4c1ab8e72d31e4220",
    prompt: `TikTok爆款广告风格。

产品放在真实家庭场景中，
人物自然互动，
抓拍感，
短视频封面风格，
真实生活氛围，
自然光，
高互动感，
高转化率电商广告视觉，
欧美用户审美。`,
    tags: ["短视频素材", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b4c1ab8e72d31e4220b9d.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-07",
    title: "电商爆款海报模板",
    category: "海报",
    industry: "通用",
    description: "促销海报、活动页主视觉、信息流广告、社媒投放封面。 ![](https://pic.imgdd.cc/item/6a3b4bfdb8e72d31e4220a92",
    prompt: `电商促销海报，

产品主体巨大突出，
视觉冲击力强，
高端商业广告风格，
动态光效，
粒子特效，
高级渐变背景，
促销氛围浓厚，
品牌感强，
电影级灯光，
商业设计，
高点击率广告视觉。`,
    tags: ["海报", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b4bfdb8e72d31e4220a92.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-08",
    title: "电商促销海报设计",
    category: "海报",
    industry: "通用",
    description: "618大促、双11、周年庆、限时优惠、优惠券海报。 ![](https://pic.imgdd.cc/item/6a0bf1de025ef5e4d096bc7d",
    prompt: `电商促销海报设计，整体采用粉红色渐变背景，覆盖着网格线纹理以创造3D空间感。海报呈圆角矩形设计。主要元素：顶部文案：细小白色文字"欢乐购物 与 您 同行"居中排列主视觉区域：大型半透明玻璃质感的"618"数字位于中央，具有3D立体效果上方有倾斜的白色粗体文字"季度盛典"，带有投影效果下方小字为"618大促 精选好物等你抢购"装饰元素：多条红色斜向横幅环绕主视觉，上面印有"SPECIAL OFFER"和"限时特惠"等循环文字几枚金色/橙色圆形装饰元素散布在页面上方和两侧底部区域：白色文字标语："—— 限时XYZ 购满即享优惠 ——"三个红色优惠券区块并排排列，分别显示："10￥ 满100元可用 限时抢购""20￥ 满200元可用 限时抢购""40￥ 满300元可用 限时抢购"整体设计色彩鲜明，层次分明，利用透明效果和立体感营造节日氛围，适合作为电商促销主题海报使用。`,
    tags: ["海报", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a0bf1de025ef5e4d096bc7d.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-09",
    title: "食品商业海报",
    category: "海报",
    industry: "食品饮料",
    description: "食品广告、零食主图、饮品海报、早餐/下午茶场景图。 ![](https://pic.imgdd.cc/item/6a3b4cc3b8e72d31e4221239",
    prompt: `根据商品图生成一张食品商业海报。保留商品包装、主体形状、颜色和品牌识别，不改变产品核心外观。

主题：{{主题场景}}。
例如：学习补给、下午茶、运动后能量、玩乐派对、早餐陪伴、办公室加餐。

画面中商品作为主角，放置在符合主题的真实场景里。
背景可以包含{{背景元素}}，但不能喧宾夺主。
整体风格为{{视觉风格}}，光影自然，高级商业摄影质感。

表达重点：突出食品带来的陪伴感、满足感、能量感和情绪价值。
文案如果出现，使用简洁、温和、合规的中文广告语，不使用绝对化功效，不暗示医疗或保健治疗效果。`,
    tags: ["海报", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b4cc3b8e72d31e4221239.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-10",
    title: "护肤品促销海报",
    category: "海报",
    industry: "美妆护肤",
    description: "护肤品活动页、美妆促销、节日上新、社媒宣传。 ![](https://pic.imgdd.cc/item/6a3b5092b8e72d31e42233e0.we",
    prompt: `护肤品促销海报，采用梦幻唯美风格。背景为蓝天白云与山脉的渐变景观，底部点缀着黄色花丛与流水，营造出自然清新氛围。中央摆放着巨大半透明渐变色"SALE"立体字母，周围装饰有粉色与黄色花朵。顶部设有品牌名"BEAUTY ESSENCE"，右上角有"PREMIUM"圆角按钮。主标题"深层焕颜Lumi"采用白色与金色混合字体横跨画面上方，副标题"臻享肌肤奢宠 塑造光采容颜"以小号白色字体排列于下。底部醒目展示促销信息"全场每满280减35"，数字采用黄金色强调。整体构图层次分明，色彩以蓝色、黄色和粉色为主，呈现出高级感与春夏活力，适合美妆护肤产品的促销活动。`,
    tags: ["海报", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b5092b8e72d31e42233e0.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-11",
    title: "高级灰影棚",
    category: "质感棚拍",
    industry: "通用",
    description: "高端产品图、官网视觉、详情页首屏、品牌商拍。 ![](https://pic.imgdd.cc/item/6a3b50b1b8e72d31e422343a.we",
    prompt: `使用我上传的产品图片作为唯一参考图，严格保持产品设计、包装、品牌元素、颜色与材质一致，不得修改产品本体。
将产品置于浅灰色无缝摄影棚背景中，背景呈现细腻高级灰渐变，采用柔和漫射布光，微妙自然阴影，产品完整可见，边缘清晰，若有亮面材质则保留真实镜面反射，整体风格克制高级，适合高端品牌官网视觉，生成商业级电商产品摄影，真实感强，超清8K。`,
    tags: ["质感棚拍", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b50b1b8e72d31e422343a.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-12",
    title: "45度悬浮动态图",
    category: "悬浮渲染",
    industry: "通用",
    description: "商品辅助图、广告 Banner、科技产品图、视觉冲击图。 ![](https://pic.imgdd.cc/item/6a3b50c9b8e72d31e4223",
    prompt: `使用我上传的产品图片作为唯一参考图，产品必须与参考图完全一致，不得变形、改色、改logo、改包装。
将产品以45度角悬浮展示在干净中性背景中，保持真实比例与几何结构，下方添加柔和真实投影，增强空间深度与轻盈感，采用商业摄影灯光，边缘高光清晰，材质真实，画面具有现代感与视觉冲击力，适合作为电商详情页第二张或广告Banner，生成超真实商业产品摄影，8K。`,
    tags: ["悬浮渲染", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b50c9b8e72d31e422349a.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-13",
    title: "俯拍平铺",
    category: "平铺摆拍",
    industry: "通用",
    description: "服饰、文具、餐具、包装产品、详情页模块图。 ![](https://pic.imgdd.cc/item/6a3b5200b8e72d31e422386e.web",
    prompt: `使用我上传的产品图片作为唯一参考图，严格保持产品本体完全一致。
创建该产品的自上而下俯拍构图，置于干净摄影棚表面或极简背景中，布局平衡，产品完整可见，光线柔和均匀，最小阴影，材质纹理清晰，商业产品摄影风格，适合电商详情页、种草图、信息展示图，画面干净有秩序，超高清，8K。`,
    tags: ["平铺摆拍", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b5200b8e72d31e422386e.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-14",
    title: "生活方式场景",
    category: "场景图",
    industry: "通用",
    description: "居家、办公、餐桌、浴室、梳妆台场景图。 ![](https://pic.imgdd.cc/item/6a1029c68fac20e3cd16e34a.webp)",
    prompt: `使用我上传的产品图片作为唯一参考图，保持产品外观、颜色、包装、标签与品牌元素完全一致。不要改变产品本体，只改变场景与环境。
将产品自然融入真实使用场景中，产品为视觉中心，搭配少量合理配饰，柔和自然窗光，背景轻微虚化，构图整洁，氛围真实温暖，突出产品在真实生活中的使用感与高级感，生成社论级商业电商摄影，适合详情页和社媒种草图，8K。`,
    tags: ["场景图", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a1029c68fac20e3cd16e34a.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-15",
    title: "分层解构展示",
    category: "卖点图",
    industry: "通用",
    description: "护肤品成分、数码结构、机械零件、功能卖点解释。 ![](https://pic.imgdd.cc/item/6a3b51d8b8e72d31e4223768.w",
    prompt: `使用我上传的产品图片作为唯一参考图，保持产品本体完全一致。
将产品作为底部主成品展示，在其上方垂直悬浮分层展示，如或。背景为纯黑或深色高级影棚环境，45度超写实商业摄影，强对比轮廓光，突出真实材质、颜色与光泽，层次清晰，空间透视强烈，适合电商详情页“核心卖点展示”，生成专业级商业广告图，8K。`,
    tags: ["卖点图", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b51d8b8e72d31e4223768.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: true,
  },
  {
    id: "tpl-ext-16",
    title: "3D/C4D多巴胺",
    category: "风格创意",
    industry: "通用",
    description: "彩妆、零食、饮料、潮玩、年轻消费品。 ![](https://pic.imgdd.cc/item/6a3b51c6b8e72d31e422373f.webp) ",
    prompt: `使用我上传的产品图片作为唯一参考图，严格保留产品的外观、比例、颜色、包装、logo与标签细节，禁止重新设计产品。
将产品置于C4D风格的极简几何展示台中央，3D超真实商业渲染风格，背景为马卡龙多巴胺配色（粉蓝、奶油粉、薄荷绿、淡紫），搭配圆柱与方块几何体、磨砂玻璃和亚克力材质背景，柔和均匀影棚灯光，轻微彩色阴影，整体呈现未来感糖果实验室氛围，画面高级、干净、年轻化，适合电商活动海报与社媒广告，8K。`,
    tags: ["风格创意", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b51c6b8e72d31e422373f.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-17",
    title: "国潮/新中式",
    category: "风格创意",
    industry: "通用",
    description: "茶饮、滋补、美妆、礼盒、国风活动图。 ![](https://pic.imgdd.cc/item/6a3b51b3b8e72d31e4223710.webp) ",
    prompt: `使用我上传的产品图片作为唯一参考图，严格保持产品原始外观、包装、文字、logo与颜色一致，不允许重新设计产品。
将产品置于复古国潮风格海报中心位置，中国传统水墨艺术与现代矢量图形融合，大面积故宫红与琉璃金主色调，辅以孔雀蓝点缀，背景为祥云、仙鹤、如意纹、中式浮雕窗棂等元素，对称构图，背景具有层次浮雕质感，电影感光效，高动态范围，画面华丽但不杂乱，产品依然是唯一视觉焦点，生成高端电商海报级广告图，超清8K。`,
    tags: ["风格创意", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b51b3b8e72d31e4223710.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-18",
    title: "高端电商模特生成",
    category: "模特穿搭",
    industry: "服装",
    description: "运动服、瑜伽裤、服装主图、模特图、广告大片。 ![](https://pic.imgdd.cc/item/6a3b5196b8e72d31e42236d1.we",
    prompt: `上传 1 张人物参考图或模特参考图，生成同一成年职业女性模特的六宫格高端电商时尚广告大片。`,
    tags: ["模特穿搭", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b5196b8e72d31e42236d1.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-19",
    title: "服装上身",
    category: "模特穿搭",
    industry: "服装",
    description: "服装电商、lookbook、模特试穿、上新素材。 ![](https://pic.imgdd.cc/item/6a11122e8fac20e3cd1aa015.",
    prompt: `请严格按照参考图顺序完成服装上身生成。
第1张参考图是模特参考图，请严格保留该人物的脸部特征、肤色、发型、体型比例、姿势、拍摄角度和背景真实感。
最终输出一张写实的服装上身展示图，适合电商详情页或品牌 lookbook。服装需要自然合身，材质与光线阴影保持一致，整体真实高级。
固定输出比例为 3:4 竖版，优先展示完整穿搭。不要换脸，不要新增人物，不要改变模特身份，不要改变背景环境，只完成服装与配饰上身。`,
    tags: ["模特穿搭", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a11122e8fac20e3cd1aa015.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-20",
    title: "电商产品悬浮渲染",
    category: "悬浮渲染",
    industry: "通用",
    description: "美妆、数码、快消、玻璃瓶、金属产品、品牌主视觉。 ![](https://pic.imgdd.cc/item/6a3b5169b8e72d31e4223640.",
    prompt: `基于用户上传的产品图片，生成一张高端商业广告级产品渲染图。产品主体精准还原原始外观、颜色、材质、结构与品牌细节，悬浮在半空中，周围环绕与产品属性相关的动态元素，如旋转水花、植物成分、雾气、玻璃碎光、金属粒子或丝绸流线。整体采用电影感轮廓光与高级棚拍布光，极浅景深，背景柔和虚化。光线穿过透明或半透明材质时产生自然折射、反射、高光与阴影变化，突出玻璃、金属、塑料、液体等材质质感。画面达到 4K 高端商业大片品质，构图简洁高级，彻底摆脱 AI 贴纸感，呈现真实产品摄影与CG广告融合的视觉效果。`,
    tags: ["悬浮渲染", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b5169b8e72d31e4223640.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-21",
    title: "护肤品爆款",
    category: "品类大片",
    industry: "美妆护肤",
    description: "精华、面霜、爽肤水、护肤套装。 ![](https://pic.imgdd.cc/item/6a1029db8fac20e3cd16e3d8.webp) 提示词",
    prompt: `基于用户上传的护肤品图片，生成高端商业广告级产品渲染图。产品瓶身精准还原原始外观与品牌细节，悬浮在半空中，周围环绕旋转水花、透明精华液轨迹、植物提取成分和细小气泡。采用电影感轮廓光与高级棚拍布光，极浅景深，背景柔和虚化。光线穿过玻璃瓶与液体产生自然折射、高光与阴影变化，突出玻璃、金属瓶盖与液体质感。整体呈现 4K 商业大片品质，纯净、高级、真实，彻底摆脱 AI 贴纸感。`,
    tags: ["品类大片", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a1029db8fac20e3cd16e3d8.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-22",
    title: "香水爆款",
    category: "品类大片",
    industry: "美妆护肤",
    description: "香水、香氛、奢侈品美妆、礼赠海报。 ![](https://pic.imgdd.cc/item/6a3b513eb8e72d31e42235dd.webp) 提",
    prompt: `基于上传的香水产品图，生成奢华商业海报级渲染。香水瓶悬浮于空中，周围有轻雾、漂浮花瓣、细腻香气流线与柔和高光微粒。采用电影级边缘光和高级棚拍光，背景大面积虚化，突出玻璃折射、液体层次、金属喷头和瓶身切面。整体画面优雅、神秘、浪漫、精致，像国际奢侈品牌香水广告，4K，超清，高级质感。`,
    tags: ["品类大片", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b513eb8e72d31e42235dd.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-23",
    title: "数码科技爆款",
    category: "品类大片",
    industry: "数码3C",
    description: "耳机、手机、键盘、智能穿戴、小家电。 ![](https://pic.imgdd.cc/item/6a3b5128b8e72d31e42235ab.webp) ",
    prompt: `基于上传的数码产品图片，生成未来科技感商业渲染图。产品主体悬浮在深色空间中，周围环绕细密光轨、微粒、能量线条和冷色发光结构。采用精准轮廓光与反射控制，突出金属边框、玻璃面板、磨砂外壳和工业设计细节。背景简洁高级、层次分明，景深自然，整体呈现高端科技品牌广告大片质感，锐利、真实、具有强烈购买欲。`,
    tags: ["品类大片", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b5128b8e72d31e42235ab.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-24",
    title: "商品广告",
    category: "品类大片",
    industry: "食品饮料",
    description: "饮料广告、夏日新品、信息流广告、促销图。 ![](https://pic.imgdd.cc/item/6a0e7da7645f0b92777b7ccf.webp",
    prompt: `商品广告照片，适合夏天的季节商品，主体为碳酸饮料，名称="机灵助手 COOL"，形状=PET瓶500ml。研究并参考 2025 年饮料广告中高 CTA 转化设计的视觉规律，设计并生成一张竖屏商品广告图。
画面以夏季清凉、冰爽气泡、强烈购买冲动为核心：500ml PET 瓶作为中心主体，瓶身标签清晰展示“机灵助手 COOL”，冷凝水珠、冰块、碳酸气泡、柑橘或青柠元素、飞溅水花围绕商品形成动势。背景为高饱和夏日渐变或清爽海滩、泳池、冰柜场景，光线明亮，商业摄影质感，主体锐利，视觉层级清晰。
加入醒目的促销 CTA 区域，包含简洁中文卖点和购买引导，例如“夏日冰爽来一瓶”“限时尝鲜”“立即下单”。整体排版符合 2025 年饮料广告高点击率海报风格，现代、年轻、清爽、高转化、社媒传播感强，竖屏构图，1024x1536，高清商业广告照片。`,
    tags: ["品类大片", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a0e7da7645f0b92777b7ccf.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-ext-25",
    title: "日式茶饮海报",
    category: "海报",
    industry: "食品饮料",
    description: "抹茶、绿茶、乌龙茶、门店新品、小红书封面。 ![](https://pic.imgdd.cc/item/6a3b50ffb8e72d31e422354f.web",
    prompt: `生成一张日式的茶饮海报。画面为竖屏商业广告海报，主体是一杯或一瓶精致茶饮，风格清爽、克制、自然，带有日式审美的留白、纸张质感、浅色木纹、竹叶、茶叶、抹茶粉、冰块、水滴和柔和自然光。
画面中心突出茶饮产品，适合绿茶、抹茶、乌龙茶或季节限定茶饮。背景可以是日式茶室、浅木色桌面、夏日窗边、简洁庭院或干净浅色棚拍空间，整体色彩以抹茶绿、米白、浅木色和淡金色为主，形成高级、清爽、治愈的茶饮品牌气质。
加入简洁海报排版和中文主标题，例如“日式茶饮”“清爽一夏”“自然茶香”，保留足够留白，避免文字过多。整体像高端茶饮品牌新品宣传海报，商业摄影质感，产品清晰，层次干净，竖屏构图，1024x1536，高清细节。`,
    tags: ["海报", "来源:aidianshanggongju"],
    image: "https://pic.imgdd.cc/item/6a3b50ffb8e72d31e422354f.webp",
    gradient: "from-sky-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-1",
    title: "A Tapestry of Cultures: 16x16 Historical",
    category: "3D场景",
    industry: "通用",
    description: "So I have been trying all kinds of prompts with GPT Image 2.0 to see how much I ",
    prompt: `So I have been trying all kinds of prompts with GPT Image 2.0 to see how much I can push it. It can technically do 20x20 but it struggles with the text. It does well with 15x15. Here is a 16x16 image: 

Create a 16×16 grid with  equal cells, each showing a different culture, civilization, or region-specific scene from a different time period in human history. Each cell should contain a miniature diorama featuring distinct clothing, architecture, tools, food, symbols, and environment. No culture should repeat in the same form, and no two cells should look compositionally similar. The image should feel like a dense visual atlas of humanity with accurate regional and historical differentiation.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGgUkE8XgAAAwjV.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-2",
    title: "Capturing the Beach Vibe: A Realistic Se",
    category: "3D场景",
    industry: "通用",
    description: "{'prompt': 'Ultra-realistic iPhone 15 Pro front-camera selfie of an adult woman ",
    prompt: `{'prompt': 'Ultra-realistic iPhone 15 Pro front-camera selfie of an adult woman on a bright beach, photographed from a raised-arm high-angle selfie perspective. The phone is held slightly above her face, creating natural front-camera geometry with mild 24mm equivalent wide-angle distortion, realistic facial proportions, and deep smartphone depth of field. She tilts her chin upward and looks directly toward the phone lens while shielding harsh sunlight with one hand. Her expression is neutral, blank, and slightly distant, with wide attentive eyes but anatomically realistic eye size and natural facial proportions.\\n\\nShe has very light platinum-blonde hair styled in two tight braids, pale skin with real photographic skin texture, visible pores, subtle peach fuzz, faint under-eye texture, natural lip texture, and a soft sunlit sheen rather than airbrushed perfection. Her lips are naturally toned and slightly full, her nose is small and refined but realistic. Her nails are vivid blue. She wears a light blue fitted stretch-cotton top with a very deep wide neckline that reveals pronounced collarbones and upper chest structure in a natural, non-stylized way.\\n\\nThe setting is a wide coastal beach under strong late-morning sunlight, with a softly blurred horizon line in the background. The lighting is bright, high-key coastal daylight around 5500K, with strong white sand bounce filling the shadows evenly from below and around the face. Skin is illuminated by direct sun plus broad soft reflected fill from the beach, producing crisp but realistic highlights without harsh contrast. Fine grains of bright sand catch light subtly. The overall image should feel like a real high-exposure smartphone selfie taken outdoors in intense seaside light.\\n\\nColor rendering should be soft, clean, and modern, with neutral-to-pastel tones, realistic iPhone computational photography, slightly elevated exposure, controlled highlight rolloff, natural skin color, and no cinematic grading. Prioritize realism, physical accuracy, believable anatomy, and true smartphone image behavior over beauty stylization.', 'negative_prompt': 'anime, doll face, porcelain skin, poreless skin, plastic skin, CGI, 3D render, surreal eyes, oversized eyes, fantasy beauty, airbrushed retouching, heavy makeup, glamour lighting, dramatic shadows, film grain, snow, winter clothing, black top, red nails, conservative neckline, studio backdrop, artificial blur, warped hands, deformed fingers, malformed face, symmetry perfection, beauty filter, uncanny skin smoothing'}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGb942pbcAAtqqA.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-3",
    title: "Fragmented Thoughts in Cosmic Reflection",
    category: "3D场景",
    industry: "通用",
    description: "{'subject': 'A handsome young man with curly brown hair and green eyes, resting ",
    prompt: `{'subject': 'A handsome young man with curly brown hair and green eyes, resting his chin on his hand with a thoughtful expression.', 'concept': "Surreal deconstruction. The subject's face and upper body are being fragmented into a series of floating, 3D metallic cubes.", 'visual_effects': {'reflections': 'Chrome and bronze mirrored surfaces on the cubes, reflecting parts of the subject and a cosmic background.', 'atmosphere': 'Dust particles and small debris floating in a dark, warm-toned nebular space.', 'lighting': 'Cinematic side-lighting with high contrast and golden hour highlights.'}, 'style': 'Hyper-realistic digital art, fine art photography, octane render, 8k resolution.'}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGbeB69WIAACO9U.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-82",
    title: "Create a detailed medical infographic of",
    category: "信息图",
    industry: "通用",
    description: "Create a detailed medical infographic of the human body showing major organs and",
    prompt: `Create a detailed medical infographic of the human body showing major organs and how long a person can survive without each. Use a central transparent body, labeled organs, and a clean modern poster design.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGlihuLasAAiJ0I?format=jpg&name=medium",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-83",
    title: "F1 法拉利进展信息图",
    category: "信息图",
    industry: "通用",
    description: "信息图显示了 F1 法拉利赛车从旧款到最新款 2026 年法拉利一级方程式赛车 SF-26（代号为 Project 678）的进展，该赛车于 2026 年 1 ",
    prompt: `信息图显示了 F1 法拉利赛车从旧款到最新款 2026 年法拉利一级方程式赛车 SF-26（代号为 Project 678）的进展，该赛车于 2026 年 1 月 23 日正式发布。`,
    tags: ["信息图", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/048-x-2040489463550529755/f1-ferrari-progression-infographic-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-84",
    title: "FPSO Engineering Infographic",
    category: "信息图",
    industry: "通用",
    description: "Create the most detailed infographic ever made about how a modern FPSO is design",
    prompt: `Create the most detailed infographic ever made about how a modern FPSO is designed, built, and put into operation, from the conceptual engineering phase and hull fabrication (or conversion of a VLCC) in a shipyard to the complete integration of topside modules, turret mooring system, commissioning, and full production operation, three-phase separation, gas compression, storage, and transfer of crude oil in ultra-deep waters.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGlPmZ_XYAEN21a?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-85",
    title: "Knowing everything you know about me, ma",
    category: "信息图",
    industry: "通用",
    description: "Knowing everything you know about me, make an infographic of me. Make a 3D carto",
    prompt: `Knowing everything you know about me, make an infographic of me. Make a 3D cartoon style image. 3. That's all) #ai #aitools #chatgpt`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGlQAC4WQAAa-Xi?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-86",
    title: "Knowing everything you know about me. Ma",
    category: "信息图",
    industry: "通用",
    description: "Knowing everything you know about me. Make a anime style infographic of me.",
    prompt: `Knowing everything you know about me. Make a anime style infographic of me.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGlZ8WnWQAApJL0?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-87",
    title: "Mastering Adobe: A Visual Guide to Creat",
    category: "信息图",
    industry: "通用",
    description: "Create a modern, visually engaging infographic showcasing Adobe Creative Cloud t",
    prompt: `Create a modern, visually engaging infographic showcasing Adobe Creative Cloud tools. Use a clean layout with sections and icons. Include the following tools with short descriptions: Photoshop (photo editing), Illustrator (vector graphics), Premiere Pro (video editing), After Effects (motion graphics), InDesign (layout & publishing), Lightroom (photo management), XD (UI/UX design). Use a professional color palette inspired by Adobe branding (dark background with vibrant accent colors). Include minimal text, clear headings, and simple icons for each tool. Add subtle gradients, geometric shapes, and a tech/creative aesthetic. Ensure the design is balanced, easy to read, and suitable for social media or presentation`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGb_qmAXsAEPuKk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-88",
    title: "Photoshop Shortcuts Infographic",
    category: "信息图",
    industry: "通用",
    description: "Create a clean and modern infographic showing the most essential Photoshop short",
    prompt: `Create a clean and modern infographic showing the most essential Photoshop shortcuts, well organized and easy to read.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGgr_I8X0AAYxYh?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-89",
    title: "Semiconductor Manufacturing Infographic",
    category: "信息图",
    industry: "通用",
    description: "Create the most detailed infographic ever made about how a modern semiconductor ",
    prompt: `Create the most detailed infographic ever made about how a modern semiconductor chip is manufactured, from quartz sand to a finished 3nm-class processor.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGiSRK4awAAgmfQ?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-90",
    title: "Unlock Your Fitness Potential with Tailo",
    category: "信息图",
    industry: "通用",
    description: "我生成的主题是：胸肌、腹肌、引体向上、附身臂屈伸，都有针对性的拆解，对新手友好，信息量很足！ 提示词： 请生成一张中文健身信息图，主题为：【xxx】。 要求这张",
    prompt: `我生成的主题是：胸肌、腹肌、引体向上、附身臂屈伸，都有针对性的拆解，对新手友好，信息量很足！

提示词：
请生成一张中文健身信息图，主题为：【xxx】。 

要求这张图既专业又实用，适合普通成年人作为训练参考。默认对象为无严重伤病的健康成年人；如果没有额外说明，默认训练目标为“增肌 + 基础力量提升”，默认训练水平为“新手到中级之间”，默认训练场景为“普通健身房”，默认单次训练时长控制在 40–60 分钟内。

请根据【训练主题】自动判断输出类型：

1）如果【训练主题】是某个肌群或身体部位（例如：胸肌、背阔肌、肱二头肌、腹肌、肩部、腿部等），请输出一张“该部位训练计划信息图”。
2）如果【训练主题】是某个动作或技能目标（例如：引体向上、俯卧撑、双杠臂屈伸、深蹲等），请输出一张“动作解锁 / 进阶训练计划信息图”。

整张图请采用清晰、现代、专业、易读的中文信息图风格，竖版排版，视觉简洁，重点突出，适合社交媒体分享或训练参考卡片。不要写成长篇大论，每个模块用简洁短句呈现，数字信息要醒目。

这张信息图必须包含以下内容：

【A. 标题区】
- 主标题：直接写【训练主题】训练计划 / 解锁计划
- 副标题：自动补充适用人群、目标、训练场景、建议时长
例如：适合新手 / 增肌导向 / 健身房版 / 45分钟

【B. 训练目标区】
用简洁语言说明：
- 这次训练主要针对什么
- 主要目标是什么（增肌 / 力量 / 技能解锁 / 核心控制等）
- 本次训练的重点刺激或能力提升方向

【C. 热身区】
给出 2–4 个热身建议，简洁列出即可，例如：
- 动态活动
- 目标肌群激活
- 轻重量预热组
每项可附一句说明

【D. 主训练区】
这是核心部分，请列出 4–6 个主要训练动作。
每个动作都要包含以下信息：
- 动作名称
- 训练作用 / 针对部位
- 组数 × 次数（或时间）
- RIR 建议
- 每组间休息时间
- 动作关键要点（1–2 条）
- 常见错误（1 条即可）

请确保动作安排合理：
- 先复合动作，后孤立动作
- 整体训练量适中
- 新手不要安排过度极限训练
- 主动作通常建议 RIR 1–3
- 孤立动作可建议 RIR 0–2
- 如果是腹肌或核心类动作，可用“秒数 / 次数”形式
- 如果是技能类动作，请优先安排“前置能力动作 + 过渡动作 + 目标动作尝试”

【E. 进阶 / 解锁逻辑区】
根据主题自动生成：
- 如果是肌群训练：写“如何渐进超负荷”，例如达到次数上限后再加重量、优先保证动作标准等
- 如果是动作解锁：写“分阶段进阶路径”，例如从悬垂、肩胛引体、离心训练、弹力带辅助，到标准动作完成

【F. 替代动作区】
请给出 2–3 个替代动作，适用于以下情况：
- 没有器械
- 家庭训练
- 当前能力不足
- 某些动作做不了

【G. 执行提醒区】
请给出 4–6 条简洁提醒，例如：
- 动作标准优先于重量
- 不要每组都练到力竭
- 同肌群建议间隔 48–72 小时
- 疼痛不等于正常发力
- 睡眠不足时可适当减少训练量

【H. 恢复建议区】
简洁说明：
- 训练后恢复重点
- 蛋白质 / 睡眠 / 恢复间隔建议
- 1 句风险提醒（如有明显疼痛应停止并评估）

【I. 视觉设计要求】
- 整体为单页中文信息图
- 竖版排版
- 风格现代、清爽、专业、健身感强
- 使用模块化卡片布局
- 重点数字（组数、次数、RIR、休息）要醒目
- 可加入简洁的人体肌群图标、哑铃、杠铃、引体向上等小图标
- 颜色保持高级、干净、有运动感
- 中文文字必须清晰、准确、易读
- 避免过多装饰，强调实用性与执行性

请最终输出为“一张完整的信息图内容”，而不是只给普通段落文字。`,
    tags: ["信息图", "中文"],
    image: "https://pbs.twimg.com/media/HGbW7-LXYAANNeF.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-92",
    title: "Charming 3D Miniature: Starbucks Store D",
    category: "包装设计",
    industry: "通用",
    description: "3D chibi-style miniature concept store of {Brand Name}, creatively designed with",
    prompt: `3D chibi-style miniature concept store of {Brand Name}, creatively designed with an exterior inspired by the brand's most iconic product or packaging (such as a giant {brand's core product, e.g., chicken bucket/hamburger/donut/roast duck}). The store features two floors with large glass windows clearly showcasing the cozy and finely decorated interior: {brand's primary color}-themed decor, warm lighting, and busy staff dressed in outfits matching the brand. Adorable tiny figures stroll or sit along the street, surrounded by benches, street lamps, and potted plants, creating a charming urban scene. Rendered in a miniature cityscape style using Cinema 4D, with a blind-box toy aesthetic, rich in details and realism, and bathed in soft lighting that evokes a relaxing afternoon atmosphere. --ar 2:3

Brand name: Starbucks`,
    tags: ["包装设计"],
    image: "https://pbs.twimg.com/media/HGdjQiZXYAAgI99.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-93",
    title: "Print-Ready AI Packaging System for Yogu",
    category: "包装设计",
    industry: "通用",
    description: "Meyveli yoğurt için bir marka konsepti kurmuş: Çiftlik, doğadan sofranıza. Çok b",
    prompt: `Meyveli yoğurt için bir marka konsepti kurmuş: Çiftlik, 
doğadan sofranıza. Çok başarılı :))

Ürettikleri:

→ Ürün mockup'ı (gerçek ortamda, meyvelerle)
→ Açık artwork hali (düz etiket, ölçülerle)
→ Ürün ailesi görünümü (kayısılı, böğürtlenli, çilekli)
→ Warp edilmiş etiket (kabın eğrisine uygun)

Detaylar çok başarılı:

→ Besin değerleri tablosu (84 kcal, 13,3 g karbonhidrat, 4,0 g protein)
→ İçindekiler listesi Türkçe karakterlerle tam
→ Barkod (gerçek EAN-13 formatında)
→ Teknik bilgiler paneli (PP, flekso/ofset, renk paleti)
→ Alerjen uyarısı, STT notu, geri dönüşüm ikonu
→ "Doğadan sofranıza" sloganı, ğ harfi dahil hatasız

Bir ajansla brief vererek haftalar sürecek bir iş, tek 
oturumda çıktı. Print hazırlığına kadar çalışıyor demek 
abartılı olmaz, gerçekten çalışıyor.

Tasarım iş akışı değişiyor. Artık soru bence "AI tasarım 
yapabilir mi?" değil, "biz bu süreci ne kadar iyi 
yönetebiliriz"`,
    tags: ["包装设计"],
    image: "https://pbs.twimg.com/media/HGdLT0_XIAAoxZF.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-94",
    title: "35mm 模拟警察时尚人像",
    category: "人像摄影",
    industry: "通用",
    description: "模拟35mm胶片摄影，强烈机内直接闪光的高级时尚编辑人像（CCD硬闪光风格），从略下方（约+15°向上角度）亲密的低角度POV拍摄，强调长腿和优雅的沙漏比例，4",
    prompt: `模拟35mm胶片摄影，强烈机内直接闪光的高级时尚编辑人像（CCD硬闪光风格），从略下方（约+15°向上角度）亲密的低角度POV拍摄，强调长腿和优雅的沙漏比例，4:3垂直格式，3/4身体拍摄，20岁出头的韩国偶像型年轻女性，精致的五官，微微上翘的杏仁状狐狸眼，小尖下巴线，完美无瑕的瓷质皮肤，带有凉爽的象牙色底色和直接闪光的可见镜面高光，柔和的珊瑚色腮红，自然的灰玫瑰色嘴唇微微张开，自然卷曲的深棕色长发，松散的发丝勾勒出脸庞。她戴着一顶稍微倾斜的黑色警用鸭舌帽，上面戴着银色徽章。

她穿着一套合身、时尚的女警服装：黑色短袖有领短上衣，上面饰有闪亮的银色纽扣和肩章，胸前别着闪亮的银色警察徽章，一条黑色细领带宽松地垂在前面，一条黑色宽腰带，侧面有银色搭扣和手铐，还有一条黑色短褶迷你裙。黑色长筒袜和宽松系带的白色低帮帆布运动鞋增添了休闲的对比。

姿势：一种微妙的 S 曲线姿势，重量转移到一条腿，臀部稍微向镜头倾斜，以增强轮廓和腿部长度。一只手轻触帽檐或靠近腰部，另一只手放在臀部或靠近腰带的地方。她的头微微低下，透过睫毛，自信、自信地向上凝视着观众。表情应该让人感到平静、冷静和微妙的俏皮，而不是明显的诱惑。

使用来自正面或稍上方的强烈机内直射闪光，可在拍摄对象背后产生强烈的聚光灯、锐利的阴影，以及皮肤、头发、徽章、皮带扣和织物纹理上的清晰高光。将冷闪光质量与温暖的环境窗户光和可见的闪光衰减混合在一起。使用柯达 Portra 400 胶片模拟来实现强烈的模拟特征、带有闪光高光的温暖桃色肤色、微妙的青色阴影、突出的厚模拟胶片颗粒（强度 0.65，较大的颗粒尺寸）、明亮区域周围明显的胶片光晕、强烈的自然晕影以及轻微的曝光不足，营造原始的亲密氛围。

超写实的胶片摄影，前卫的杂志编辑美学，可见的织物纹理和反光金属细节，闪光灯发光的精致发丝，自然的皮肤纹理，整个过程中带有厚重的胶片颗粒，无塑料皮肤，无数字锐度，无喷枪，无水印，无文字，真实的35毫米胶片外观，具有强烈的颗粒和闪光伪影，模拟色彩分级。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/019-x-2044705257004093537/analog-35mm-police-fashion-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-95",
    title: "Aloof Elegance in Night Market Glamour",
    category: "人像摄影",
    industry: "通用",
    description: "a stunning beauty with a cool, aloof atmosphere, delicate facial features, a col",
    prompt: `a stunning beauty with a cool, aloof atmosphere, delicate facial features, a cold and sophisticated high-fashion face, long hair, and a graceful slender figure; barbecue “three-sword style” pose: one barbecue skewer held in her mouth, one skewer in each hand crossed to mimic Zoro’s three-sword style; street night scene ambiance, warm yellow night market lighting, blurred background, film-like texture, soft-focus glow, cinematic storytelling feel, trendy high-end influencer-style fashion shoot, clear luminous skin, sharply detailed strands of hair, lively dynamic expression, low-angle wide-angle shot, moody dark-toned atmosphere, shallow depth of field, ultra HD 8K, extreme detail, cinematic lighting`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGbbuNdacAAeoSZ.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-96",
    title: "Awakening Beauty: A Soft Morning Portrai",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 vertical — Japanese Fuji film style portrait, single subject Fujifilm analo",
    prompt: `9:16 vertical — Japanese Fuji film style portrait, single subject

Fujifilm analog aesthetic (Pro 400H / Superia feel), soft pastel tones, slight green-magenta shift, low contrast, gentle highlight roll-off, fine film grain, subtle halation

early morning indoor setting near window, soft curtains, fresh daylight

young Japanese female idol, natural minimal makeup, soft fresh skin texture

outfit: oversized shirt with loose shorts, relaxed homewear style, non-revealing

hair: slightly messy, natural volume, just-woke-up feeling

pose: sitting on bed edge or by window, body slightly leaning forward, shoulders relaxed; one hand loosely holding a small flower or fabric, the other resting naturally

expression: soft, slightly sleepy gaze, calm and natural

lighting: soft morning light, diffused, gentle shadows

mood: quiet, fresh, intimate everyday moment

quality: ultra-realistic, film grain, slight softness, natural imperfections`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGc0HfYaMAAEgPM.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-97",
    title: "Cinematic Confidence in Minimalism",
    category: "人像摄影",
    industry: "通用",
    description: "(IDENTIDAD FIJA + ESTILO EDITORIAL CINEMATOGRÁFICO) Base (IDENTIDAD — CRÍTICO): ",
    prompt: `(IDENTIDAD FIJA + ESTILO EDITORIAL CINEMATOGRÁFICO)
Base (IDENTIDAD — CRÍTICO):
Ultra-realistic full-body cinematic photograph of a person (replace with my exact face, gender, facial structure, proportions, and skin tone — strict identity preservation). Do NOT beautify, idealize, or stylize in a way that alters identity. Preserve natural asymmetries, pores, skin texture, eye shape, nose structure, lips, and all unique facial features. The result must look like a real photograph of me, not a reinterpretation.
Escena y composición: by Lagz.
A minimalist studio fashion portrait with a muted olive-green background and a soft beige floor. Full-body framing, subject standing slightly off-center with a relaxed but confident pose. One hand resting inside the pants pocket, another one is holding a small bouquet of slightly wilted flowers (soft pastel tones, subtle and understated). Body weight shifted to one leg for a natural asymmetrical stance.
Vestuario (clave del estilo):
Oversized brown blazer with soft structure and slightly dropped shoulders
Light beige or off-white button-up shirt, slightly wrinkled and loosely tucked
Thin brown tie, worn loosely and slightly off-center
High-waisted, wide-leg trousers with a subtle checkered pattern (brown tones)
Black leather shoes with a minimal, polished finish
Fit intentionally relaxed and androgynous, leaning toward editorial fashion styling.
Expresión y pose: by Lagz.
Neutral, introspective facial expression. Slightly distant gaze looking off-camera (not directly at viewer). Lips relaxed, eyes soft. Head slightly tilted upward or to the side, conveying calm confidence and quiet detachment.
Iluminación (muy importante):
Soft, diffused studio lighting with a cinematic feel.
Key light from one side (soft, indirect, large light source)
Gentle shadows, no harsh contrast
Subtle falloff across the body to create depth
Slight warm tone overall
Color y estética:
Muted, earthy color palette: olive green, beige, brown.
Low saturation, slightly desaturated cinematic grading.
Film-like color science (Kodak Portra / editorial magazine tone).
Soft contrast, slightly matte finish.
Lente y cámara:by Lagz.
Shot on 50mm or 85mm lens
Full-frame camera look
Slight depth of field but mostly sharp across subject
Editorial fashion photography quality
Texturas y detalles:
Visible fabric texture (wool blazer, soft cotton shirt, structured trousers).
Natural wrinkles and folds in clothing (important for realism).
Skin texture preserved (no plastic smoothing).
Estilo general:
High-end fashion editorial, minimalist, androgynous aesthetic, cinematic realism, subtle storytelling through pose and styling.
Negative prompt (MUY IMPORTANTE):
no beauty filter, no skin smoothing, no unrealistic symmetry, no exaggerated features, no cartoon, no anime, no over-sharpening, no glossy skin, no artificial lighting, no extreme contrast, no distortion, no identity change`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGj5LGGagAAKVoz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-98",
    title: "Duality of Elegance: A Portrait Split by",
    category: "人像摄影",
    industry: "通用",
    description: "The painting contains only one face: that of an elegant young female model with ",
    prompt: `The painting contains only one face: that of an elegant young female model with little grin. The line that runs from her hair parting to seamlessly split her face in half is designed to look like violently torn paper. The painting is perfectly, completely and forcibly divided into two parts by one flowing lines that resemble tears in the paper:
—Left side: Futuristic elegant pop art style with strategic cutie smile subtly.
—Right side: Hyper realistic beautiful natural style with smiling subtly.
—Right side: Her beautiful natural upper-body is drowned by totally beautiful marine-blue geometric halftone circles. style.

The background is futuristic dreamy. The entire screen is effectively bright and maintains natural vividness. The high resolution, fine details, and soft blur are reminiscent of an electron microscope.`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGkfXAKWwAANFvB.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-99",
    title: "Editorial Softlight Portrait in Minimal ",
    category: "人像摄影",
    industry: "通用",
    description: "{'format': '2:3 vertical', 'style': 'editorial fashion photography', 'quality': ",
    prompt: `{'format': '2:3 vertical', 'style': 'editorial fashion photography', 'quality': 'ultra-realistic, 8K, high detail', 'lighting': {'type': 'natural window light', 'direction': 'soft light entering from left side', 'intensity': 'bright but diffused', 'effects': 'gentle highlight bloom, soft shadows, subtle glow on skin'}, 'environment': {'location': 'minimal indoor studio', 'background': {'right_side': 'neutral textured light grey wall', 'left_side': 'large bright window', 'outside_view': 'overexposed soft daylight, minimal visible detail'}, 'mood': 'clean, elegant, airy, modern'}, 'subject': {'type': 'young woman', 'pose': {'position': 'leaning slightly against wall on right', 'body_angle': 'slightly turned toward camera', 'posture': 'relaxed yet confident', 'head_tilt': 'subtle, natural'}, 'expression': {'emotion': 'calm, soft, slightly seductive', 'gaze': 'direct or slightly off-camera', 'facial_details': 'natural skin texture, soft glow'}, 'appearance': {'hair': {'color': 'dark brown to black', 'style': 'soft updo', 'details': 'slightly loose strands framing face, natural volume'}, 'skin': {'texture': 'realistic, smooth but not overly retouched', 'tone': 'even, softly illuminated'}, 'makeup': {'style': 'minimal glam', 'details': 'subtle highlight, soft blush, lightly defined eyes, natural lip color'}}}, 'outfit': {'type': 'mini dress', 'color': 'white', 'material': 'sheer, lightweight fabric', 'design': {'style': 'off-the-shoulder', 'straps': 'tie straps on shoulders', 'sleeves': 'flared bell sleeves', 'fit': 'slightly fitted, softly draping over body', 'transparency': 'semi-sheer with tasteful layering'}}, 'accessories': {'jewelry': [{'type': 'necklace', 'style': 'delicate diamond necklace', 'effect': 'subtle sparkle'}, {'type': 'earrings', 'style': 'long dangling diamond earrings', 'effect': 'elegant shine, catches light'}, {'type': 'bracelet', 'style': 'thin diamond bracelet', 'placement': 'left wrist', 'effect': 'minimal, refined sparkle'}]}, 'camera': {'lens': '85mm portrait lens', 'aperture': 'f/1.8', 'focus': 'sharp focus on subject, soft background blur', 'depth_of_field': 'shallow', 'framing': 'subject centered slightly to right, window visible on left', 'angle': 'eye-level shot'}, 'post_processing': {'color_grading': 'soft neutral tones, slightly warm highlights', 'contrast': 'moderate', 'effects': ['subtle grain', 'gentle bloom on highlights', 'clean editorial finish'], 'retouching': 'minimal, preserving natural texture'}}`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGev-YSboAAKBdk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-100",
    title: "Elegance in the Everyday: A Modern Icon",
    category: "人像摄影",
    industry: "通用",
    description: "Ricoh GR3 Negative film, early 20s Chinese beautiful internet celebrity, natural",
    prompt: `Ricoh GR3 Negative film, early 20s Chinese beautiful internet celebrity, naturally attractive and elegant, subtle sensuality without explicit exposure, soft confident gaze, gentle and slightly teasing smile long wavy black hair with soft bangs, natural movement, realistic skin texture with soft glow outfit: fitted crop top with moderate neckline (no excessive exposure) + high-waisted mini skirt, clean silhouette, emphasizing waistline and body proportion in a tasteful way, 1990s Japanese street fashion inspired pose: standing casually on an urban street, relaxed posture, slight body curve, one hand lightly touching hair or resting near waist, natural candid stance scene: quiet Japanese city street at golden hour, warm sunlight, soft shadows, everyday urban elements (vending machine, street signs, sidewalk textures), lived-in atmosphere lighting: warm golden hour light, soft highlight bloom, subtle rim light, slight overexposure in highlights style: 35mm analog film aesthetic, soft grain, warm vintage color tones, slight color fade, gentle light leaks, low contrast mood: nostalgic, intimate, candid, effortlessly attractive, “caught in a real moment” feeling camera: eye-level or slightly low angle, medium shot (waist-up or thigh-up), slight handheld feeling, shallow depth of field quality: ultra-realistic, fine details, cinematic texture, natural imperfections preserved aspect: 9:16`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGkt82Qa4AA07Y0.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-101",
    title: "Enchanted Elegance: A Ghibli Princess by",
    category: "人像摄影",
    industry: "通用",
    description: "Detailed Ghibli-style portrait of a princess kneeling beside a koi pond brimming",
    prompt: `Detailed Ghibli-style portrait of a princess kneeling beside a koi pond brimming with glowing lotus blossoms. She wears a soft blue and cream kimono embroidered with swirling waves and fox spirits. A delicate paper parasol rests against her shoulder, and her hair is crowned with cherry blossom branches threaded with tiny rainbow prisms that scatter gentle light onto the water’s surface.`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGjNSBlXUAE6cN5.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-102",
    title: "Futuristic Confidence: A Portrait of Sty",
    category: "人像摄影",
    industry: "通用",
    description: "An ultra-realistic cinematic portrait of a stylish man and a low cut taper fade,",
    prompt: `An ultra-realistic cinematic portrait of a stylish man and a low cut taper fade, wearing futuristic black sunglasses and a brown leather shirt, standing in side profile with head tilted slightly upward, confident and calm expression, glowing orange and yellow gradient background with intense warm lighting, high-contrast golden rim light on the face and shoulders, soft haze glow around the subject, smooth skin texture, reflective highlights on leather fabric, editorial fashion photography style, moody and vibrant atmosphere, shallow depth of field, perfect color balance, -ar 4:5 -v 6-style raw -q 2-uplight--chaos 3`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGkF63EboAASLFX.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-103",
    title: "Golden Hour Street Portrait",
    category: "人像摄影",
    industry: "通用",
    description: "Ricoh GR3 Negative film, early 20s Chinese beautiful internet celebrity, natural",
    prompt: `Ricoh GR3 Negative film, early 20s Chinese beautiful internet celebrity, naturally attractive and elegant, subtle sensuality without explicit exposure, soft confident gaze, gentle and slightly teasing smile long wavy black hair with soft bangs, natural movement, realistic skin texture with soft glow outfit: fitted crop top with moderate neckline (no excessive exposure) + high-waisted mini skirt, clean silhouette, emphasizing waistline and body proportion in a tasteful way, 1990s Japanese street fashion inspired pose: standing casually on an urban street, relaxed posture, slight body curve, one hand lightly touching hair or resting near waist, natural candid stance scene: quiet Japanese city street at golden hour, warm sunlight, soft shadows, everyday urban elements (vending machine, street signs, sidewalk textures), lived-in atmosphere lighting: warm golden hour light, soft highlight bloom, subtle rim light, slight overexposure in highlights style: 35mm analog film aesthetic, soft grain, warm vintage color tones, slight color fade, gentle light leaks, low contrast mood: nostalgic, intimate, candid, effortlessly attractive, "caught in a real moment" feeling camera: eye-level or slightly low angle, medium shot (waist-up or thigh-up), slight handheld feeling, shallow depth of field quality: ultra-realistic, fine details, cinematic texture, natural imperfections preserved aspect: 9:16`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGkt82Qa4AA07Y0?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-104",
    title: "Intimate Moments: A Study in Analog Love",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 vertical — Japanese Fuji film style couple portrait, 3x3 grid (nine frames)",
    prompt: `9:16 vertical — Japanese Fuji film style couple portrait, 3x3 grid (nine frames), same couple in all images, consistent facial features and styling  Fujifilm analog aesthetic (Pro 400H / Superia feel), soft pastel tones, slight green-magenta shift, low contrast, gentle highlight roll-off, fine film grain, subtle halation, slight vignette  bright natural daylight, diffused sunlight through window, soft shadows, airy atmosphere  young Japanese couple, natural minimal makeup, realistic skin texture, slight imperfections  female outfit: oversized button-up shirt with loose shorts, relaxed fit, soft casual styling   male outfit: simple t-shirt or light shirt, clean and understated  hair: natural, slightly tousled for both  setting: minimal indoor near window, light curtains, clean soft background, everyday environment  camera: intimate distance, mostly waist-up framing, eye-level, slight handheld feel  lighting: diffused daylight, gentle highlight bloom, soft shadow transitions  mood: warm, natural, romantic, candid everyday intimacy  Frame breakdown (3x3 grid — varied actions):  Top row: - Top left: sitting side by side but slightly apart, both looking away, quiet moment - Top center: girl lightly pulling or adjusting the boy’s shirt collar, playful gesture - Top right: boy leaning behind her, chin slightly near her shoulder, relaxed closeness  Middle row: - Center left: girl resting her head lightly on his shoulder, calm and soft - Center: both laughing naturally, mid-motion candid moment - Center right: boy gently brushing or tucking her hair behind her ear  Bottom row: - Bottom left: girl sitting on bed or chair, boy standing close, looking down at her - Bottom center: girl leaning forward slightly, boy meeting her halfway, faces very close (almost touching, no explicit contact) - Bottom right: girl turning away slightly while holding his hand, subtle movement, natural connection  quality: ultra-realistic, analog film look, fine grain, slight softness, natural imperfections`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGetxS4bwAAC0r6.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-105",
    title: "Night Street Cafe Flash Portrait",
    category: "人像摄影",
    industry: "通用",
    description: "Nighttime street photography of a young blonde woman sitting at an outdoor cafe,",
    prompt: `Nighttime street photography of a young blonde woman sitting at an outdoor cafe, looking off-camera. She has a messy updo and glowing makeup. She is wearing a plunging black halter crop top, off-white high-waisted pants, and an oversized beige blazer draped over her shoulders. Accessorized with delicate layered gold necklaces and rings. She is leaning on a woven bistro chair. Warm, direct flash lighting, cinematic style, with a blurred dark city street and car lights in the background.`,
    tags: ["人像摄影"],
    image: "https://i.redd.it/vgeid2ctkwwg1.jpeg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-106",
    title: "Sage Green Tactical Editorial Portrait w",
    category: "人像摄影",
    industry: "通用",
    description: "A full-body cinematic portrait of a stylish bearded man standing confidently bes",
    prompt: `A full-body cinematic portrait of a stylish bearded man standing confidently beside a muscular pitbull dog, both facing sideways.

The man wears a modern quilted olive-green jacket with asymmetrical padding, layered over a minimalist green outfit and loose tactical cargo pants, paired with rugged high-top sneakers.

His hands are casually in his pockets, expression calm and focused, sharp jawline and well-groomed beard. The dog sits alert at his side, grey coat, cropped ears, wearing a black leather collar with metal studs, strong and loyal presence. Clean studio background in monochromatic sage green, soft diffused lighting, fashion editorial style, ultra-detailed fabric textures, realistic skin tones, shallow depth of field, high-end cinematic color grading, 85mm lens look, ultra-realistic, 8K quality, sharp focus, modern military fashion aesthetic.`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGf1B3SacAAPDZk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-107",
    title: "Twitch Live Portrait",
    category: "人像摄影",
    industry: "通用",
    description: "a pretty 21 year old mixed girl on Twitch Live with headphones on",
    prompt: `a pretty 21 year old mixed girl on Twitch Live with headphones on`,
    tags: ["人像摄影"],
    image: "https://i.redd.it/pb9c81nblmwg1.png",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-108",
    title: "Whispers of Innocence: A Korean Idol Por",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 vertical — Korean idol portrait photography, single subject soft black mist",
    prompt: `9:16 vertical — Korean idol portrait photography, single subject  soft black mist filter effect, lowered contrast, gentle highlight bloom, subtle glow, soft diffusion, slightly faded blacks  minimal indoor setting near window, white curtains, clean light-toned background  young Korean female idol, natural minimal makeup, dewy realistic skin texture, subtle imperfections  outfit: oversized white button-up shirt + short bottoms, slightly loose fit, soft and casual styling, no revealing elements  hair: long dark hair, slightly messy, natural volume, softly flowing  pose: relaxed standing or slight lean, body subtly angled, one leg slightly forward, shoulders relaxed; one hand lightly touching collar or resting near neckline, the other relaxed; gentle body curve without exaggeration  expression: soft cute smile, slightly playful eyes, direct or slightly off-camera gaze  camera: close to mid-body framing, eye-level, intimate distance, slight handheld feel  lighting: diffused natural daylight, soft shadows, gentle light wrapping around face and body  mood: cute yet subtly sensual, intimate, everyday softness, quiet romantic atmosphere  quality: ultra-realistic, fine film grain, slight softness at edges, natural imperfections, dreamy understated tone`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGaxLqdbkAAToA_.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-109",
    title: "便利店荧光灯胶片人像",
    category: "人像摄影",
    industry: "通用",
    description: "主题：一位顶级胶片摄影大师以35mm Kodak Portra 800胶片拍摄的极致电影感肖像，配合强烈便利店荧光灯与户外色彩霓虹灯，真实胶片颗粒感，高对比度，",
    prompt: `主题：一位顶级胶片摄影大师以35mm Kodak Portra 800胶片拍摄的极致电影感肖像，配合强烈便利店荧光灯与户外色彩霓虹灯，真实胶片颗粒感，高对比度，微微色彩偏移，街头电影式剪辑风格。主体描述：使用上传的参考图作为主要拍摄对象，面部特征、骨骼结构和自然肤质（可见毛孔）需100%匹配，不得改变种族或性别特征。细腻的肌肤质地和微毛孔，自然水润妆容，脸颊柔和泛红，光泽自然粉色唇唇微微张开，深棕色长发许多散发散落在脸颊和脖子周围。服装和姿态：她身穿着一件收腰紧身的白色短袖衬衫，搭配一条黑色百褶裙，脚穿着黑色亮面尖头细跟的高跟鞋，深夜靠在一家24小时便利店的玻璃门上，一只手拿着一瓶冰饮料，另一只手放在身后，目光既调皮又略带脆弱，目光直视观众，柔和的眼中充满了静谧温柔的微笑。场景设定：店内明亮的冷荧光灯与外面招牌的粉蓝色霓虹灯交织在一起，配以强烈的灯光和霓虹点缀，玻璃门上的真实倒影，模糊的便利店内部，背景中有货架和零食。镜头美学：Kodak Portra 800特有的温暖肤色与冷光对比、自然高光溢出与柔美过渡，35mm胶片独有的轻微晕光、颗粒与电影级质感，电影感构图，超高细节，8K极致真实质感。正向提示词：柔和的皮肤渲染，自然发丝，真实的布料褶皱和垂坠感，没有塑料皮肤，没有数字过度锐化，没有油腻的皮肤，地道的中国深夜便利店氛围。`,
    tags: ["人像摄影", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231804/f33d58876da60be503330d6e3eb99f19/spectrum/1040g0k031v8pcu8ohm0g5p3i1ckpep466h4ur6o!nd_prv_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-110",
    title: "便利店霓虹人像",
    category: "人像摄影",
    industry: "通用",
    description: "35mm胶片摄影，刺眼的便利店荧光灯与外面的彩色霓虹灯混合在一起，真实的胶片颗粒，高对比度，轻微偏色，电影街头编辑风格，亲密的中景，20岁出头的性感中国女偶像，",
    prompt: `35mm胶片摄影，刺眼的便利店荧光灯与外面的彩色霓虹灯混合在一起，真实的胶片颗粒，高对比度，轻微偏色，电影街头编辑风格，亲密的中景，20岁出头的性感中国女偶像，超写实精致的中国特色，诱人的杏仁形狐狸眼，自然的双眼皮，高鼻梁，小尖V形下巴，完美的瓷质皮肤，冷象牙底色和荧光灯下可见的镜面高光，微妙的皮肤纹理和微毛孔，自然水润的妆容，脸颊上有柔和的红晕，光泽自然的粉色嘴唇微微张开，鼻子和脸颊上有微妙的天然雀斑，深棕色的长发扎成凌乱的高马尾，有很多松散的发丝落在脸和脖子上，唯一的上衣穿着一件超大的白色系扣衬衫，上衣没有扣子，深乳沟，松散地系在腰间，搭配黑色的小百褶迷你裙，赤脚穿着简单的白色拖鞋，靠在玻璃门上的姿势诱人休闲深夜24小时营业的便利店，身体微微弓起，一腿弯曲，脚抵在门框上，另一腿伸直，一手拿着一瓶冰饮，一手轻轻拉着迷你裙的下摆，极度诱惑俏皮又略带脆弱的目光直视着观者，温柔的母鹿眼里充满安静的诱惑和挑逗的微笑，店内明亮的冷光荧光灯与外面招牌的粉色和蓝色霓虹灯混合在一起，玻璃门上的真实倒影，模糊便利店内部，背景是货架和零食，真实的 35 毫米胶片调色，刺眼的灯光和霓虹灯口音，极其锐利而柔软的皮肤渲染，自然的发丝，逼真的织物皱纹和超大衬衫和迷你裙的垂坠感，无塑料皮肤，无数字过度锐化，无喷枪，无瑕疵，无痣，无油性皮肤，无水印，无文字，真实的深夜便利店氛围`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/012-x-2045167461147042202/convenience-store-neon-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-111",
    title: "卧室镜子自拍人像",
    category: "人像摄影",
    industry: "通用",
    description: "一个十八岁的漂亮中国女孩，有着青春清纯的脸庞和逼真的肌肤纹理，坐在卧室一张舒适而略显凌乱的床上。她正在用智能手机对着镜子自拍，捕捉自然而亲密的时刻。穿着休闲的灰",
    prompt: `一个十八岁的漂亮中国女孩，有着青春清纯的脸庞和逼真的肌肤纹理，坐在卧室一张舒适而略显凌乱的床上。她正在用智能手机对着镜子自拍，捕捉自然而亲密的时刻。穿着休闲的灰色家居服和整洁的白色圆袜。柔和的自然光（黄金时段）从侧窗射入，营造出温暖、喜怒无常的电影氛围。 35 毫米镜头，镜子中的拍摄对象清晰对焦，景深优美，背景虚化（散景）。逼真、8K、高分辨率、工作室品质、杰作。
负面提示：没有多余的肢体，没有变形的手，没有模糊，没有噪音，没有水印，没有文字，没有卡通/动漫风格。长宽比：3:4。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/016-x-2045002808903020962/mirror-selfie-bedroom-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-112",
    title: "日本温泉旅馆人像",
    category: "人像摄影",
    industry: "通用",
    description: "35mm胶片摄影，温暖复古的日式温泉旅馆美学，柔和的木灯笼灯光与柔和的自然窗光混合，细腻的胶片颗粒，柔和的色移，高调的编辑风格，亲密的中景，20岁出头的美丽中国",
    prompt: `35mm胶片摄影，温暖复古的日式温泉旅馆美学，柔和的木灯笼灯光与柔和的自然窗光混合，细腻的胶片颗粒，柔和的色移，高调的编辑风格，亲密的中景，20岁出头的美丽中国女偶像，超写实精致的中国特色，诱人的杏仁形狐狸眼与自然的双眼皮，高鼻梁，小尖V形下颌线，完美的瓷质皮肤带有温暖的象牙色底色，可见微妙的皮肤纹理和微细毛孔，柔和自然的妆容带着露水的光泽，脸颊上有微妙的红晕，自然柔软的粉红色嘴唇微微分开，长长的深棕色头发扎成松散的低发髻，一些凌乱的发丝落在脸上和脖子上，穿着一件宽松的白色浴衣（日本传统浴袍）故意从肩膀上滑下来，松松地系在腰上，织物微微张开，露出光滑的皮肤和微妙的乳沟，赤脚，在老式温泉的传统木制远川阳台边缘摆出诱人的放松坐姿旅馆，身体微微转向镜头，一条腿弯曲，脚踩在木地板上，另一条腿轻轻悬垂，一手轻轻握住浴衣领子，另一只手支撑在身后的木地板上，轻轻弓起背部，轻轻突出曲线，强烈诱惑而又温柔诱人的目光直视观看者，柔和的母鹿眼睛充满安静的诱惑和温暖，温暖的木质内饰，纸质推拉门，远处热气腾腾的温泉，柔和的焦点，温柔的边缘灯光突出皮肤和织物纹理，正宗复古胶片暖色调调色，极其锐利而柔软的皮肤渲染，自然发丝，真实的织物皱纹和浴衣上的垂坠感，无塑料皮肤，无数字过度锐化，无喷枪，无瑕疵，无痣，无油性皮肤，无水印，无文字，正宗的35毫米胶片日本温泉旅馆氛围`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/015-x-2045092449803284923/japanese-onsen-ryokan-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-113",
    title: "柔光空气感 35mm 人像",
    category: "人像摄影",
    industry: "通用",
    description: "模拟35毫米胶片摄影，柔和通风的日式美学，柔和的漫射自然窗户光，轻微过度曝光，柔和的色调，低对比度，柔和的高光，靠近窗户的最小室内环境，白色窗帘，干净的浅色墙壁",
    prompt: `模拟35毫米胶片摄影，柔和通风的日式美学，柔和的漫射自然窗户光，轻微过度曝光，柔和的色调，低对比度，柔和的高光，靠近窗户的最小室内环境，白色窗帘，干净的浅色墙壁，自然构图，眼睛水平，稍微接近的全身取景（大腿中部到头部），年轻的东亚女性，自然简约的妆容，柔软逼真的皮肤纹理，略显凌乱的长黑发，超大的白色系扣衬衫，浅色休闲短裤，赤足，简单轻松的造型，以轻松的姿势自然站立，双臂放松地放在两侧或稍向后，面对镜头，温柔的微笑，微妙的静止，专注于光线、空气和安静的日常心情，柔和的胶片颗粒，梦幻而低调的氛围 --ar 9:16`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/001-x-2046115431144902732/soft-airy-35mm-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-114",
    title: "白色影棚网球编辑人像",
    category: "人像摄影",
    industry: "通用",
    description: "专业影楼时尚摄影，纯白无缝天幕摄影工作室超清高端数码编辑人像，巨量柔光八箱主光+大柔光箱补光打造完美均匀照明，柔和雕刻阴影，Vogue级极简高级时尚审美，平眼拍",
    prompt: `专业影楼时尚摄影，纯白无缝天幕摄影工作室超清高端数码编辑人像，巨量柔光八箱主光+大柔光箱补光打造完美均匀照明，柔和雕刻阴影，Vogue级极简高级时尚审美，平眼拍摄，3/4全身拍摄，20岁出头的韩国偶像型年轻女性，超写实精致精致的韩式五官，微微上翘的杏仁形狐狸眼，自然双眼皮，小尖下巴轮廓，完美而逼真的瓷质皮肤，带有凉爽的象牙色底色，完全自然的锻炼后免妆外观，脸颊上柔和自然的红晕，微汗带来的微妙水润肌肤光泽，自然的尘土玫瑰色嘴唇微微分开，鼻子和脸颊上微妙的自然雀斑，可见微妙的皮肤纹理，毛孔和微皮肤细节，自然波浪形的深棕色长发略显凌乱，逼真的松散发丝，穿着白色合身网球马球或短袖上衣和高腰白色运动裙，自然地站在纯白色的摄影棚中央，手握白色网球拍，随意搭在肩上，另一只手放松在侧或轻放在臀部，单腿微前倾，姿势自然自信，直视观看者的视线，表情平静、自信、清新，纯柔和的专业摄影棚灯光，大扩散光源，无瑕均匀的照明，柔和的雕刻阴影，自然地勾勒出身材，干净高调的极简美学，超干净的高端数码摄影，极其锐利而柔和的皮肤渲染自然露水光泽，无胶片颗粒，无噪音，无光晕，无晕影，完美的中性色彩分级，正宗韩国偶像工作室编辑美学，可见逼真的网球拍纹理，带有雀斑和微妙汗水光泽的自然皮肤纹理，无塑料皮肤，无数字过度锐化，无喷枪，无水印，无文字 --ar 9:16`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/030-x-2044846335728467996/white-studio-tennis-editorial-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-115",
    title: "A Journey Through Time: The Astronaut in",
    category: "海报",
    industry: "通用",
    description: "Pick a fictional female astronaut: Depict the same fictional female astronaut ch",
    prompt: `Pick a fictional female astronaut: Depict the same fictional female astronaut character in 20 different iconic art styles — Renaissance oil painting, ukiyo-e woodblock, Art Nouveau, Bauhaus, Soviet propaganda poster, comic book halftone, watercolor botanical, pixel art, vaporwave, Impressionist, Surrealist, Brutalist graphic design, Studio Ghibli, noir, cubism, pointillism, pop art, medieval illuminated manuscript, Art Deco, and photorealism — arranged in a 4 × 5 grid. She must be recognizably the same person in every tile. Label each style.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGbSVVhWQAAKyIz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-116",
    title: "Air Jordan: A Legacy in Motion",
    category: "海报",
    industry: "通用",
    description: "Create an epic poster showcasing the most iconic moments of Michael Jordan caree",
    prompt: `Create an epic poster showcasing the most iconic moments of Michael Jordan career. epic, cinematic, lens flare`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGdQsjBXoAE5Jw-.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-117",
    title: "Amalfi Coast Vintage Travel Poster",
    category: "海报",
    industry: "通用",
    description: "Modern pencil illustration of Vintage travel poster illustration of the Amalfi C",
    prompt: `Modern pencil illustration of Vintage travel poster illustration of the Amalfi Coast, Italy, panoramic coastal cliff road scene, classic 1960s white car driving along a curved seaside road, deep blue Mediterranean sea with small sailboats, colorful pastel hillside village, bright blue sky with soft clouds, lemon tree branches with vibrant yellow lemons framing the foreground, warm summer sunlight, bold vibrant colors, retro 1950s travel poster style, cinematic composition, high detail, screen print texture, graphic illustration. Hand-drawn style, illustration with loose strokes and defined contours. High-contrast color palette, maintaining chromatic harmony between background and elements. Contemporary and decorative aesthetic.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HF--qboXoAA8isD?format=jpg&name=4096x4096",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-118",
    title: "French New Wave Movie Poster",
    category: "海报",
    industry: "通用",
    description: "1960s French New Wave theatrical poster, bold photomontage composition, torn-pap",
    prompt: `1960s French New Wave theatrical poster, bold photomontage composition, torn-paper collage sensibility, pop-art color bursts, high-contrast black-and-white imagery with selective red blue and yellow accents, hand-made offset-print texture, slightly off-register ink, expressive asymmetry, art-house poster cool, graphic spontaneity, street-poster energy, adventurous typography-led design.

Poster text:
- Large title at the bottom: "GPT Image 2.0"
- Smaller headline at the top: "Image generation with a point of view"
- Small footer text: "Coming soon"
Keep all visible text in English. Use a theatrical poster composition.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGeimRSXoAA6X6k?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-119",
    title: "GPT image 2生成城市宣传海报。效果也太惊艳了吧！",
    category: "海报",
    industry: "通用",
    description: "一张充满新春喜庆氛围但不失高雅格调的 2026 城市宣传海报。 双重曝光，构图延续了S型的流动感；",
    prompt: `一张充满新春喜庆氛围但不失高雅格调的 2026 城市宣传海报。
双重曝光，构图延续了S型的流动感；`,
    tags: ["海报", "中文"],
    image: "https://pbs.twimg.com/media/HGMFZP3asAEhQyj.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-120",
    title: "Illustrated Lyrics Autumn Candle Poster",
    category: "海报",
    industry: "通用",
    description: "Watercolor and opaque watercolor painted on warm-toned textured paper, with soft",
    prompt: `Watercolor and opaque watercolor painted on warm-toned textured paper, with soft and full brushstrokes, pigments naturally bleeding and diffusing on wet paper. The light source comes from a low point on the right side of the frame—a warm candlelight that bathes the entire scene in amber and caramel tones, gradually fading into the blue-gray hues of an autumn dusk at the edges. Maple red, candle yellow, and twilight blue-purple form the main palette, with fuzzy color bleeds at the pigment edges, like the boundaries of memory. An emotion where longing and tenderness coexist—not a sharp pain, but a lingering warmth, like holding a fallen leaf and being reluctant to let go. Falling maple leaves and burning candle flames serve as mutual metaphors: one departing, the other keeping vigil. A girl of about twelve sits alone at a wooden table, a short candle lit on the table with a small, steady flame. She turns sideways to gaze out the window, where a few maple leaves are stuck to the glass, some already semi-transparent. Outside the window is a gray-blue autumn dusk, with one or two maple leaves drifting slowly downward; the indoor candlelight gilds her profile in warm gold, forming a gentle contrast with the cool tones outside. The bottom third of the frame leaves a warm beige blank band, presenting a text block in soft handwritten running script: the character "枫" centered, large and expansive in size, with subtle variations in ink density in the strokes; below it, "缓缓飘落的枫叶像思念 / 我点燃烛火温暖岁末的秋天" arranged horizontally in a moderate size, with loose spacing between characters—the two lines overall like an inscription on poetic stationery, the deep brown ink clear and warm on the warm beige background. The illustration scene recedes upward, with candlelight and maple leaves encircling the text; the text and image breathe together, drawing the eye immediately to these two lines.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGkpZXebMAAwqHl?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-121",
    title: "Monochrome Sports Mosaic Tribute Poster",
    category: "海报",
    industry: "通用",
    description: "[PERSON NAME]. Act as a high-end sports graphic designer creating a conceptual t",
    prompt: `[PERSON NAME]. 
Act as a high-end sports graphic designer creating a conceptual tribute poster. The style is a complex "dual exposure photo-grid composite" with mixed-media textures.
CENTRAL STRUCTURE (THE VESSEL):
The central focus is a large-scale, high-contrast black and white portrait silhouette of [PERSON NAME]. This main portrait acts as the container.
THE GRID FILL & TEXTURES (MIXED MEDIA):
The interior of the silhouette is populated by a dense "photo mosaic grid" of action shots from the person's career.
CRITICAL TEXTURE INSTRUCTION: Do not just paste flat photos. Apply artistic textures to various grid cells to create a tactile, collage feel. Use effects like:
Halftone Dots: Comic-book style raster patterns on some cells.
Fabric/Embroidery: Subtle thread or canvas textures suggesting a jersey or patch.
Film Grain: Heavy noise on specific high-contrast action shots.
COLOR STRATEGY:
The base is Monochrome B&W. Use selective color overlays (relevant to the team/flag) ONLY on specific grid cells to create a rhythm.
TYPOGRAPHY & BRANDING (STRICT MICRO-SCALING):
Top Left (The Name): Write "[PERSON NAME]" strictly using the font Inter Semibold.
Kerning: Tight negative kerning (-4%).
Size: SMALL and discreet. It must occupy MAXIMUM 20% of the canvas width. Do NOT make it large or loud.
Top Right (The Symbol): Place the primary logo (Team/Brand/Flag).
Size: VERY SMALL. It must occupy MAXIMUM 10% of the canvas width.
COMPOSITION & BACKGROUND:
Background: Off-white or light grey with a visible high-quality paper or concrete texture. It should not be flat digital white.
Alignment: Center the figure perfectly. Maintain wide negative space around the object.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGhU6wbboAAHC4C.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-122",
    title: "Mr Bean Career Poster",
    category: "海报",
    industry: "通用",
    description: "Create an epic poster showcasing the most iconic moments of mr bean career. epic",
    prompt: `Create an epic poster showcasing the most iconic moments of mr bean career. epic, cinematic, lens flare (4:5 aspect ratio)`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGlQHv0WUAEslRu?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-123",
    title: "No portrait today but something differen",
    category: "海报",
    industry: "通用",
    description: "A striking Spring 2026 city poster for Boston with an elegant celebratory mood a",
    prompt: `A striking Spring 2026 city poster for Boston with an elegant celebratory mood and a bold contemporary design. On a clean off-white textured background with large areas of negative space, a miniature`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGKSHWzbEAAVYPR.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-124",
    title: "Noir Ink Dissolve Portrait with Red Halo",
    category: "海报",
    industry: "通用",
    description: "Subject & Composition: Central Figure: A sharp profile view of a man wearing a c",
    prompt: `Subject & Composition:

Central Figure: A sharp profile view of a man wearing a classic 1940s fedora and a formal suit.

Melting Effect: The lower half of the man's torso should dissolve or "drip" into long, vertical black ink streaks and splatters, creating a surreal, liquid-bleed effect against the background.

Graphic Element: A large, solid vibrant red circle is positioned directly behind the man's head and shoulders, creating a "halo" or "rising sun" motif that anchors the composition.

Style & Color Palette:

Color Scheme: A strict minimalist palette of True Red, Deep Black, and Off-White/Cream.

Photography Style: High-contrast, black and white film noir photography for the subject. The texture should look like a high-resolution fashion editorial with a shallow depth of field.

Background: A clean, slightly textured off-white paper or canvas background to give it a premium, physical poster feel.

Technical Details:

Lighting: Strong "Rembrandt" lighting to define the facial contours, emphasizing the bridge of the nose and the jawline with deep shadows.

Atmosphere: Somber, intellectual, and high-stakes. The design should feel modern yet period-accurate to the mid-20th century.

Framing: Vertical poster orientation (A-frame), with significant negative space on the left and right to emphasize the central vertical axis.

Aspect ratio is 9:16`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGj-bkuakAAp6t3.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-125",
    title: "Sagittarius Dissection: A Steampunk Expl",
    category: "海报",
    industry: "通用",
    description: "（Steampunk Scientific Illustrator）你是一位专业复古蒸汽朋克解剖图谱设计师，擅长星座机械结构科普海报。根据用户指定的【{cons",
    prompt: `（Steampunk Scientific Illustrator）你是一位专业复古蒸汽朋克解剖图谱设计师，擅长星座机械结构科普海报。根据用户指定的【{constellation_name}】，生成一张复古蒸汽朋克风格星座解剖图谱海报：顶部标题栏为“{constellation_name}解剖图谱”或“ANATOMIA {constellation_en}”，采用复古丝带横幅设计；背景为做旧羊皮纸/泛黄旧纸张纹理，带自然污渍与折痕，营造复古科学手稿质感；中心主体为该星座经典神话形象，内部结构替换为精密齿轮、管线、金属骨骼等蒸汽朋克元素；所有图标与插画为手绘线稿风格，用箭头或连线展示逻辑关系；主色调为暖棕、米黄、古铜色，点缀少量高对比色彩突出重点；画面分左右两栏，中心为主体形象，两侧分布功能模块，底部为总结与表格。左侧含3-5个功能模块（含图标、标题、描述）及“五层性格结构”分层图示；右侧含3-5个特质模块（含图标、标签）及“Relationship classification”“Ecological niche”板块；底部设“Advantages/Risks comparison table”优势风险对比表、“Survival guide”生存指南、底部人生哲学宣言横幅。整体严谨精致、复古机械美学，文字清晰可读 4K高清，直接出图，星座为【射手座 / Sagittarius】。`,
    tags: ["海报", "中文"],
    image: "https://pbs.twimg.com/media/HGbkTi4bAAAkncH.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-126",
    title: "The Eight Immortals in Timeless Detail",
    category: "海报",
    industry: "通用",
    description: "（国风卷轴插画师）你是一位顶尖的中国传统工笔人物画师，擅长将经典人物群像绘制成长卷式百科海报。根据用户指定的【eight immortals】，生成一张 “中国",
    prompt: `（国风卷轴插画师）你是一位顶尖的中国传统工笔人物画师，擅长将经典人物群像绘制成长卷式百科海报。根据用户指定的【eight immortals】，生成一张 “中国传统人物群像长卷海报”：画面为横向长卷式构图，所有人物排成一条队列，从左至右依次展开；每个人物都有鲜明的传统服饰、标志性道具和神态，下方配有竖排名牌标注姓名；卷轴顶部有醒目的书法标题；背景为符合主题的场景元素（如祥云、海浪、山水、亭台等）。整体为高质量国风工笔插画：细腻线稿 + 雅致上色，浅米色 / 宣纸质感背景；注释为清晰的中文书法字体；横向 4K 长卷海报，构图均衡，人物分明，氛围贴合主题（如仙气、豪迈、温婉等）。直接出图，人物群像为【eight immortals】。`,
    tags: ["海报", "中文"],
    image: "https://pbs.twimg.com/media/HGbW4NTbsAA8yxt.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-127",
    title: "Transforming Childhood Art into Cinemati",
    category: "海报",
    industry: "通用",
    description: "<instruction> Role: You are \"The Imagination Translator,\" turning naive drawings",
    prompt: `<instruction> Role: You are "The Imagination Translator," turning naive drawings into polished fantasy IP.  Input: A childlike drawing or very simple doodle.  Goal: Produce: 1) A cinematic movie poster. 2) A character trading card. (Both based on the same character/creature.)  Phase 1: Interpretation - Analyze shapes, colors, and any text in the drawing. - Decide what the scribble represents (creature, hero, vehicle, world). - Preserve key color palette and silhouette.  Phase 2: World & Character - Name the character and the world or city they’re from. - Write a one-sentence logline for the “movie”. - Define 3 abilities or traits.  Phase 3: Visual Output 1 – Movie Poster - Epic vertical poster. - Central, refined version of the character, posed heroically. - Background shows a hint of the world (city, forest, galaxy, etc.). - Include title, tagline, and fake credits line at bottom.  Phase 4: Visual Output 2 – Trading Card - Single card design. - Character full-body or bust. - Card frame with name banner, stats, and icon for each ability. - Style: colorful, kid-friendly, slightly glossy.  Phase 5: Output Provide: - Character name, logline, and abilities. - Two separate detailed prompts:   - Prompt A: Movie poster.   - Prompt B: Trading card.  Output: A mini IP package that upgrades a child’s drawing into a full-blown franchise concept. </instruction>`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGjDb9YXIAAdGZD.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-129",
    title: "大猩猩知识工作者电影海报",
    category: "海报",
    industry: "通用",
    description: "创作一张关于大猩猩混入人类城市并成长为知识工作者的电影海报。海报文字必须使用日语，并且要有强烈的信息密度。",
    prompt: `创作一张关于大猩猩混入人类城市并成长为知识工作者的电影海报。海报文字必须使用日语，并且要有强烈的信息密度。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/022-x-2044634519928783238/gorilla-knowledge-worker-movie-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-130",
    title: "小悪魔リリムリリィ 游戏海报",
    category: "海报",
    industry: "通用",
    description: "小悪魔リリムリリィちゃんが スーパーファミコンのゲームだったときのポスターを考えて",
    prompt: `小悪魔リリムリリィちゃんが　スーパーファミコンのゲームだったときのポスターを考えて`,
    tags: ["海报"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231804/b9210063692ededf907d940e13d94ea8/1040g00831va3te8c3qbg5pp4kue7dn4k0vuu77o!nd_prv_wgth_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-131",
    title: "広告クリエイティブ制作 ポスター",
    category: "海报",
    industry: "通用",
    description: "以下の文字を必ず入れて、1:1のポスターを作成してください。書籍・講座・イベント告知に使える、プロの広告デザイナーが作ったような高品質な仕上がりにしてください。",
    prompt: `以下の文字を必ず入れて、1:1のポスターを作成してください。書籍・講座・イベント告知に使える、プロの広告デザイナーが作ったような高品質な仕上がりにしてください。

広告クリエイティブ制作
思いついたら、もう遊べる。 AI×ブラウザゲームづくりは、マジで楽しい。 むずかしそうで、実ははじめやすい。 コードがわからなくても、はじめの一本は作れる`,
    tags: ["海报"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231804/a4ac84e6ea006cf07ff52c4968054067/1040g00831va3te9p2q5g5pp4kue7dn4k6907gdg!nd_dft_wgth_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-132",
    title: "春天广州城市海报",
    category: "海报",
    industry: "通用",
    description: "制作一张 2026 年城市宣传海报，既具有农历新年的喜庆气息，又不失优雅精致。采用双重曝光概念，让构图具有S形的流动感。在纯白色的纹理背景上，右下角放置一个身着",
    prompt: `制作一张 2026 年城市宣传海报，既具有农历新年的喜庆气息，又不失优雅精致。采用双重曝光概念，让构图具有S形的流动感。在纯白色的纹理背景上，右下角放置一个身着中国传统服饰、挥舞着红色长丝带的微型人物。当丝带在空中向上和向左移动时，它会神奇地变成雄伟的山河景观。在那条流动的“河流”之中，叠加了一幅手绘的广州地图，有山有水，富有民族风格的设计和视觉上的宏伟。包括广州塔、珠江新城天际线、珠江、老城区建筑、游船和白云山等广州著名地标。用云和雾包围构图，营造出仙境般的氛围。使用丰富的色彩、复杂的结构和丰富的细节，但通过宽敞的负空间保留干净、通风的感觉。左下角印有“SPRING 2026”文字，并竖排宣传口号，传达“千年商都，魅力广州”的理念。版式应该优雅、大方、清晰且清晰易读。宽高比 9:16。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/009-x-2045484598487060917/spring-guangzhou-city-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-133",
    title: "极简新中式 S 形海报",
    category: "海报",
    industry: "通用",
    description: "采用极简新中式美学，浅灰白色底色，立体剪纸浮雕感。用S形撕开的开口分割构图，仿佛一张纸被撕开，露出里面多彩的东方风景。在开口内，一条蜿蜒的河流从上到下流淌，呈现",
    prompt: `采用极简新中式美学，浅灰白色底色，立体剪纸浮雕感。用S形撕开的开口分割构图，仿佛一张纸被撕开，露出里面多彩的东方风景。在开口内，一条蜿蜒的河流从上到下流淌，呈现出分层的蓝色色调，就像一条流动的丝带。河两岸，加上柔和的青山和绿红交织的梯田，传达出静谧的田园意境。传统的河边建筑，飞檐、白墙、深色瓦顶，光线充足，给人优雅、永恒的感觉。添加茂密的树木和停在水中央的小船。整个构图由S形曲线驱动，让自然与人类文化有韵律地融合在一起。外边缘应使用撕纸效果来创造雕塑般的浅浮雕印象。底部有书法标题“东方美学”、日期“2026/04/18”、红色印章、“CHINA”字样，以及微妙的结束位置的签名“@LIYUE”。气氛应该让人感到安静、诗意和沉思。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/006-x-2045368305079447853/chinese-minimalist-s-shaped-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-134",
    title: "波士顿 2026 春季城市海报",
    category: "海报",
    industry: "通用",
    description: "波士顿 2026 年春季引人注目的城市海报，具有优雅的庆祝气氛和大胆的现代设计。在干净的灰白色纹理背景上，有大面积的负空间，一个微型单桨划过图像的右下角，在一条",
    prompt: `波士顿 2026 年春季引人注目的城市海报，具有优雅的庆祝气氛和大胆的现代设计。在干净的灰白色纹理背景上，有大面积的负空间，一个微型单桨划过图像的右下角，在一条狭窄的反光水带上。桨的尾流以动态的书法曲线向上扫过，逐渐变成查尔斯河，然后变成梦幻般的波士顿手绘全景。在这个流动的河流形状的构图中，有标志性的波士顿元素：后湾天际线、灯塔山褐石建筑、橡子街、波士顿公共花园、天鹅船、扎基姆桥、芬威风格的细节、历史悠久的砖砌建筑、港口渡轮和城市的海滨氛围。柔和的晨雾，金色的春光，深红与金色的微妙喜庆气息，丰富的细节，层次分明，精致的城市海报美学，清新脱俗，视觉冲击力强却不显得拥挤。左下角优雅的排版写着“SPRING 2026”，垂直标语“BOSTON, A CITY OF RIVER, MEMORY, AND Invention”，文字清晰，构图精美，优质的图形设计，9:16`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/004-x-2045358053831172358/boston-spring-2026-city-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-135",
    title: "燕云十六声双重曝光海报",
    category: "海报",
    industry: "通用",
    description: "生成一张高完成度、收藏版、史诗叙事感的艺术海报，主题为《燕云十六声》。采用双重曝光式剪影叙事构图：以一位古风侠客的巨大侧脸剪影作为整体外轮廓，人物气质冷峻、孤绝",
    prompt: `生成一张高完成度、收藏版、史诗叙事感的艺术海报，主题为《燕云十六声》。采用双重曝光式剪影叙事构图：以一位古风侠客的巨大侧脸剪影作为整体外轮廓，人物气质冷峻、孤绝、沉静，发丝与衣袍微微扬起，具有浓烈的乱世江湖气息。剪影内部不是普通拼贴，而是自动生长出一个完整而统一的燕云十六声世界观：苍凉辽阔的北地山河、古城楼与残破关隘、风沙古道、雪夜客栈、竹林、荒村、寺庙佛窟、战场遗迹、屋檐飞檐、江湖侠客对峙、持剑独行的身影、骏马、长枪、刀剑、古琴、机关、乌鸦、火光、旌旗、烟尘与风雪等标志性元素，同时融入“乱世、武侠、孤旅、宿命、忠义、悲歌、家国与江湖交织”的核心情绪。整体画面强调高级的轮廓填充式叙事合成，不是杂乱堆砌，而是统一、克制、富有联想性，兼具电影海报气质与梦幻水彩插画质感。色彩以苍青、黛黑、土褐、灰金、冷白、暗红点缀为主，营造出苍凉、肃杀、悲壮、神秘、诗意、怀旧、传说感的氛围。画面具有柔和空气透视、轻雾化过渡、宣纸颗粒、飞白边缘、刷痕肌理、大面积留白，版式克制而高级，像正式院线级动画电影海报，视觉中心明确，一眼识别《燕云十六声》，不要廉价奇幻素材感，不要模板化背景，不要生硬拼贴，整体必须安静、宏大、沉浸、东方审美浓郁，竖版海报构图。`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231804/967b42f578f7b1a6eb923cb645ba1112/spectrum/1040g34o31v90fqbcjm9g5or27n57r1ck95ahc78!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-138",
    title: "西安美食高端城市海报",
    category: "海报",
    industry: "通用",
    description: "2026中国城市视觉海报，主题：西安美食，竖版9:16，高端商业广告风格（premium luxury food key visual）。【整体风格】极简、高级",
    prompt: `2026中国城市视觉海报，主题：西安美食，竖版9:16，高端商业广告风格（premium luxury food key visual）。【整体风格】极简、高级、克制；视觉风格接近奢侈品牌广告/高端文旅KV；深色背景（黑/深棕/炭灰）+局部暖金点缀；整体色彩控制严格，避免杂乱。【构图（核心）】中心构图+大面积留白；主体集中在画面中下部；画面稳定干净，具有品牌视觉秩序；避免复杂拼贴，强调单一视觉冲击。【主视觉食物】油泼面作为唯一核心主体；食物放大特写，占据视觉中心；面条被筷子提起形成优雅弧线；辣油、蒜末、香料细节清晰可见；质感真实，具有食欲冲击力。【动态设计（高级处理）】用“控制感”的动态，而不是混乱：少量辣椒油飞溅、香料颗粒在空中悬浮、蒸汽形成柔和流动；整体动势围绕主体旋转。【文化融合（弱化处理）】背景中极淡融合西安大雁塔轮廓（低透明度）；只做气氛层，绝对不能抢主体。【光影（决定高级感）】单一方向侧上方光；食物高光精致，油脂反光真实；背景压暗突出主体；低调对比，高级灰控制；避免过曝与HDR感。【材质与质感】碗具为粗陶质感高端陶瓷；桌面为深色哑光石材；整体质感真实细腻，有可触感。【排版（品牌级重点）】奢侈品牌式极简排版；顶部留白区域：小字“XI'AN CUISINE”，大字主标题“XI'AN”，副标题“TASTE OF CHANG'AN”；中文小字“千年长安 一味入魂”；右下角小方形红色印章“西安”；文字间距大，有呼吸感，不拥挤。【质量要求】8K超高分辨率，极致细节；边缘锐利；画面干净无杂乱元素；真实摄影+艺术化处理；整体统一精致高级。`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231804/00b6f661c118d43154f9bfa538968b27/notes_pre_post/1040g3k831v93b2l0ii005pekggahefj50h9aer0!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-139",
    title: "西楚霸王·项羽 双重曝光史诗海报",
    category: "海报",
    industry: "通用",
    description: "生成一张高完成度、收藏版、史诗叙事感的艺术海报，主题为《西楚霸王·项羽》。采用双重曝光式剪影叙事构图：以一位古代霸主的巨大侧脸剪影作为整体外轮廓，人物形象为项羽",
    prompt: `生成一张高完成度、收藏版、史诗叙事感的艺术海报，主题为《西楚霸王·项羽》。采用双重曝光式剪影叙事构图：以一位古代霸主的巨大侧脸剪影作为整体外轮廓，人物形象为项羽，气质雄浑、桀骜、悲壮且不可一世，眉目凌厉，带有英雄末路的苍凉感；发丝飞扬，披风猎猎，在风中翻卷，呈现出强烈的战场张力与宿命压迫感。

剪影内部不是普通拼贴，而是自动生长出一个完整而统一的楚汉争霸史诗世界：乌江岸边的苍凉水域、垓下战场的残破军阵、楚军营帐、汉军旌旗压境、火光与狼烟、战鼓与号角、铁骑冲锋、万军对峙、尸横遍野的古战场、断裂的兵器、长戟与重剑、战马嘶鸣、夜色下的四面楚歌、虞姬起舞的剪影、霸王持剑独立的身影等关键意象。

整体画面需融入“霸业、覆灭、英雄悲歌、力拔山河、宿命抗争、孤勇、爱情与家国破碎”的核心情绪，使历史厚重感与个人命运交织，形成强烈的视觉冲击与情绪张力。`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604232011/368cf513c681246d175a0a934bb71928/spectrum/1040g34o31v98ls1740405nncdmt0bpshva389i8!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-140",
    title: "诗歌印象海报 Prompt",
    category: "海报",
    industry: "通用",
    description: "以这首诗为蓝本 创造有趣的印象海报 强调解构主义 新存在主义摄影拼贴 用最新的image 2",
    prompt: `以这首诗为蓝本 创造有趣的印象海报
强调解构主义 新存在主义摄影拼贴 用最新的image 2`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604231917/198913a9f165785b60a30734c9a58f9b/note_pre_post_uhdr/1040g3r831v87bjfmig8g5ps0usri3dod8ldp350!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-141",
    title: "阿马尔菲海岸复古旅行海报",
    category: "海报",
    industry: "通用",
    description: "意大利阿马尔菲海岸复古旅行海报插图的现代铅笔插图，全景沿海悬崖路场景，经典的 1960 年代白色汽车沿着弯曲的海滨路行驶，深蓝色的地中海与小帆船，色彩缤纷的柔和",
    prompt: `意大利阿马尔菲海岸复古旅行海报插图的现代铅笔插图，全景沿海悬崖路场景，经典的 1960 年代白色汽车沿着弯曲的海滨路行驶，深蓝色的地中海与小帆船，色彩缤纷的柔和山坡村庄，明亮的蓝天与柔软的云彩，柠檬树枝与充满活力的黄色柠檬构成前景，温暖的夏日阳光，大胆鲜艳的色彩，复古 1950 年代旅行海报风格，电影构图，高细节，丝网印刷纹理，图形插图。手绘风格，插图具有宽松的笔画和明确的轮廓。高对比度调色板，保持背景和元素之间的色彩和谐。当代和装饰美学。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/031-x-2044562722491121718/amalfi-coast-vintage-travel-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-142",
    title: "Tropical Sparkling Water Can Product Sho",
    category: "产品视觉",
    industry: "通用",
    description: "A professional product photography shot of a cold sparkling water can placed upr",
    prompt: `A professional product photography shot of a cold sparkling water can placed upright in golden beach sand. The can is silver and teal, covered in realistic water droplets condensation, with a pineapple illustration and tropical branding. The can is slightly tilted, planted in a small mound of fine golden sand with tiny white pebbles and small green tropical leaves/grass scattered around the base. Background features a bold split composition - bright sky-blue on the left and vivid yellow on the right, with a large blurred real pineapple placed behind the can on the right side. A blurred tropical palm leaf drapes in from the upper left corner, adding depth and framing. Macro-level water condensation droplets visible on the can surface. Lighting is bright, vibrant, commercial studio lighting with clean shadows. Shallow depth of field - can in sharp focus, background softly blurred. Mood: summer, tropical, fresh, refreshing. Commercial product photography, ultra-detailed, 8K.`,
    tags: ["产品视觉"],
    image: "https://pbs.twimg.com/media/HGk2PldaEAE0u_f?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-143",
    title: "无盖香水瓶",
    category: "产品视觉",
    industry: "通用",
    description: "第 1 阶段 — 形状：固体[材料]玻璃泪滴，无盖，无喷嘴，无可见开口 — 气味透过玻璃渗透 第 2 阶段 — 表面：[表面处理] 外观，[纹理] 触感，河石的",
    prompt: `第 1 阶段 — 形状：固体[材料]玻璃泪滴，无盖，无喷嘴，无可见开口 — 气味透过玻璃渗透

第 2 阶段 — 表面：[表面处理] 外观，[纹理] 触感，河石的重量

第 3 阶段 — 照明：[方向] 的 [光源]，投射 [阴影类型]

第 4 阶段 — 设置：[背景]、[审美] 编辑质量

交换：[材料] / [表面处理] / [美学]`,
    tags: ["产品视觉", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/020-x-2044652764945338452/capless-perfume-bottle-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-144",
    title: "35mm 闪光灯编辑肖像",
    category: "文字渲染",
    industry: "通用",
    description: "35mm彩色胶片摄影，严酷的机上闪光灯，皮肤和衣服上的镜面高光，眼睛的强烈聚光，高对比度的闪光照明，真实的胶片颗粒和色彩偏移，时尚清新无辜的篮球场编辑风格，亲密",
    prompt: `35mm彩色胶片摄影，严酷的机上闪光灯，皮肤和衣服上的镜面高光，眼睛的强烈聚光，高对比度的闪光照明，真实的胶片颗粒和色彩偏移，时尚清新无辜的篮球场编辑风格，亲密的第一人称低角度视角从下面拍摄，20岁出头的性感中国女偶像，超写实精致的中国特色，诱人的杏仁形狐狸眼，自然的双眼皮，高高的鼻梁，小尖的V形下颌线，完美无瑕的逼真瓷皮皮肤清凉的象牙色底色和明显的闪光镜面高光，细腻的肌肤纹理，微妙的毛孔微细节和闪光下的自然露水光泽，清新自然的运动妆容，柔和的水润光泽，脸颊上有微妙的自然红晕，自然的粉红色嘴唇微张，鼻子和脸颊上有微妙的自然雀斑，长长的深棕色头发扎成高俏皮的马尾辫，一些松散的发丝勾勒出脸型和逼真的松散的发丝，穿着宽松的白色背心和白色高腰篮球短裤，白色及膝运动袜，黄昏时室外球场上篮球架自然倾斜的诱人姿势，身体侧倾，背部自然拱起，臀部轻轻向后推，凸显挺括的圆臀和性感的臀部曲线，一腿自然向前伸向镜头，另一腿微弯，凸显修长性感双腿，双手轻轻搭在与肩同高的篮球杆上，极度诱惑的俏皮又可怜的母鹿般的目光直视着观众，眼神温柔脆弱渴望，充满安静诱惑和欲望的温柔挑逗的微笑，刺眼的机上直闪产生锐利的镜面高光和强烈的聚光灯，黄昏天空下模糊的篮球场和篮圈背景，自然闪光外观的高对比度胶片调色，极其锐利而柔软的皮肤渲染，真实的35毫米直闪美学，自然的发丝，背心和短裤上真实的织物纹理，带有袜子细节，无塑料皮肤，无数字过度锐化，无喷枪，无瑕疵，无痣，无油皮，无水印，无文字，正品35mm直闪膜篮球场外观--ar 9:16`,
    tags: ["文字渲染", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/010-x-2045052982728016131/35mm-flash-editorial-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-145",
    title: "Eclipse 机器人宇宙战机角色设定表",
    category: "文字渲染",
    industry: "通用",
    description: "为一位可变形为流线型宇宙战斗机的女性安卓角色制作角色设计设定表，所有文字都使用韩语。",
    prompt: `为一位可变形为流线型宇宙战斗机的女性安卓角色制作角色设计设定表，所有文字都使用韩语。`,
    tags: ["文字渲染", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/site-additions/061-x-discussions-eclipse-android-spaceship-character-sheet/eclipse-android-spaceship-character-sheet-1.webp",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-146",
    title: "宋代社交媒体信息流",
    category: "文字渲染",
    industry: "通用",
    description: "创建一个名为“宋朝社交媒体提要”的界面设计，将历史中国与现代社交媒体幽默融为一体。该图像应模拟智能手机社交媒体界面，但每条内容都应来自宋朝。以宋代文人肖像为头像",
    prompt: `创建一个名为“宋朝社交媒体提要”的界面设计，将历史中国与现代社交媒体幽默融为一体。该图像应模拟智能手机社交媒体界面，但每条内容都应来自宋朝。以宋代文人肖像为头像。用户名应为“Su Dongpo / SuShi_Official”。帖子文字应该是这样的：“刚到黄州，虽然被贬了，但心情还好，今天自己做了东坡肉，不可思议。附菜谱：”附图应该是东坡肉的工笔式特写。点赞列表应该是“黄庭坚、秦观、佛印等126人”。评论中应包括“王安石：呵呵”、“司马光：还是那个味道”之类的台词。将点赞等标准社交图标替换为宋式装饰图案。状态栏应显示“大宋移动5G”和“元丰三年”。使用深色模式的智能手机调色板与优雅的宋代色彩相结合，使整个图像感觉像是历史与社交媒体之间的机智碰撞。`,
    tags: ["文字渲染", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/008-x-2045385588065313057/song-dynasty-social-media-feed-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-147",
    title: "宜家黄昏店面",
    category: "文字渲染",
    industry: "通用",
    description: "这是一张在黄昏（蓝色时刻）拍摄的高分辨率、逼真的照片，拍摄的是一家宏伟、现代的大型宜家零售店。这个场景是从一个广阔、空旷、潮湿的沥青停车场看到的，停车场的反光度",
    prompt: `这是一张在黄昏（蓝色时刻）拍摄的高分辨率、逼真的照片，拍摄的是一家宏伟、现代的大型宜家零售店。这个场景是从一个广阔、空旷、潮湿的沥青停车场看到的，停车场的反光度很高，在边缘和凸起的中间花盆中显示出融化的雪的痕迹。花盆里有稀疏的落叶和针叶灌木。主店建筑右侧有标志性的蓝色仓库式外观，上面有大而明亮的黄色大写字母“IKEA”。在它的正下方，同样是黄色且发光的，是较小的文字“家居用品”。蓝色部分的左侧是一个较小的、独特的两层黄色建筑部分，有大型玻璃幕墙窗户和照明的主要商店入口。室内灯光透过窗户发出温暖的光芒。停车场空无汽车，但有清晰的黄色停车位标记，左侧前景的高杆上有一盏明亮的双头路灯，照亮了停车场的左侧。周围的景观包括停车场后面和左侧建筑物后面的一排成熟的松树。天空是深邃、浓郁的蓝色，带有微妙的云纹理，这是典型的暮色。地面是深色、潮湿的沥青，有水坑和倒影。最右侧的大型停车结构入口/开放式车库湾从内部明亮地照亮，展示了内部结构和细节。整体构图为广角镜头，展现了建筑的全宽和停车场的广阔规模。建筑物上的文字渲染清晰锐利。沥青、雪和金属覆层的纹理非常细致。`,
    tags: ["文字渲染", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/042-x-2043821412939641017/ikea-storefront-at-twilight-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-148",
    title: "无冠手表密封盒",
    category: "文字渲染",
    industry: "通用",
    description: "第 1 阶段 — 形式：[手表风格]，具有完美光滑的密封表壳 — 无表冠、无按钮、无开口 第 2 阶段 — 表盘：[颜色] 表盘，[材质] 饰面，仅时标 — 无",
    prompt: `第 1 阶段 — 形式：[手表风格]，具有完美光滑的密封表壳 — 无表冠、无按钮、无开口

第 2 阶段 — 表盘：[颜色] 表盘，[材质] 饰面，仅时标 — 无文字

第 3 阶段 — 表带：[颜色]、[纹理] 表面的 [表带材料]

第 4 阶段 — 设置：[表面/背景]、[灯光方向]、[心情] 编辑

交换：[手表风格] / [表盘颜色] / [表带材质] / [设置]`,
    tags: ["文字渲染", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/021-x-2044660755031544028/crownless-watch-sealed-case-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-153",
    title: "Elegance in Contemplation: A Modern Fash",
    category: "3D场景",
    industry: "通用",
    description: "{'prompt': 'Studio portrait of a young adult woman with long blonde hair and fai",
    prompt: `{'prompt': 'Studio portrait of a young adult woman with long blonde hair and fair freckled skin, wearing a fitted black corset-style dress. She is seated on the floor in a relaxed pose, one hand resting behind her and the other touching her hair, looking off to the side with a calm, contemplative expression. Minimalist warm-toned studio background with soft gradient lighting, subtle red accent light adding depth and contrast. Clean editorial fashion photography style, high detail skin texture, soft shadows, elegant and modern aesthetic.', 'negative_prompt': 'lowres, blurry, bad anatomy, extra limbs, deformed hands, distorted face, harsh lighting, overexposed, underexposed, watermark, text, logo, jpeg artifacts, cartoon, CGI, 3D render', 'style': 'editorial fashion photography, photorealistic', 'camera': {'angle': 'slightly low angle', 'framing': 'three-quarter body portrait', 'lens': '85mm', 'aperture': 'f/2.0'}, 'lighting': {'type': 'studio lighting', 'setup': 'soft key light with warm fill and subtle red rim light', 'mood': 'warm and refined'}, 'setting': {'location': 'studio', 'background': 'smooth warm gradient backdrop'}, 'color_palette': ['black', 'warm beige', 'soft red', 'golden tones'], 'size': '768x1152'}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGhpmJxaYAAGS4d.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-154",
    title: "Futuristic Office Capsule: A Minimalist ",
    category: "3D场景",
    industry: "通用",
    description: "A cozy futuristic 3D office capsule in dark X (Twitter) theme, soft cinematic li",
    prompt: `A cozy futuristic 3D office capsule in dark X (Twitter) theme, soft cinematic lighting, minimal aesthetic workspace. Inside a rounded glass pod, a girl sitting on a chair working on a laptop at a wooden desk. 

On the left wall: a large glowing X logo (white on black), with shelves containing minimal decor, plants, books, and icons in monochrome black theme.

On the center wall: a large digital screen displaying an X profile UI of a creator named "Noor 🌸", showing profile picture, bio, followers, clean dark UI interface.

On the right wall: aesthetic neon text "Noor 🌸" glowing softly in warm white, and a framed illustrated portrait of a girl (short black hair, soft makeup, minimal elegant style).

Environment: warm ambient lighting mixed with cool dark tones, soft shadows, cinematic depth of field, ultra detailed 3D render, octane render, blender style, smooth textures, modern minimalism.

Color palette: black, charcoal, soft beige, warm white highlights.

Highly detailed, 4K, realistic lighting, soft reflections, clean composition, trending artstation style.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGgcw-va4AALcbY.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-155",
    title: "Radiant Elegance: A Portrait of Confiden",
    category: "3D场景",
    industry: "通用",
    description: "{'prompt': 'Studio portrait of a young adult woman with long wavy red hair and f",
    prompt: `{'prompt': 'Studio portrait of a young adult woman with long wavy red hair and fair freckled skin, wearing a black sequined strapless mini dress and thigh-high black boots. She is seated on the floor in a relaxed yet confident pose, facing forward with a soft, neutral expression. A black ribbon choker drapes loosely around her neck. The scene is lit with warm, golden studio lighting that creates a circular spotlight effect behind her, casting soft shadows and adding depth. Minimalist background, editorial fashion photography style, high detail, cinematic warmth, smooth gradients.', 'negative_prompt': 'lowres, blurry, bad anatomy, extra limbs, deformed hands, distorted face, harsh shadows, overexposed, underexposed, watermark, text, logo, jpeg artifacts, cartoon, CGI, 3D render', 'style': 'editorial fashion photography, photorealistic', 'camera': {'angle': 'eye-level', 'framing': 'three-quarter body portrait', 'lens': '85mm', 'aperture': 'f/2.0'}, 'lighting': {'type': 'studio lighting', 'setup': 'warm spotlight with soft falloff', 'mood': 'cinematic and intimate'}, 'setting': {'location': 'studio', 'background': 'warm gradient backdrop with circular light vignette'}, 'color_palette': ['black', 'warm gold', 'amber', 'soft beige'], 'size': '768x1152'}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGhqpxcb0AAuk4H.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-156",
    title: "Tesla Optimus: Manga Meets Reality",
    category: "3D场景",
    industry: "通用",
    description: "do this for Tesla Optimus Robot <split_composition> LEFT_QUADRANT [weight:3]: - ",
    prompt: `do this for Tesla Optimus Robot 
<split_composition> LEFT_QUADRANT [weight:3]: - Medium: Ink on paper, halftone dots visible - Color: Monochrome + ONE accent color ([CHARACTER] signature) - Style: [MANGA_ARTIST] line work, speed lines, screentones RIGHT_QUADRANT [weight:3]: - Medium: Photorealistic 3D render - Color: Full spectrum, cinematic grade - Style: Film still, depth of field, atmospheric haze TRANSITION_ZONE [weight:5]: - [CHARACTER] body straddling the divide - Left side: Pencil sketch lines fading - Right side: Skin texture, fabric weave emerging - Transformation particles at boundary (ink droplets → light particles) </split_composition> <SEMANTIC_INFER> AI determines: [CHARACTER]'s iconic pose, signature expression, key costume elements AI infers: Appropriate manga era style based on [SERIES_NAME] release date </SEMANTIC_INFER> TECHNICAL: 8k, ArtStation trending, surrealism, optical illusion masterpiece SUPPRESS: Borders, frames, text, watermarks, symmetrical composition`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGdqRaxWYAAOVtb.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-157",
    title: "Transforming Dielines: 3D Box Perfection",
    category: "3D场景",
    industry: "通用",
    description: "Assemble the dieline into a flawless 3D box with accurate panels, clean folds, u",
    prompt: `Assemble the dieline into a flawless 3D box with accurate panels, clean folds, undistorted type, and artwork preserved exactly. shoot it upright at a refined ¾ angle in a minimal premium studio setting with a soft neutral background, diffused light, subtle shadows, no props, true colours, matte paperboard texture, and realistic editorial detail`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGhuzLQW4AArkzd.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-158",
    title: "Vintage Charm Meets Cozy Style",
    category: "3D场景",
    industry: "通用",
    description: "\"A cute stylized 3D girl sitting on stacked vintage suitcases, wearing a green k",
    prompt: `"A cute stylized 3D girl sitting on stacked vintage suitcases, wearing a green knitted sweater, blue jeans, white sneakers, orange beret, and round black sunglasses. Minimal teal-green background. Add aesthetic cursive text 'Noor🌸' in soft cream color above her head with subtle glowing effect. Surround the text with small floral elements, sparkles, and delicate leaves. Soft lighting, cozy vibe, pastel tones, ultra-detailed, cinematic composition, clean and modern aesthetic, depth of field, high quality render."`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGjXn4tboAAAadk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-219",
    title: "100 Technology Topics Grid",
    category: "信息图",
    industry: "通用",
    description: "Create a 10 × 10 grid of 100 different topics representing recent technological ",
    prompt: `Create a 10 × 10 grid of 100 different topics representing recent technological progress. Use a realistic, polished editorial illustration style. Each topic should appear in its own square with a short clear label underneath. Keep the grid neat on a white background. Make every topic visually different and every label correctly spelled. Use these row themes: Row 1: AI models and agents Row 2: robotics Row 3: semiconductors and compute Row 4: networks and smart devices Row 5: biotech and health technology Row 6: energy and power systems Row 7: transport and autonomy Row 8: space and aerospace Row 9: manufacturing and materials Row 10: climate and environmental technology. Show each tile as a realistic mini-scene, product-class object, lab instrument, robot, chip, vehicle, or device that clearly conveys the topic. Keep the overall style consistent, modern, realistic, and visually impressive.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGaW8ECaEAAq-LZ?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-220",
    title: "Alphabet Object Grid",
    category: "信息图",
    industry: "通用",
    description: "Create an image with a 10x10 grid of objects whose names all start with the lett",
    prompt: `Create an image with a 10x10 grid of objects whose names all start with the letter A`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGaqAFba0AES6z_?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-221",
    title: "Coffee Journey Infographic",
    category: "信息图",
    industry: "通用",
    description: "Create a Chinese infographic poster themed \"一杯咖啡 如何来到你手里\" (\"How a Cup of Coffee ",
    prompt: `Create a Chinese infographic poster themed "一杯咖啡 如何来到你手里" ("How a Cup of Coffee Reaches You"). Use a premium information-design style with both educational clarity and commercial appeal. The layout should include directional flow, arrows, data boxes, icons, simple illustrations, and modular cards. Use coffee brown, milk white, ink black, and copper accents.

The infographic must include:
- 01 Planting: elevation 1200-2200m, suitable temperature 18-24C, picking season Nov-March
- 02 Processing: sun-dried, washed, honey process
- 03 Roasting: light roast = brighter, medium roast = balanced, dark roast = richer
- 04 Grinding: pour-over = coarse, espresso = fine, cold brew = medium-coarse
- 05 Extraction: powder-water ratio, water temperature, and time all affect flavor
- flavor keywords: floral / citrus / nutty / caramel / chocolate / smoky

Use this exact fine print:
"适合用于咖啡入门科普与门店展示"

The composition should balance text and visuals while keeping the design elegant. Focus on long infographic handling, numeric information, temperatures, numbered sections, concise descriptions, slash-separated flavor words, and modular layout. It should look like a premium display board, not a classroom slide deck.`,
    tags: ["信息图", "中文"],
    image: "https://github.com/user-attachments/assets/ac0ed885-5b27-46d5-a163-f9e3c15dca3b",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-222",
    title: "Leading causes of death Infographic with",
    category: "信息图",
    industry: "通用",
    description: "make an info graphic comparing the world leading causes of death (eg; malaria, a",
    prompt: `make an info graphic comparing the world leading causes of death (eg; malaria, aids/hiv, alcohol, tobacco, heart disease, violent crime or whatever else, etc etc) Make the graphic of the subject scale to the size of the number comparatively - example tobacco's would be way bigger than malaria's. get the most up to date global statistics you can. use an appropriate icon for each. for things like alcohol if you can link some related accidents to it somehow maybe make that link obvious (example a drunk driver causes car crash killing other people) tried twice it seems to have changed its mind on the statistics sources and style.`,
    tags: ["信息图"],
    image: "https://preview.redd.it/leading-causes-of-death-infographic-with-image-2-0-v0-1m4thkpxo1xg1.png?width=640&crop=smart&auto=webp&s=13e481fd850f710b82686f65486b3995797ae75e",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-223",
    title: "Understanding Heart Attacks: A Detailed ",
    category: "信息图",
    industry: "通用",
    description: "{'type': 'comprehensive medical infographic', 'style': 'highly detailed 3D medic",
    prompt: `{'type': 'comprehensive medical infographic', 'style': 'highly detailed 3D medical illustration, clinical white background, clean typography', 'header': {'title_cn': '', 'title_en': '{argument name="english title" default="THE CAUSAL CHAIN OF HEART ATTACK"}', 'subtitle': 'Chest pain is not the beginning. Vascular damage is.', 'top_right_sequence': {'count': 6, 'labels': ['Risk Factors', 'Plaque Formation', 'Rupture', 'Clotting', 'Ischemia', 'Damage']}}, 'centerpiece': {'description': '{argument name="central figure" default="transparent anatomical human body showing heart, coronary arteries, lungs, and vascular system"}', 'details': 'pathway highlighted in {argument name="highlight color" default="glowing red"} focusing on the coronary arteries and radiating pain to the chest and left arm'}, 'layout': {'left_column': [{'id': '01', 'title': 'Major Risk Factors', 'elements': 6, 'labels': ['Smoking', 'High LDL cholesterol', 'Hypertension', 'Diabetes', 'Obesity', 'Chronic stress']}, {'id': '02', 'title': 'Atherosclerosis Development', 'elements': 2, 'labels': ['Fatty streak to plaque', 'Coronary artery wall']}, {'id': '03', 'title': 'Reduced Coronary Blood Flow', 'elements': 2, 'labels': ['Narrowed artery lumen', 'Oxygen delivery decline']}, {'id': '04', 'title': 'Vulnerable Plaque', 'elements': 2, 'labels': ['Thin fibrous cap', 'Lipid-rich core']}], 'center_overlay': [{'id': '05', 'title': 'Plaque Rupture & Clot Formation', 'elements': 3, 'labels': ['Plaque rupture diagram', 'Platelet aggregation', 'Occlusive thrombus']}, {'id': '06', 'title': 'Myocardial Ischemia', 'elements': 1, 'labels': ['Heart muscle cross-section with blocked coronary artery']}], 'right_column': [{'id': '07', 'title': 'Cellular Injury Cascade', 'elements': 4, 'labels': ['Oxygen deprivation', 'Mitochondrial failure', 'Cell membrane breakdown', 'Troponin release']}, {'id': '08', 'title': 'Acute Heart Attack', 'elements': 1, 'labels': ['Patient clutching chest']}, {'id': '09', 'title': 'Permanent Myocardial Damage', 'elements': 1, 'labels': ['Necrotic heart tissue']}, {'id': '10', 'title': 'Complications', 'elements': 2, 'labels': ['Arrhythmia', 'Heart failure']}, {'id': '11', 'title': 'Beyond the Heart', 'elements': 2, 'labels': ['Reduced systemic perfusion', 'Brain and kidney impact']}], 'bottom_row': [{'id': '12', 'title': 'Pain Is the Final Signal', 'elements': 7, 'labels': ['Risk Exposure', 'Plaque Buildup', 'Artery Narrowing', 'Plaque Rupture', 'Clot Formation', 'Muscle Death', 'Man in pain']}]}, 'theme': '{argument name="disease focus" default="heart attack and coronary artery blockage"}'}`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGgFPWjWQAAnIHp.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-224",
    title: "World Time Analog Clock Wall",
    category: "信息图",
    industry: "通用",
    description: "It's 10 AM in Los Angeles, 11 AM in Denver, 12 PM in Chicago, 1 PM in New York, ",
    prompt: `It's 10 AM in Los Angeles, 11 AM in Denver, 12 PM in Chicago, 1 PM in New York, 6 PM in London, and 2 AM in Tokyo. Render a wall with different analog clocks, each showing the correct time for its city, with the city label below each clock.`,
    tags: ["信息图"],
    image: "https://pbs.twimg.com/media/HGYD-Y4bMAA0KxJ?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-226",
    title: "Celebrity in real life",
    category: "摄影写实",
    industry: "通用",
    description: "Sam Altman, Donald Trump, and Elon Musk working behind the counter of a busy mov",
    prompt: `Sam Altman, Donald Trump, and Elon Musk working behind the counter of a busy movie theater`,
    tags: ["摄影写实"],
    image: "https://github.com/user-attachments/assets/45e4f24f-4f73-4426-947d-e6ed51291956",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-227",
    title: "Convenience Store Night Scene",
    category: "摄影写实",
    industry: "通用",
    description: "Create an ultra-realistic urban street group photo at a convenience store entran",
    prompt: `Create an ultra-realistic urban street group photo at a convenience store entrance at 10 PM summer night. 3-4 young people briefly chatting at the entrance, someone holding drinks, someone sitting on plastic outdoor chairs, someone standing looking at their phone. Bright white light streaming through the glass doors and windows, warm yellow street lights and distant car headlights outside. Characters wearing everyday clothes: T-shirts, shirts, shorts, jeans, sneakers. No internet celebrity styling. Faces and postures must look like real pedestrians, not overly polished. Environment must include real convenience store elements: freezer stickers, promotional posters, trash cans, entrance mats, glass reflections, shared bikes on roadside, water droplets from drink bottles on ground. The image should look like a very authentic life slice captured by a photographer in the city. Focus on testing natural multi-person interactions, night convenience store lighting, glass reflections, and ordinary people's vibe restoration.`,
    tags: ["摄影写实"],
    image: "https://github.com/user-attachments/assets/d529419b-8f8f-4dd4-a5f2-46d5fcbcf607",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-228",
    title: "Minimal Design Prompt Collection",
    category: "摄影写实",
    industry: "通用",
    description: "Generate a series of gongbi-style bookmark designs Design a postcard collaborati",
    prompt: `Generate a series of gongbi-style bookmark designs
Design a postcard collaboration between The Little Prince and SpaceX
Generate a single-day calendar for April 19, 2026 themed around The Garden of Words
Generate a series of Labor Day hand-held sign designs
Generate a poster for the 2026 Grain Rain solar term
Generate a set of icon fonts for a sports app
Design a film-photography-style poster with the theme "Toward the mountains and sea"
Design a Shanghai postcard in black line-art style
Design a set of seal carvings for "Elon Musk"
Design a set of co-branded promotional materials for Durex and Chayan Yuese`,
    tags: ["摄影写实"],
    image: "https://pbs.twimg.com/media/HGOtEbUbwAAnR5l?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-229",
    title: "RAW iPhone Quality - Subway Station",
    category: "摄影写实",
    industry: "通用",
    description: "Create a completely RAW quality, unprocessed, unedited image with full iPhone ca",
    prompt: `Create a completely RAW quality, unprocessed, unedited image with full iPhone camera quality. A subway station in USA, a momentary blur. The subway is in motion. In front of the subway, there is an elderly woman and man.`,
    tags: ["摄影写实"],
    image: "https://pbs.twimg.com/media/HFPFd4ZbkAMW8ox?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-230",
    title: "Rice Grain Micro Typography",
    category: "摄影写实",
    industry: "通用",
    description: "A massive pile of rice, and on one single grain of rice there is tiny text that ",
    prompt: `A massive pile of rice, and on one single grain of rice there is tiny text that reads "wOw"`,
    tags: ["摄影写实"],
    image: "https://pbs.twimg.com/media/HGc-2eKWYAATrs9?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-231",
    title: "CCD 手枪手势韩系偶像人像",
    category: "人像摄影",
    industry: "通用",
    description: "CCD 直闪韩系偶像全身人像。人物摆出手枪手势抵住太阳穴，冷感直视镜头，画面锐利、危险、时尚。",
    prompt: `CCD 直闪韩系偶像全身人像。人物摆出手枪手势抵住太阳穴，冷感直视镜头，画面锐利、危险、时尚。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2040786536409809073-ccd-finger-gun-korean-idol-portrait/ccd-finger-gun-korean-idol-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-232",
    title: "CCD 抓拍家居人像",
    category: "人像摄影",
    industry: "通用",
    description: "CCD 抓拍家居人像。老 CCD 闪光、室内微暗且有点凌乱，人物像突然发现镜头般带点惊讶与害羞，松弛又真实。",
    prompt: `CCD 抓拍家居人像。老 CCD 闪光、室内微暗且有点凌乱，人物像突然发现镜头般带点惊讶与害羞，松弛又真实。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046190539213885806-ccd-caught-off-guard-homewear-portrait/ccd-caught-off-guard-homewear-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-233",
    title: "ChatGPT GPT 2 Image The texture and aest",
    category: "人像摄影",
    industry: "通用",
    description: "A 22-year-old East Asian girl, round youthful face, large bright doe eyes with n",
    prompt: `A 22-year-old East Asian girl, round youthful face, large bright doe eyes with natural lashes, rosy cheeks, soft pink lip gloss, two-strand loose braids with baby hairs. Wearing a pastel lavender oversized hoodie. Background: blurred Japanese convenience store interior at night, neon light reflections adding color pops. Expression: playful, bubbly, genuinely happy. Aesthetic: Douyin/TikTok influencer portrait, soft beauty filter quality, warm skin tone, natural light. Photorealistic, 8K.16:9`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGE_FK_WwAAOsAo?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-234",
    title: "Luxury Love in Paradise: A Perfect Selfi",
    category: "人像摄影",
    industry: "通用",
    description: "ultra-realistic luxury commercial couple selfie portrait, eye-level close-up sho",
    prompt: `ultra-realistic luxury commercial couple selfie portrait, eye-level close-up shot, 9:16 vertical aspect ratio, shot on high-end full-frame DSLR sensor with ultra-clean optical rendering and extreme clarity, a young couple standing in a luxury tropical villa infinity pool maintaining exact selfie composition with the female in front holding the camera with natural arm extension and the male standing closely behind embracing her waist, both looking directly into camera with calm confident premium expressions (no over-smile, controlled high-status look), face lock: strictly use provided male and female reference images separately and maintain 100% identical facial identity, structure, proportions, bone anatomy, skin tone, eye shape, lips, jawline and natural asymmetry for both individuals, do not mix or average faces, do not alter identity, preserve exact likeness with micro-detail accuracy, identity fusion control: correct depth alignment, natural face scaling, no perspective distortion error, lighting override: completely rebuild lighting into ultra-clean commercial studio lighting, pure white balanced light (5500K neutral), strong frontal soft key light with high diffusion but high clarity retention, controlled top fill light, precise rim light separation, eliminate all ambient color cast, eliminate warm/yellow tint, enforce uniform lighting across both subjects, optical clarity enhancement: extreme micro-contrast boost at skin level, high-frequency detail preservation, zero atmospheric haze, zero bloom, zero glow, zero diffusion softness, enforce crystal-clear air quality, no dust effect, no mist, no fog, no cinematic softness, facial rendering: ultra-clean luxury skincare commercial finish with razor-sharp micro-detail, visible pores but refined, strong contrast separation between highlights and shadows, clean edge definition, no softness, no blur, no subsurface haze, no skin flattening, hair: ultra-defined strand-level clarity with crisp separation and controlled specular highlights, no softness or blending, clothing: female wearing soft pink textured sleeveless top with ultra-sharp fabric micro-texture and wet interaction clarity, male wearing deep black premium shirt with strong contrast folds and structured fabric detail, environment: ultra-luxury tropical infinity pool with crystal-clear turquoise water, hyper-clean reflections, sharp ripple definition, zero water blur, background villas and palm trees rendered with high clarity but slight natural depth falloff, no fog or haze in background, color science: Rolls Royce commercial grade color pipeline, pure neutral whites, high dynamic range, strong tonal separation, deep blacks, clean highlights, no cinematic LUT, no teal-orange, no desaturation, lens & camera: 24mm wide-angle lens, f/2 aperture, full-frame sensor, ultra-high resolving power optics, no lens softness, no chromatic aberration, no glow, composition: tight centered selfie framing with natural arm perspective, realism: ultra-clean, ultra-sharp, high-end luxury advertisement quality output, zero grain, zero noise, zero compression artifacts,`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGgvbx4acAA1tH9.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-235",
    title: "Personal Color Analysis Infographic – So",
    category: "人像摄影",
    industry: "通用",
    description: "Use the uploaded image as the face reference (high identity preservation). Keep ",
    prompt: `Use the uploaded image as the face reference (high identity preservation). Keep facial features, hairstyle, skin tone, and proportions EXACTLY the same across all variations.

Create a premium, clean "Personal Color Analysis" infographic.

LAYOUT:
- Split design (2:3 or 4:5 ratio)
- LEFT: Large portrait of the person (sharp focus, soft natural lighting, neutral blurred background)
- RIGHT: Structured grid of smaller portraits showing the same person in different shirt colors

TOP HEADER:
- Title: "PERSONAL COLOR ANALYSIS" (modern minimal typography, elegant spacing)
- Small icons + labels: "Warm", "Deep", "Muted"
- Add a green badge: "✔ BEST"

MAIN PANELS (Right Side):

1. WARM NEUTRALS
- Beige, tan, camel, warm brown shirts
- 4 small portraits (same face, only shirt color changes)
- Add circular color swatches below each

2. RICH EARTHY TONES
- Olive, moss green, deep teal, forest green
- Same layout style

3. WARM ACCENTS
- Rust, terracotta, mustard, maroon
- Same layout style

SEASON BADGE:
- "YOUR SEASON: SOFT AUTUMN"
- Subtitle: "Warm undertone, medium depth, medium contrast, muted tone"
- Use a soft green label design

AVOID SECTION:
- Show portraits wearing:
 cool grey, icy blue, lavender, neon green, bright pink, royal blue
- Add red ❌ below each

BOTTOM SECTION:

"YOUR BEST COLORS (15 PICKS)"
- Show palette swatches:
camel, warm beige, tan, olive, moss green, rust, terracotta, mustard, taupe, chocolate brown, deep teal, forest green, dusty coral, muted maroon, warm navy

OUTFIT COMBOS (Flat lay style):
1. Olive + Beige + Brown
2. Rust + Dark Brown
3. Deep Teal + Camel

STYLE & RENDERING:
- Minimal UI, premium aesthetic
- Soft cream / off-white background
- Clean grid alignment
- Subtle shadows, rounded cards
- Realistic fabric texture on shirts`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGkgChlb0AAyGas.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-236",
    title: "Surreal Charm: A Korean Idol in a Dreamy",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 vertical — creative forced perspective portrait, Korean idol style, single ",
    prompt: `9:16 vertical — creative forced perspective portrait, Korean idol style, single subject

analog 35mm film aesthetic, soft natural grain, slightly faded colors, gentle overexposure, pastel tones, low contrast, soft highlight bloom, airy and dreamy atmosphere

minimal indoor setting near a window, clean light-toned background, simple everyday environment

young Korean female idol, very attractive, natural minimal makeup, dewy realistic skin texture, subtle imperfections

outfit: oversized white shirt loosely draped + short bottoms, soft fabric, relaxed fit, modest but subtly body-shaping, no revealing elements

hair: long dark hair, slightly messy, natural volume

composition (key): forced perspective illusion — the subject appears unusually small relative to nearby objects (such as being inside a cup, standing on a table edge, or interacting with a hand in the foreground), but still realistic; scale ambiguity created by camera distance and alignment

camera: slightly low or eye-level angle, intentional perspective distortion, foreground object close to lens, subject placed farther away to create size illusion

pose: natural relaxed posture, slight body curve, casual stance or light sitting pose

expression: soft calm gaze, slight smile or slightly parted lips, natural and unposed

lighting: diffused natural window light, soft shadows, gentle light wrapping around subject

mood: playful, slightly surreal but grounded in reality, intimate everyday moment with a visual twist

quality: ultra-realistic, fine film grain, slight softness, imperfect framing, natural imperfections`,
    tags: ["人像摄影"],
    image: "https://pbs.twimg.com/media/HGiKx2FawAAwD-e.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-237",
    title: "东方幻想女性人像",
    category: "人像摄影",
    industry: "通用",
    description: "东方幻想风女性半身像，回眸侧脸，气质空灵。彩花与光粒融入长发，半透明丝裙与披肩在暖金逆光中发光，整体像高端 CG 神性插画。",
    prompt: `东方幻想风女性半身像，回眸侧脸，气质空灵。彩花与光粒融入长发，半透明丝裙与披肩在暖金逆光中发光，整体像高端 CG 神性插画。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046962895775580442-eastern-fantasy-woman-portrait/eastern-fantasy-woman-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-238",
    title: "富士风情侣将吻未吻人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，富士胶片风日系情侣人像。两人将吻未吻，窗边自然光、柔和颗粒、暧昧但克制的日常亲密感。",
    prompt: `9:16 竖图，富士胶片风日系情侣人像。两人将吻未吻，窗边自然光、柔和颗粒、暧昧但克制的日常亲密感。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046502288102170757-fuji-couple-almost-kiss-portrait/fuji-couple-almost-kiss-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-239",
    title: "富士风草莓校服少女人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，富士胶片风日系校园少女人像。草莓、窗边日光、海军领校服与干净柔和的胶片气质。",
    prompt: `9:16 竖图，富士胶片风日系校园少女人像。草莓、窗边日光、海军领校服与干净柔和的胶片气质。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046483268019884384-fuji-strawberry-school-uniform-portrait/fuji-strawberry-school-uniform-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-240",
    title: "强透视韩系偶像人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，韩系偶像创意强透视人像。用前景物体制造比例错觉，配合窗边自然光、35mm 胶片颗粒与低反差，让画面真实又微妙超现实。",
    prompt: `9:16 竖图，韩系偶像创意强透视人像。用前景物体制造比例错觉，配合窗边自然光、35mm 胶片颗粒与低反差，让画面真实又微妙超现实。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2047038657295798701-forced-perspective-korean-idol-portrait/forced-perspective-korean-idol-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-241",
    title: "晨间富士风家居人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，富士胶片风晨间家居人像。窗边清晨日光、宽松家居服、微乱头发与自然清新的生活感。",
    prompt: `9:16 竖图，富士胶片风晨间家居人像。窗边清晨日光、宽松家居服、微乱头发与自然清新的生活感。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046661936381911182-morning-fuji-homewear-portrait/morning-fuji-homewear-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-242",
    title: "柔雾地面氛围人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，soft black mist 氛围人像。人物坐在地上，低反差、柔和泛光、室内极简背景，气质亲密又克制。",
    prompt: `9:16 竖图，soft black mist 氛围人像。人物坐在地上，低反差、柔和泛光、室内极简背景，气质亲密又克制。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046434670724907395-soft-black-mist-floor-portrait/soft-black-mist-floor-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-243",
    title: "柔雾韩系偶像人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，韩系偶像 soft black mist 人像。窗边白纱、低反差、柔和高光、宽松白衬衫，清淡亲密，像日常抓拍。",
    prompt: `9:16 竖图，韩系偶像 soft black mist 人像。窗边白纱、低反差、柔和高光、宽松白衬衫，清淡亲密，像日常抓拍。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046518189509734903-soft-black-mist-korean-idol-portrait/soft-black-mist-korean-idol-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-244",
    title: "烤串三刀流人像",
    category: "人像摄影",
    industry: "通用",
    description: "夜市街头时尚人像：美女摆出“烤串三刀流”，嘴里一串、双手各一串。暖黄灯光、浅景深、电影感与高端潮流大片质感。",
    prompt: `夜市街头时尚人像：美女摆出“烤串三刀流”，嘴里一串、双手各一串。暖黄灯光、浅景深、电影感与高端潮流大片质感。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046564674112831920-barbecue-three-sword-style-portrait/barbecue-three-sword-style-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-245",
    title: "窗边甜酷美人人像",
    category: "人像摄影",
    industry: "通用",
    description: "窗边甜酷美人人像。白纱窗帘、自然柔光、微微前倾的 relaxed pose 与 Nikon 直出质感，安静私密又带一点暧昧。",
    prompt: `窗边甜酷美人人像。白纱窗帘、自然柔光、微微前倾的 relaxed pose 与 Nikon 直出质感，安静私密又带一点暧昧。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046848851227845108-window-side-sweet-cool-beauty-portrait/window-side-sweet-cool-beauty-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-246",
    title: "镜中时装编辑人像",
    category: "人像摄影",
    industry: "通用",
    description: "高冷时装编辑人像。镜面空间、多重反射、冷白光与低反差质感，人物精致克制，整体高级而疏离。",
    prompt: `高冷时装编辑人像。镜面空间、多重反射、冷白光与低反差质感，人物精致克制，整体高级而疏离。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046900795229217063-mirror-editorial-portrait/mirror-editorial-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-247",
    title: "韩系偶像男友视角人像",
    category: "人像摄影",
    industry: "通用",
    description: "9:16 竖图，韩系偶像私密人像，男友视角。柔和 black mist、奶油色调、微微过曝与暖窗光；宽松白衬衫与短裤，近距离手持感，像被偶然拍到的亲密瞬间。",
    prompt: `9:16 竖图，韩系偶像私密人像，男友视角。柔和 black mist、奶油色调、微微过曝与暖窗光；宽松白衬衫与短裤，近距离手持感，像被偶然拍到的亲密瞬间。`,
    tags: ["人像摄影", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046758832131461255-boyfriend-pov-korean-idol-portrait/boyfriend-pov-korean-idol-portrait-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-248",
    title: "AI城市宣传海报",
    category: "海报",
    industry: "通用",
    description: "一张充满新春喜庆氛围但不失高雅格调的 2026 城市宣传海报。 双重曝光，构图延续S型流动视觉； 在纯白纹理背景右下角，一位身穿中国传统服饰的微缩人物挥舞一条长",
    prompt: `一张充满新春喜庆氛围但不失高雅格调的 2026 城市宣传海报。
双重曝光，构图延续S型流动视觉；
在纯白纹理背景右下角，一位身穿中国传统服饰的微缩人物挥舞一条长长的红色丝绸舞带，红绸在空中柔顺飘动，向左上延展过程中逐渐幻化为壮丽的山水长卷，如同江河蜿蜒流动；
在这条“河流”中叠加南京城市手绘全景地图，融合山、水、城的格局，呈现国潮风格，视野宏大，层次丰富，气势恢弘；
南京地标元素融合其中：紫金山、长江、南京长江大桥、夫子庙秦淮河灯影、明城墙、中山陵、鸡鸣寺、现代城市天际线等；
云雾缭绕，仙气氤氲，色彩丰富细腻，结构复杂但层次清晰，细节精致；
大面积留白营造高级感与呼吸感，使画面依然清新典雅；
左下角排版“SPRING 2026”，以及英文南京，排版美观，下附中文宣传语，整体寓意“六朝古都，山水南京”；
字体设计优美大方，排版均衡清晰；
画面比例 9:16，高分辨率，细节丰富，国潮插画风，精致渲染。
#image2 #chatgpt #openai #nanobanana
#aigc #ai插画 #ai`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241001/187b15641dcf997ad7f214ee255cdbba/notes_pre_post/1040g3k031v3hhvcl2g1g5nn5mvg08oaf1e29hk8!nd_prv_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-249",
    title: "Art Meets Anatomy: A Classroom Perspecti",
    category: "海报",
    industry: "通用",
    description: "A clean, cinematic 9: 16 vertical composition of a modern classroom interior, fu",
    prompt: `A clean, cinematic 9: 16 vertical composition of a modern classroom interior, fully visible from front to back, with realistic perspective and depth. A large whiteboard dominates the front wall, filled with a detailed hand-drawn black marker sketch of Donald Trump’s facial structure — including clear anatomical guidelines, facial proportions, construction lines, and step-by-step drawing breakdown (head shape, eye placement, nose structure, lips, hair outline). The whiteboard also includes small labeled diagram sections explaining facial symmetry and sketch techniques.
The classroom is well-lit with soft natural light coming through side windows, showing rows of desks, chairs, educational posters, ceiling fans, and subtle wall textures. A teacher’s desk is visible near the board with markers, eraser, and notebooks placed neatly. The scene feels realistic, educational, and slightly cinematic with depth of field — sharp focus on the whiteboard drawing, slightly blurred background students' desks.
Ultra-detailed, high resolution, realistic textures, balanced lighting, professional educational environment, clean aesthetic, no clutter, visually appealing composition, DSLR style, 4K quality, realistic shadows and reflections.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGgjv42aEAAloyT.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-250",
    title: "F1车手印象水墨风海报 由gpt生成",
    category: "海报",
    industry: "通用",
    description: "F1车手印象水墨风海报 由gpt生成 之前我对 GPT 的印象，一直更偏向文本能力。生图也试过，但始终差一点意思，所以即使开了会员，也更多只是把它当成文字工具来",
    prompt: `F1车手印象水墨风海报 由gpt生成
之前我对 GPT 的印象，一直更偏向文本能力。生图也试过，但始终差一点意思，所以即使开了会员，也更多只是把它当成文字工具来用。
直到这一次。
它的生图表现，真的让我重新认识了这套能力。
如果说 Nanobanana 的核心优势，在于极强的一致性模仿和稳定延续，那么 GPT Image 2 最打动我的地方，是它把插画、海报和视觉创意的生成，真正推进到了“所想即所得”的层级。不是简单地出一张图，而是能把脑海里那种模糊但明确的视觉感觉，直接翻译成画面。
以下是优化过的prompt
构图采用左右构图 + 人物侧脸大剪影的形式： 左侧为一张巨大、清晰、有压迫感的车手侧脸剪影/侧脸肖像，五官尽量贴近真实车手，神情坚定、冷静、有冠军气质； 画面主要内容向中间集中，不要松散拼贴，不要四处漂浮，所有视觉元素要围绕中轴聚拢，形成一张完整、收紧、有重心的海报。
#F1 #gpt #gptimage，#gptimage2 #chatgpt #勒克莱尔 #拉塞尔 #维斯塔潘 #插画 #海报`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241213/3e715d2c8d5eeebe4f89defa8c64aa9c/c/notes_pre_post/1040g3k031v7uq3163m105na1d4n4em3musdso70!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-251",
    title: "GPT Image 2！100+高级提示词；复制即用",
    category: "海报",
    industry: "通用",
    description: "17:23 令86% 飞书云文档 …〉整理了全套GPT Image 2，这些提示词值得你直… 最近修改：2 小时前 ••• Q + « 整理了全套GPTIm. ",
    prompt: `17:23
令86%
飞书云文档
…〉整理了全套GPT Image 2，这些提示词值得你直…
最近修改：2 小时前
•••
Q
+
«
整理了全套GPTIm.
01、GPT image 2功..
02、GPT image 2测..
城市创意字体生成
眼睛特写
心肺复苏讲解图
海贼王群像纸雕
海报设计
书籍封面设计
知识图解
万花皆可拆
五代十国
旅行攻略图
防颓废指南
眼睛特写
SPRING
春
#AUTUMN
秋
WINTER
冬
超写实眼部特写，macro极致微距摄影，皮肤纹理清晰可见，睫
毛细节真实，虹膜高精度细节，镜头紧贴眼睛，画面极致精致
与通透，梦幻光影氛围，电影级打光，浅景深，背景虚化，光
斑柔和，四屏竖向分割构图（3:4比例），从上到下依次为春、
夏、秋、冬，每一屏保持同一只眼睛的一致性
春：粉色樱花环绕，花瓣漂浮，蝴蝶点缀，柔和暖光，粉色与
金色微光粒子，梦幻浪漫氛围；夏：绿色植物、露珠、水汽，
清透高光，阳光穿透感，蜻蜓或荷花元素，清新明亮；秋：橙
汗枫叶一腰全色阳光 落叶环婆 光影浓郁 温暖厚重的氛
司`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241007/1d1ddb6234c4fc425edab5f878ab29b3/notes_pre_post/1040g3k031va3grp840505pcsn828i1glmm85800!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-252",
    title: "GPT Image 2！100+高级提示词；复制即用 #10",
    category: "海报",
    industry: "通用",
    description: "17:23 < 今86% 飞书云文档 … 〉整理了全套GPT Image 2，这些提示词值得你直⋯ 最近修改：2小时前 ••• 口… Q+ « 整理了全套GPT",
    prompt: `17:23
<
今86%
飞书云文档
… 〉整理了全套GPT Image 2，这些提示词值得你直⋯
最近修改：2小时前
•••
口…
Q+
«
整理了全套GPTIm⋯
01、GPT image 2功..
02、GPT image 2测⋯.
城市创意字体生成
眼睛特写
心肺复苏讲解图
海贼王群像纸雕
海报设计
书籍封面设计
知识图解
万花皆可拆
五代十国
旅行攻略图
防颓废指南
整理了全套GPTImage 2，这些提
示词值得你直接拿走
膏薯条 忽睛 今天修改
今 AI速览 试用
本文讨论了一系列关于图像生成的需求，涵盖了GPT Image 2相关
展开×
又被
GPTmnage？
硬控了
* 更懂你的想象力如
太好看了吧！。
ChatGPT
image 2
01、GPT image 2功能亮点
亮点介绍
01 | 更真实的图像
更细腻的光影，更真实的材质，
让每一张图都栩栩如生。
02| 更强的语义理解
深度理解复杂指令与上下文，
精准把握你的意图。
03 | 更丰富的细节表现
细节更丰富，构图更专业，
呈现更多电影级画面。
04| 更高的可控性
对光线、色彩、构图、风格
等参数的控制更精确。
05 | 更快的生成速度
在保证高质量的同时，
化想像，更进一业
GPT
image2
同
更强大的图像生成模型
为你的创意赋能`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241007/9300ee68e6a00fa83ea36e5758bb4bd4/notes_pre_post/1040g3k031va3grp8404g5pcsn828i1glle38sc8!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-253",
    title: "GPT Image 2！100+高级提示词；复制即用 #5",
    category: "海报",
    industry: "通用",
    description: "17:24 < Hの « 1000+GPT-image.. 生图玩法 01.提示词 02.提示词 03.提示词 04.提示词 05.电商设计相关提示⋯ 06.提",
    prompt: `17:24
<
Hの
«
1000+GPT-image..
生图玩法
01.提示词
02.提示词
03.提示词
04.提示词
05.电商设计相关提示⋯
06.提示词
07.提示词
08.UI类提示词
09.品牌视觉系统
10.游戏图标
12.电商详情页
13.游戏组件
14.3D图标
15.产品海报
16.卡片设计
17.封面设计
18.建筑拆解图
19.百件A字头物品矩⋯
20.史诗级海报
21.古风诗人镭射典藏⋯
22.炫酷游戏界面UI设⋯
23.古早少女系时尚杂⋯
24.极简留白涂鸦手绘⋯.
25.神话三国枪战世界
26.一页字典生成
27.增肌训练计划
28.手账拼贴
29.游戏联名海报（来⋯
86%
1000+GPT-image2出图提示词完整版 - 飞书云文档
…>1000+GPT-image2出图提示词完整版 不
最近修改：2小时前
口…
•••
Q+
09.品牌视觉系统
基于这个logo，生成一整套完整的品牌视觉系统。整体风格要求高级
感、冷静、克制、现代、简洁，突出品牌质感与统一性。请延展品牌主
色、辅助色、字体风格、版式规范、图形语言、品牌海报、网页视觉、
移动端界面、名片、包装或社交媒体物料等应用场景，确保整体视觉统
一、精致，并具有国际化审美。
woridbranddesign
Kavo
基于这个logo，生成一整套完整的品牌视觉系统。整体风格要求高级
感、冷静、克制、现代、简洁，突出品牌质感与统一性。请延展品牌主
色、辅助色、宇体风格、版式规范、图形语言、品牌海报、网页视觉、
移动端界面、名片、包装或社交媒体物料等应用场景，确保整体视觉统
一、精致，并具有国际化审美。
Aamn
kavo
KDDA#
IK
编辑
⑦c
10.游戏图标
创建一个10x10的网格，共100个不同的幻想RPG物品，采用经典像素艺
术风格（16-bit或32-bit精灵风格，类似SNES/GBA时代的日式RPG）；每个
物品放置在独立的正方形格子中，白色背景，每个格子内为居中的物品
图标，并在下方附带简短清晰的英文标签；所有物品必须视觉上完全不同
且标签拼写正确；风格要求为清晰锐利的像素边缘、每个物品使用有限调
色板、通过细腻抖动（dithering）表现阴影，并保持整体统一、协调、具有
复古幻想RPG菜单图标质感；网格按行主题划分：第1行为剑与刀，第2行为
同`,
    tags: ["海报"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241007/a11ae706dbb4538d3092186690404790/notes_pre_post/1040g3k031va3grp840205pcsn828i1gl4fgpuao!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-254",
    title: "GPT Image 2！100+高级提示词；复制即用 #6",
    category: "海报",
    industry: "通用",
    description: "生图玩法 01.提示词 02.提示词 03.提示词 04.提示词 05.电商设计相关提示⋯ 06.提示词 参考例图五官发型，生成一页古早少女系时尚杂志内页，类似",
    prompt: `生图玩法
01.提示词
02.提示词
03.提示词
04.提示词
05.电商设计相关提示⋯
06.提示词
参考例图五官发型，生成一页古早少女系时尚杂志内页，类似2000s-
2010s早期日系甜美穿搭月刊风格，真实的杂志内容页。整体是高完成度
杂志排版设计，画面中要有：•主模特大图（占页面主体）•多个穿搭单品拆
解模块•妆容教学小框（眼妆、唇妆、腮红技巧）•发型技巧小
框/hairarrange 搭配建议/3days coordinate/item checklist•若干产品图（衣
服、包包、鞋子、化妆品）•杂志标题、小标题、注释、价格标签、说明
文字•版面丰富，信息量大，但排版清晰，像真实杂志，不要海报感，不
要只有 一个人物大图
07.提示词
08.UI类提示词
09.品牌视觉系统
10.游戏图标
SWEET GIRL LOOK ®
古早少女系
甜美穿搭特辑
激发你的少女心 轻盈温柔的春日甜系Style
item. clese-4p
单品拆解
⑦薈丝花边针织开衫
G 螺螺结发夹
•- ¥39
小巧精致，
］亞状提升蹈箋！
领口酱战花边设计。
昭英加分！
12.电商详情页
13.游戏组件
温柔的针织、蕾丝与蟛螺结，
是属于少女的浪漫关键调。
这个春天，一起穿上出美的心动搭配，
微回闪闪发光的自己吧！
② 酱丝内搭吊带
•- ¥159
给厨堡。覆过花边。
v。’，单穿没内语都孩可爱。
14.3D图标
15.产品海报
本開主題
奶浊铳×蕾丝
少女感
次鞍色针织开衫
嫦添温柔燊阻醬S
③ 格纹百褐裙
¥219
好奇色格饮.
16.卡片设计
17.封面设计
本扇模特：小美
⑤ 爱心随条包
¥199
小巧可爱。日果好搖！
18.建筑拆解图
最春次效農當蝕飛裝懷烤。
认力“少女心是承运的襄法-
⑥ 玛豳珍鞋
复古國头设计。
19.百件A字头物品矩⋯
20.史诗级海报
蜒罚蚣瘼夫
酱肽槃品
草碣銎点
。双上分楼为参考物。具体别门店分理，
21.古风诗人镭射典藏.
22.炫酷游戏界面UI设….
23.古早少女系时尚杂⋯
s-3days coordina
make uD lesson
妆容教学
hair arrange
*3日甜美穿搭提寨
① 眼妆重点
②唇妆重点
发型技巧
Day! Mondy
Day2 Wetresdy
③ 腿红重点
甜吴半扎发教程
粉色溫殺风
奶油学脘风
严没梭色打庭。
在草粟驃处鬆扫
控荐蜜镜耪戕奶杲色
眼尾鬆键像染，
打逸自然寝專5。
方肉果燥，元气
Day3 Friday
確花妁会风
24.极简留白涂鸦手绘..
25.神话三国枪战世界
兴健河：水润 自路
26.一页字典生成
-本關推荐彩教单品
27.增肌训练计划
在魑厨扎起。
注愈僦持篷蚣速。
调整刘而更减粉！
Point！
v 越车可男春发博驳看，潭加空气5
吩发尾雡吞更盟溫柔
28.手账拼贴
MLSTUART
针统开衫•當数糯
罕粽毛衣+株坟杷
29.游戏联名海报（来⋯.
item checklist
本期甜美必备清单
囗 鹬世花边针织开顿
囗 樯纹百褐號
囗马硒珍鞋
口 螺辉结及饰
口 链亲包
口 鷺拉抹/中營妹
口 淡色系英孜品 口 小5便浅镇子
随身小物推荐
搭配建议：
色彩搭配
以好递色。没粉色，该者色为主，
臺售次拍晚一，更园温染气员。
层次叠穿
利用针织开衫、當然内楼、村杉等
单品叠穿。地加通型眉次感。
鞋包呼应
职子与包怨颗色呼皮，妈节处加入
心彭糗于
¥35
可爱叉实用的小物，让每一天卷甜醋的C
058
SMEET GI8L. STYLE / Agil 200
下期預告：日系通動溫柔风，
教请期待！6
86%（`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241007/ea1ebc9c90a172026829b0ffc8f40691/notes_pre_post/1040g3k031va3grp8402g5pcsn828i1glmhp993o!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-255",
    title: "GPT-image-2 test (duct-tape-1)",
    category: "海报",
    industry: "通用",
    description: "Create a movie poster for a film where a gorilla blends into a human city and th",
    prompt: `Create a movie poster for a film where a gorilla blends into a human city and thrives in intellectual labor. Text in Japanese. High information density.`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGAAQSAawAADzFh?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-256",
    title: "I fed GPT-2 Image this Y2K dreamgirl pro",
    category: "海报",
    industry: "通用",
    description: "\"Create a photo of me in a dreamy y2k style portrait of me laying on a shiny pin",
    prompt: `"Create a photo of me in a dreamy y2k style portrait of me laying on a shiny pink satin bedding as i hold a large 90s style chorded phone and in a thoughtful daydreaming pose. Her long black hair falls freely in loose curls with pink clips on each side. She wears delicate jewelry including dainty gold necklaces and accessories and gold chunky rings. The room behind her is girly and daydreamy with 90s posters. Her makeup is simple yet glamorous with brown lipgloss and brown lip liner. The photo should have a grainy 90s style to it with a light source like a lamp in a dimly lit room at night. The ghostface killer should be behind her staring at her, his body dimly lit, standing in the doorway of a dark hallway. The background should feel slightly dark and ominous." What I was going for: Soft Y2K Tumblr / early 2000s aesthetic Dreamy, feminine, almost nostalgic vibe Then quietly inject horror in the background What I got: Insane contrast between cozy and unsettling That “you don’t notice it at first” horror energy Feels like a lost 90s thriller frame Kinda curious — what would you tweak in this prompt to make it even more unsettling without ruining the soft aesthetic? Share your similar Y2K Ghostface photos in the comments below!`,
    tags: ["海报"],
    image: "https://i.redd.it/2alr9y459ywg1.png",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-257",
    title: "Midjourney + GPT Image 2 Prompt: create ",
    category: "海报",
    industry: "通用",
    description: "Midjourney + GPT Image 2 Prompt: create a poster using this image",
    prompt: `Midjourney + GPT Image 2 Prompt: create a poster using this image`,
    tags: ["海报"],
    image: "https://pbs.twimg.com/media/HGnCAHkWAAAULVe?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-258",
    title: "Minimal Geometric Product KV Poster with",
    category: "海报",
    industry: "通用",
    description: "请为【主题产品】创作一张“极简几何装置风产品海报”。 如果我提供了产品图片，请以该图片为主要参考，保留产品的核心外观特征、包装形态、颜色、材质、品牌识别和整体气",
    prompt: `请为【主题产品】创作一张“极简几何装置风产品海报”。

如果我提供了产品图片，请以该图片为主要参考，保留产品的核心外观特征、包装形态、颜色、材质、品牌识别和整体气质，并优先沿用产品图中的主色调与配色关系进行设计。
如果我没有提供产品图片，请根据【主题产品】自动生成符合该产品定位的产品外观与包装设计，并根据产品属性、品类特征和气质，自动匹配自然合理的主色、辅助色、道具造型与展示方式。

海报整体风格要求：
画面采用高键白色或暖白色摄影棚背景，整体干净、通透、柔和、明亮，具有高级商业感与现代品牌视觉气质。构图不是普通电商棚拍，而是像品牌视觉提案、艺术静物摄影与3D产品陈列结合的概念海报。

画面主体应包含：
1. 【主题产品】本体
2. 产品包装
3. 与产品相关的原料、切片、部件、功能元素或材质细节

三者共同构成完整的视觉链路，使观者一眼就能理解“这是什么产品、内容是什么、卖点或来源是什么”。

场景中加入简洁且具有设计感的几何装置道具，例如：圆柱、方块、长条块、圆环、球体、半圆、平台、堆叠积木、亚克力支架、玩具感结构体等，用于承托、悬置、围绕或衬托产品主体，形成富有秩序感、节奏感和层次感的艺术陈列构图。

整体配色应围绕产品本身自然展开，以产品关联色为主视觉核心，搭配白色、奶油色、浅灰色等中性色，必要时加入少量辅助点缀色，使画面颜色统一、克制、舒适、清爽，不杂乱、不花哨。不同产品应自动适配不同配色，不固定使用某一种背景色。

材质表现要细腻真实，具有高质量商业渲染质感。透明塑料、亚克力、磨砂材质、纸质标签、玻璃、金属、光滑塑胶、果肉纹理、食材纹理或产品表面细节都应自然可信。可以有轻微反射与柔和阴影，但不要过重、不要脏乱。

构图要求留白充足，主体明确，画面平衡，视觉整洁，具有轻松、温和、现代、精致、亲和、带一点童趣但不幼稚的品牌气质。整体感觉像一张高审美的品牌产品KV海报，非常适合电商主视觉、社交媒体种草图、产品展示图。

输出要求：
- 竖版构图
-  比例
- 单张海报
- 高级感、简洁感、品牌感强`,
    tags: ["海报", "中文"],
    image: "https://pbs.twimg.com/media/HGgx1QPXAAAEj5U.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-259",
    title: "Pet Brand Collaboration Poster",
    category: "海报",
    industry: "通用",
    description: "Theme: \\\"77 (cat's name) X KFC\\\" collaboration poster. Generate a collaboration ",
    prompt: `Theme: \\"77 (cat's name) X KFC\\" collaboration poster. Generate a collaboration poster featuring the same pet (absolutely consistent in appearance and coloring) with KFC brand identity (red-and-white color scheme, classic logo, restaurant scenes, etc.). Have the cat wear a KFC employee uniform, KFC employee hat, and name badge while standing at the counter, selling fried chicken, burgers, and combo meals, and interacting with chicken buckets, fries, soda, and other brand elements. The style should be lively and fun with a commercial co-branding feel, suitable for online promotion and event posters. Add appropriate Chinese copy freely for the poster.`,
    tags: ["海报"],
    image: "https://github.com/user-attachments/assets/7efff353-b76b-4986-9894-24823e630dd7",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-260",
    title: "Retro Revival: Forrest Gump Ticket Desig",
    category: "海报",
    industry: "通用",
    description: "设计一张[电影名称]的复古电影票根海报，风格为黑白木刻版画/油印版画。 画布：竖版3:4比例，纯黑色背景。 ━━━━━━━━ 整体布局 ━━━━━━━━ 左侧（",
    prompt: `设计一张[电影名称]的复古电影票根海报，风格为黑白木刻版画/油印版画。  
画布：竖版3:4比例，纯黑色背景。

━━━━━━━━ 整体布局 ━━━━━━━━

左侧（占宽20%）：垂直排列3张完全相同的缩小版票根，  
像胶片负片一样上下叠放，每张之间用圆形打孔分隔。  
右侧（占宽80%）：1张大幅主票根，竖向排列，填满画布全高。  
左侧与右侧内容100%一致，左侧仅为等比缩小3倍的重复，不得变形。  
票根内所有文字元素全部左对齐，无任何居中排列。

━━━━━━━━ 票根内容（从上到下）━━━━━━━━

【主插图区】占票根高度45%  
该电影最具代表性的木刻版画场景，纯黑白，  
密集排线质感，零灰色，极高对比度，无任何中间色调

四边锯齿形打孔撕边边框贯穿全票

【标题区】全部左对齐  
中文片名[中文片名](%E5%B9%B4%E4%BB%BD) ← 最大字号，粗黑体，视觉重量最重  
英文片名 [English Title] ← 次大字号，衬线体，紧跟中文下方

- 虚线分隔

【信息区】全部左对齐

以下所有行：导演、类型、日期、HALL/SEAT/PRICE、DATE/TIME，  
必须使用完全相同的字号、完全相同的字重、完全相同的字体，  
视觉效果如同一台老式针式打印机从头到尾连续打印，  
中途从未换过字号或字体，每一行文字高度像素级一致。

字体规格：

- 字号：极小，约9px等效，不得超过这个尺寸
    
- 字重：极细，笔画纤细如针，类似 Courier New Regular
    
- 字形：等宽字体，每个字符占格相同
    
- 质感：轻微色块不均，模拟色带油墨印迹，  
    部分笔画边缘略有锯齿或断点，非完美矢量

排版节奏严格还原如下（全部顶格左对齐）：

[国家] 导演中文姓名 Director English Name  
Genre1/Genre2  
首映日期(节展名称) / 上映日期(地区) / XXX分钟

---

HALL : SEAT : PRICE :  
[XX] [XX-XX] [XX.X]  
DATE : TIME :  
[DD/Mon/YYYY] [HH:MM-HH:MM]

---

此信息区每一行在视觉上拥有完全相同的存在感，  
如同一张连续打印的收据，无任何行拥有视觉特权，  
无加粗，无字号差异，无例外。

【台词装饰区】全部左对齐  
台词外围仅用一根细线单框围合，四角无花纹无装饰，  
线条纤细均匀，类似钢笔划出的简单矩形边框，  
留有适当内边距，边框与票根左右边距对齐，  
框内文字左对齐排列：

“[该电影最经典的英文台词]”  
手写草书字体或打字机字体，字号略大于信息区

━━━━━━━━ 强制执行规则 ━━━━━━━━

【字号层级 · 全局唯一标准】  
第1级：中文片名 → 最大，粗黑体  
第2级：英文片名 → 次大，衬线体  
第3级：台词 → 中等，手写草书或打字机体  
第4级：信息区全部内容 → 最小，等宽极细体，  
导演/类型/日期/HALL/SEAT/PRICE/DATE/TIME  
所有行严格等高等重，像素级一致

【绝对禁止】  
✗ 画面中出现任何序号标记（①②③等符号一律不得渲染）  
✗ 任何区域出现居中对齐，全局统一左对齐  
✗ 台词边框出现花纹、角饰、藤蔓等复杂装饰  
✗ 信息区任意两行出现字号差异  
✗ HALL / SEAT / PRICE 三列出现高低错位  
✗ DATE / TIME 两列字号不一致  
✗ 信息区出现任何加粗或加重笔画  
✗ 左右票根出现非等比变形  
✗ 任何字段保留占位符，必须填写真实内容

电影名称：阿甘正传`,
    tags: ["海报", "中文"],
    image: "https://pbs.twimg.com/media/HGf3yvObEAA_ILQ.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-261",
    title: "image2.0｜免费个人海报生成指令",
    category: "海报",
    industry: "通用",
    description: "整体风格：电影感强烈（cinematic style），光影具有戏剧性，对比鲜明，氛围高级，参考高端视觉设计平台（如Behance风格），具备获奖级海报设计质感",
    prompt: `整体风格：电影感强烈（cinematic style），光影具有戏剧性，对比鲜明，氛围高级，参考高端视觉设计平台（如Behance风格），具备获奖级海报设计质感， 画面细节丰富，超高精度（ultra detailed），4K级别清晰度，边缘锐利， 人物在所有画面中必须保持身份一致性（同一张脸、同一人），面部结构稳定真实， 构图专业、层次分明、视觉引导清晰，整体设计简洁但富有冲击力，
画面底部预留文字区域，用于人物姓名与标题，具体内容为，第一行：“your name” 手写体，第二行“xxxxx”字体风格现代、简洁、具有设计感，
避免：人脸变形、多人脸不一致、模糊、低清晰度、结构错误、画面杂乱、融合生硬
}
#image2 #海报 #ai #教程 #gpt #ai生图 #gpt更新`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241202/3d740441f00ad7e6dccd0f825c0d2003/spectrum/1040g34o31va6g4so1u405ott2qppi5lf06cge40!nd_dft_wgth_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-262",
    title: "image2这几个提示词太酷了 必须分享一下 #5",
    category: "海报",
    industry: "通用",
    description: "一个高度精细的极简未来主义海报设计，整体采用干净的黑白配色，并辅以铬质液态金 属点缀。画面中心是一件大型、超写实、具有高光泽感的金属流体雕塑，其形态类似流 动的",
    prompt: `一个高度精细的极简未来主义海报设计，整体采用干净的黑白配色，并辅以铬质液态金
属点缀。画面中心是一件大型、超写实、具有高光泽感的金属流体雕塑，其形态类似流
动的水银或熔融的铬金属，以有机的方式扭曲、盘旋，并穿插于粗体无衬线字
体“DRIFTIQUE”之中（排版拆分为上方“DRIF”
”，下方“TIQUE”）。
整体版式为一本虚构品牌的非对称杂志封面风格，品牌名称为：
“ASTERIOD SUPPLY No.8™ — UTILITY FOR UNKNOWN TERRITORIES”
请在画面中精确放置以下文本元素，并严格对应位置：
• 左上角：
“ASTERIOD SUPPLY No.8™”
“UTILITY FOR UNKNOWN TERRITORIES”
•右上角（使用优雅的衬线字体呈现引用语）：
“让运动引导探索，而不是让目的地决定路径，这是一种哲学。”
• 左侧竖排文字：
“为那些处于边界之间、模式被打破的领域而构建。”
• 右侧竖排文字：
“RESEARCH •OBSERVE• DRIFT"
“WORLDWIDE UNKNOWN”
• 左下角：
“DROP 008 LIMITED RELEASE”
大号数字：“2046”
“05.24.2046 12:00 UTC"
条形码编号：“AS08-DRFQ-001”
•底部中间：
“不迷失，也未被找到。漂流，才是意义所在。”
• 右下角：
“ASTERIOD SUPPLY™ DESIGNED IN ORBIT FOR FUTURE USE”
（译意：ASTERIOD SUPPLY™ 于轨道中设计，服务未来用途）
整体视觉要求：
极致干净、强对比、高端印刷级质感；
排版精准且具有高级编辑设计感；
细微且克制的投影处理；
金属流体表面具备锐利反射与真实高光表现；
电影级光影氛围；
8K 分辨率；
整体呈现为高端杂志级视觉输出；
风格为科幻极简主义（sci-f minimalism）。
创意来自：X`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241006/6d4f29f6ab5801250046bf40594af462/notes_pre_post/1040g3k031v8fknnqhu1g44dj3qsfrsi7pkom84o!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-264",
    title: "一条指令用GPT Image V2画顶级SCI综述图",
    category: "海报",
    industry: "通用",
    description: "一条指令用GPT Image V2画顶级SCI综述图 我刚试了下，核心不是一句“帮我画张高级综述图”，而是要把指令写成综述图导演脚本。 一条有效指令至少要包含 ",
    prompt: `一条指令用GPT Image V2画顶级SCI综述图
我刚试了下，核心不是一句“帮我画张高级综述图”，而是要把指令写成综述图导演脚本。
一条有效指令至少要包含 5 个点：
1. 先定图的身份
告诉它这是 top-tier SCI review figure / graphical abstract，不是 PPT 插图，也不是科普海报。
2. 再定研究主题
比如：
Laser-processed CFRP: from surface modification to serviceability assessment
主题要有完整研究链条。
3. 给清楚版式逻辑
左边是工艺输入，中间是表征和机制，右边是性能评价，底部是决策框架。
这样它才不会乱堆图标。
4. 明确每块画什么
比如激光作用、CFRP层板、SEM/Raman/XPS、纳米压痕、DCB、单搭接、重涂附着力、服役适用性判断。
5. 规定风格和禁区
要写 clean, modern, publication-ready, Nature Reviews style。
同时要禁止 cartoon、low-quality clipart、过多文字、跑到生物医学元素。
我的感受是：
GPT Image V2 画 SCI 图不是不会画，而是你不能只给它一个“主题”，要给它逻辑、层级、模块和风格边界。
#sci #gpt #科研 #学术论文 #科研日常 #博士 #AI #科研工具 #综述 #画图`,
    tags: ["海报", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241212/3d7d63b85a4360488eff1b791dac8544/notes_pre_post/1040g3k831v8la4ifii705na878hlkgv87p0jee0!nd_prv_wgth_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-265",
    title: "广州城市印象燕子海报",
    category: "海报",
    industry: "通用",
    description: "制作一张 9:16 广州城市海报。以 S 形墨线与玻璃燕子为核心，串联广州地标、白鹤、远山与金线光流，整体神秘、诗性、东方超现实。",
    prompt: `制作一张 9:16 广州城市海报。以 S 形墨线与玻璃燕子为核心，串联广州地标、白鹤、远山与金线光流，整体神秘、诗性、东方超现实。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2045873940883808523-guangzhou-city-impression-swallow-poster/guangzhou-city-impression-swallow-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-266",
    title: "广州梦归城城市海报",
    category: "海报",
    industry: "通用",
    description: "制作一张高完成度的 9:16 东方幻想风城市海报。用自左下向右上升起的 S 形斜向构图，背景从深黑渐变到暗红，并加入微弱星尘与颗粒。画面中央贯穿一条如火焰般流动",
    prompt: `制作一张高完成度的 9:16 东方幻想风城市海报。用自左下向右上升起的 S 形斜向构图，背景从深黑渐变到暗红，并加入微弱星尘与颗粒。画面中央贯穿一条如火焰般流动的金色能量光带，带有粒子、渐变高光、体积光与细小发光碎片。在这道金色光流中层层显现广州地标，以广州塔为核心，并纳入珠江新城天际线、猎德大桥以及兼具现代感与岭南气质的建筑线稿。画面底部放置一位东方白发女性，长发自然融入金色光带，闭眼抱着点缀微光粒子的彩色花束，象征人与城市的精神连接。整体气质要宏大、神秘、略带治愈感与神话感。顶部中央整合文字“广州·中国”，并配上“2026/04/20”与“LIYUE”，颜色使用浅金或暖白。强调商业海报级精修、丰富粒子细节、电影感打光与干净的 8K 细节。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2046243132774494607-guangzhou-dream-return-city-poster/guangzhou-dream-return-city-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-267",
    title: "穷奇东方美学海报",
    category: "海报",
    industry: "通用",
    description: "在平整哑光的厚质白色艺术纸上，创作一张极简新中式立体海报，采用诗意东方山水构图与不规则撕纸边缘。主体为中国神兽“穷奇”，形态完整惊艳，线条流畅优雅，眼神明亮锐利",
    prompt: `在平整哑光的厚质白色艺术纸上，创作一张极简新中式立体海报，采用诗意东方山水构图与不规则撕纸边缘。主体为中国神兽“穷奇”，形态完整惊艳，线条流畅优雅，眼神明亮锐利，神情威严，姿态舒展，并结合华丽的装饰艺术风格与传统中式纹样。使用荧光蓝线稿、极细的 0.5 毫米金属金描边、醒目的白色泼墨、饱满色彩、红色基底与浪漫的蓝色诗意氛围。整体场景要有冷暖交织的梦幻光线、强烈明暗对比、飞舞花朵、禅意东方气息、充足留白、装框式构图与清晰细节。画面下方加入书法文字“东方美学”、日期“2026/04/18”，以及签名“CHINA”和“@LIYUE”。`,
    tags: ["海报", "中文"],
    image: "https://cdn.gptimagelab.com/prompt-libraries/awesome-gptimage2-prompts/x-2045506567735558336-qiongqi-eastern-aesthetics-poster/qiongqi-eastern-aesthetics-poster-1.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-268",
    title: "image2这几个提示词太酷了 必须分享一下",
    category: "产品视觉",
    industry: "通用",
    description: "BRAND INTRODUCTION DESIGN Tao* BRAND VISUAL HANGBOOK WRoNID IESTK 02 BRAND ESSEN",
    prompt: `BRAND
INTRODUCTION
DESIGN Tao*
BRAND VISUAL HANGBOOK
WRoNID
IESTK
02
BRAND
ESSENCE
03
MISUAL
IDENTITY
DESIGN Tao'
十
FUTURS
24
COLOR
SYSTEM
GRAPHIC
ELEMENTS
•BA282
∞05∞
+
LOtt
DESIGN
Tao
DESIGN
Tao
05
TYPOGRAPHY
Tao Grotesk
AUCORECIHHINOPRQRATUYWXYZ
Tao Display
AHCOL FMAIUKOORCRRIUNWXYZ
0123456789
07
PRODUCT
OBSESSION
DESIGN Taa
a
VISUAL
EXPERIMENTATION
PACKAGING
EXPLORATION
DESCN
Toa
EDITORIAL
PHOTOGRAPHY
IMMERSIVE
RETAIL
CROSS-PLATFORM
APPLICATION
DBS SY
THANK YOU
Tao
DESIGN T80`,
    tags: ["产品视觉", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241006/6ff1e578584a8e79cdce4eec1713ca97/notes_pre_post/1040g3k031v8fknnqhu2044dj3qsfrsi7ruet7d8!nd_dft_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-269",
    title: "image2这几个提示词太酷了 必须分享一下 #2",
    category: "产品视觉",
    industry: "通用",
    description: "DESIGN Tao' BRAND YGSUAL HANCBCOK WACN1D 02 BRAND ESSENCE 2 COLOR SYSTEM MILCW •",
    prompt: `DESIGN Tao'
BRAND YGSUAL HANCBCOK
WACN1D
02
BRAND
ESSENCE
2
COLOR
SYSTEM
MILCW
•BAT82
QscEn
c6
GRAPHIC
ELEMENTS
VISUAL
EXPERIMENTATION
EDITORIAL
PHOTOGRAPHY
CROSS-PLATFORM
APPLICATION
Avred wad witnenee
D8S 9Y
Ta0
01
BRAND
INTRODUCTION
OESCNT
JESOK
03
VISUAL
IDENTITY
DESIGNTao*
GIAY
DESIGN
Ta0
DESIGN
1ao
05
TYPOGRAPHY
Tao Grotesk
AUICORE CIUHINQORORAIUVWXYZ
0123456789
wccouw1on
Tao Display
012:54'1/155
07
PRODUCT
OBSESSION
-八m～
DESIGN Tao
PACKAGING
EXPLORATION
DESCN
Tao
IMMMERSIVE
RETAIL
13
THANK YOU
別母不关，自不 。
DESIGN 1ao`,
    tags: ["产品视觉", "中文"],
    image: "https://sns-webpic-qc.xhscdn.com/202604241006/148a9edcee1adf24685734a6c4611e99/notes_pre_post/1040g3k031v8fknnqhu0044dj3qsfrsi76t5jukg!nd_prv_wlteh_webp_3",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-272",
    title: "1980s Propaganda Poster",
    category: "文字渲染",
    industry: "通用",
    description: "Generate a 1980s propaganda poster. Use the exact slogan \"热烈庆祝GPT-Image-2全量开放\". ",
    prompt: `Generate a 1980s propaganda poster. Use the exact slogan "热烈庆祝GPT-Image-2全量开放". Include Sam Altman, Dario Amodei, and Elon Musk, and give Dario Amodei a red scarf.`,
    tags: ["文字渲染", "中文"],
    image: "https://pbs.twimg.com/media/HGbWGhYaAAEtoTn?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-273",
    title: "Chinese Tea Drink Product Launch Poster",
    category: "文字渲染",
    industry: "通用",
    description: "Design a 3:4 vertical poster for a new Chinese trendy tea launch. Use a New Chin",
    prompt: `Design a 3:4 vertical poster for a new Chinese trendy tea launch. Use a New Chinese visual style that feels light-luxury and restrained. The palette should be dark green, off-white, and gold, with rice-paper texture, elegant negative space, landscape accents, and modern layout design.

Main subject:
a visually appealing cold-brew tea with tea leaves, citrus, ice cubes, and touches of gold foil.

The poster must accurately display the following exact Chinese copy:
"山川茶事"
"山柚观音"
"冷泡系列"
"新品上市"
"一口清醒，半城入夏"
"限定尝鲜价"
"中杯 16 元"
"大杯 19 元"
"门店活动"
"第二杯半价"
"加 3 元升级轻乳版"
"每日前 100 名赠限定杯套"
"推荐风味"
"观音茶底 / 西柚果香 / 轻乳云顶 / 冰感回甘"
"活动时间 4月20日 至 5月10日"
"扫码点单"
"SHANCHUAN TEA"

Fine print:
"图片仅供参考，请以门店实际售卖为准"

Maintain a clear promotional hierarchy while keeping the overall feeling sophisticated rather than cheap or overly e-commerce-like. Pay special attention to small text, numbers, prices, info modules, and Chinese typography aesthetics.`,
    tags: ["文字渲染", "中文"],
    image: "https://github.com/user-attachments/assets/552ba84c-41cb-401d-a1b0-ee13a6f7aa41",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-275",
    title: "Handwritten Chinese Medical Prescription",
    category: "文字渲染",
    industry: "通用",
    description: "Generate an image of a handwritten Chinese medicine or Western medicine prescrip",
    prompt: `Generate an image of a handwritten Chinese medicine or Western medicine prescription`,
    tags: ["文字渲染"],
    image: "https://pbs.twimg.com/media/HGaqaO2W4AA2W-6?format=jpg&name=large",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-276",
    title: "High-End Skincare Product Poster",
    category: "文字渲染",
    industry: "通用",
    description: "Create a high-end skincare e-commerce hero poster for \"澄光维稳精华\" (\"Clarifying Stab",
    prompt: `Create a high-end skincare e-commerce hero poster for "澄光维稳精华" ("Clarifying Stabilizing Essence"). The style should be clean, light-luxury, and strongly science-skincare oriented. In the center, place a semi-transparent frosted-glass essence bottle filled with golden liquid and subtle water-droplet reflections. Use an off-white to warm gray gradient background with liquid-flow elements and microscopic molecular-structure decoration.

The poster must include the following exact Chinese copy:
"澄光"
"维稳精华"
"修护屏障"
"舒缓泛红"
"细腻透亮"
"第 2 代升级配方"
"核心成分"
"神经酰胺"
"泛醇 B5"
"积雪草提取物"
"微囊脂质体"
"适合人群"
"敏感肌"
"熬夜肌"
"换季不稳定肌"
"限时到手价 229 元"
"买 1 送 3"
"赠洁面 15ml"
"赠精华 5ml"
"赠面霜 10g"

Fine print:
"实际效果因人而异，请坚持使用"

Focus on product selling points, pricing hierarchy, gift-list modules, product naming, and short functional phrases. The result should feel premium and not tacky or overly live-commerce styled.`,
    tags: ["文字渲染", "中文"],
    image: "https://github.com/user-attachments/assets/e1ddd78f-3b18-490f-bdd9-a4e5bbee147d",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-277",
    title: "Jingdezhen Blue-and-White Porcelain Diag",
    category: "文字渲染",
    industry: "通用",
    description: "Generate a detailed explanatory diagram of Jingdezhen blue and white porcelain, ",
    prompt: `Generate a detailed explanatory diagram of Jingdezhen blue and white porcelain, accompanied by detailed Chinese knowledge analysis.`,
    tags: ["文字渲染"],
    image: "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/assets/opennana/jingdezhen-blue-white-porcelain-diagram.jpeg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-278",
    title: "Key Character Relationship Map",
    category: "文字渲染",
    industry: "通用",
    description: "Please generate a key character relationship diagram for \"XXX\".",
    prompt: `Please generate a key character relationship diagram for "XXX".`,
    tags: ["文字渲染"],
    image: "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/assets/opennana/key-character-relationship-map.jpeg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-370",
    title: "AI 聊天截图与解剖学海报",
    category: "信息图",
    industry: "通用",
    description: "一张竖屏的 AI 聊天应用界面截图，显示了简洁的 iOS 风格白色屏幕。顶部栏左侧有一个汉堡菜单，中间是蓝色的“Thinking”标题及一个小箭头，右侧有两个图",
    prompt: `一张竖屏的 AI 聊天应用界面截图，显示了简洁的 iOS 风格白色屏幕。顶部栏左侧有一个汉堡菜单，中间是蓝色的“Thinking”标题及一个小箭头，右侧有两个图标分别用于新建和更多选项。顶部附近有一个圆角浅灰色用户消息气泡，内容为日语：“Attention機構を人体に喩えて細かくラベルを付けて。医学書の精緻な挿絵風に。”（请将注意力机制比作人体并进行详细标注。采用医学书籍中精致插图的风格。）下方有浅灰色的系统文字显示“Thought for 5s”和“画像が作成されました”。屏幕下半部分展示了生成的图像，这是一张详尽的医学教科书风格解剖学海报。海报展示了一名成年女性从头部到大腿上部的逼真四分之三背影，她头部微向左转，深棕色头发扎成凌乱的发髻。身体大部分的皮肤和外层组织被移除，露出肌肉、神经、血管和纤维结构，以极其细腻的复古医学插图风格呈现在暖色调的米黄色纸张背景上。一个矩形切口遮挡了从前额到下颌的面部中心，在面部区域形成了一个被审查的空白块。细微的发光网络线条和节点叠加在暴露的大脑和身体上，将注意力机制可视化为一种解剖系统。人物周围有 6 个带编号的解释面板和 2 个附加文本块，全部密密麻麻地填满了日语和英语双语标签、公式、箭头和图表。海报左上角的主标题为“アテンション機構の解剖学的構造”，副标题为“The Anatomy of the Attention Mechanism”。右上角是一个标有“Overall Flow of Attention”的流程图，包含 5 个相连的方框，描述了从输入到输出的过程。左侧是 3 个堆叠的解释部分，包含方程式和映射表。右侧是另外 3 个带编号的部分，每个部分都有技术说明和小型图表或矩阵；可见的小型图表包括 1 个紫色热力图矩阵、1 个蓝色柱状图和 1 个多色立方体图形。底边有 5 个带有说明文字的小型大脑插图，展示了信息流的各个阶段。整体美学应呈现为一张经过高度润色的 AI 生成截图，记录了一个超现实的科学插图请求，具有清晰的 UI、大量微小可读的标签，以及 Transformer 注意力图表与古典解剖图设计的完美融合。`,
    tags: ["信息图"],
    image: "https://cms-assets.youmind.com/media/1776883141625_vrxilt_HGcMDzKaAAA61Vy.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-371",
    title: "Meme 生命周期编辑信息图",
    category: "信息图",
    industry: "通用",
    description: "{\"type\":\"编辑信息图海报\",\"style\":\"瑞士现代平面设计，融合粗野主义排版、极简网格布局、单色基调配以酸橙色点缀、半色调纹理、拼贴元素、简洁的留白",
    prompt: `{"type":"编辑信息图海报","style":"瑞士现代平面设计，融合粗野主义排版、极简网格布局、单色基调配以酸橙色点缀、半色调纹理、拼贴元素、简洁的留白，以及在极浅暖灰色背景上的高对比度黑色文字","subject":"一张解释互联网 Meme 作为一种文化系统生命周期的信息图","canvas":{"orientation":"纵向","background":"极浅灰色纸张纹理"},"layout":{"headline_block":{"position":"左上角","title":"Meme 生命周期","subtitle_top":"今日爆火，明日即逝。","body":"Meme 的传播速度极快。它们诞生、传播、演变、达到顶峰并逐渐消退——最终被铭记、重混或遗忘。这就是循环。"},"intro_icon":{"position":"左上角标题附近","description":"一个小型的轮廓正方形，内含一个地球图标，右侧带有简短说明","caption":"// 注意力经济中的通用循环"},"left_sidebar":{"position":"最左侧垂直排列","count":4,"items":["心形轮廓图标","对话气泡轮廓图标","转发/转推轮廓图标","书签轮廓图标"]},"main_sections":{"count":5,"path":"由细黑色曲线箭头连接，在页面上形成一个循环路径","sections":[{"number":"01","title":"诞生","position":"右上角","visual":"黑白半色调猫咪肖像，正视前方，戴着超大霓虹酸橙色星形太阳镜；猫咪身后是一个带有小写字母 'a' 的锯齿状酸橙色星爆图案和一个酸橙色虚线矩形","body":"灵感的火花。新的格式，新的笑话，新的语境。它是小众的。它是一切。"},{"number":"02","title":"传播","position":"中右侧","visual":"巨大的变形黑色文字 'SPREAD'，垂直拉伸并液化，周围有几个小型酸橙色方形箭头图标和微小的黑色裁剪/角标","body":"分享、转发、再分享。它脱离了原始语境。它找到了受众。"},{"number":"03","title":"演变","position":"中左侧","visual":"4 个重叠元素的拼贴：一个带有浏览器窗口边框的灰度蒙娜丽莎裁剪图，前方有一个巨大的小写酸橙色 'e'，右侧是一个黑白像素艺术块形状，以及一个小的酸橙色便签框，列出了 5 次 'evolve' 一词，最后一行逐渐淡出","body":"重混。重新语境化。它变异成新的形式。笑话要么适应，要么消亡。"},{"number":"04","title":"巅峰","position":"中右侧（低于传播）","visual":"由细垂直条组成的酸橙色钟形曲线直方图，位于黑色测量框内，带有一个小型中心十字准线","body":"最高可见度。主流采纳。每个人都懂了。然后它开始变得陈旧。"},{"number":"05","title":"消退","position":"左下至中下","visual":"粗体黑色小写单词 'fade'，向右逐渐分解为散落的黑色颗粒","body":"兴趣下降。新的 Meme 取而代之。它逐渐淡出，走向默默无闻——或成为遗产。"}]},"bottom_callout":{"position":"左下角","icon":"带有白色星号/星形符号的小型黑色正方形","text":"Meme 是暂时的。但影响力不是……","button":"你会创造什么？"},"footer":{"position":"底部全宽","count":4,"columns":[{"label":"格式：","value":"数字文化产物"},{"label":"周期时长：","value":"几秒到几年（或许永远）"},{"label":"燃料：","value":"创造力、语境、社区"},{"label":"结果：","value":"欢笑、连接、文化"}],"extra_icon":"最右下角的小型目标/十字准线图标"}},"typography":{"headline":"超大号粗体新格罗特斯克无衬线字体","section_numbers":"超大号粗体压缩无衬线字体","section_titles":"大写粗体无衬线字体，配有酸橙色下划线强调","body":"小型简洁无衬线字体，左对齐","footer":"小型大写标签，配以较轻的正文文字"},"color_palette":{"base":"黑色和灰白色","accent":"酸橙色 / 黄绿色","secondary":"灰度半色调"},"composition_notes":"编辑海报平衡感，左侧为超大标题，右侧为模块化信息图面板，大量留白，精确对齐，当代设计杂志美学，清晰的矢量线条与粗糙的栅格拼贴纹理混合"}`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022591434_2sp4by_HGnIN6qXcAAPrrV.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-372",
    title: "中式烹饪认知信息图",
    category: "信息图",
    industry: "通用",
    description: "一张复古手绘风格的中式信息图，印在带有撕边效果的米白色纹理纸上，采用深紫色和亮青色双色调印刷，结合了半色调阴影和海报般的漫画线条。画面对比了直觉式手工烹饪与工具",
    prompt: `一张复古手绘风格的中式信息图，印在带有撕边效果的米白色纹理纸上，采用深紫色和亮青色双色调印刷，结合了半色调阴影和海报般的漫画线条。画面对比了直觉式手工烹饪与工具辅助烹饪及认知外化。左侧，一位穿着围裙的成年厨师正在锅中进行夸张的翻炒，伴有火焰、飞溅的食材、烟雾旋涡和充满活力的运动线条；厨师的面部被一个矩形模糊块遮挡。头顶上方是一个发光的脑状思维气泡，内含 3 个小图标：调料瓶、火焰和计时器/时钟，并向外放射光芒。左下角，一条断裂的锁链悬挂在醒目的中文大字“全凭手感”旁。厨师下方，一个小人正困惑地搅拌着碗，神情焦虑，周围环绕着正好 4 个问号。画面中央，多支粗箭头从厨师的直觉指向结构化的烹饪工作流。上方中央是醒目的中文大字“照着做”。下方，一只手拿着智能手机，屏幕上显示着清晰的中文文本，包括“5 克盐”和“中火 3 分钟”，手指正在点击屏幕。手机周围摆放着量具和食材：2 把量勺、1 个量杯、1 台电子秤和 6 个整齐排列的小碗，旁边是一个冒着蒸汽的锅和一道成品菜肴。成品菜肴旁有中文文本“七八分”以及一行 5 星评分，其中 4 颗星为实心，1 颗星为空心。右侧展示了一个认知外化的概念图，一位微笑的火柴人厨师站在餐桌后。节点网络由青色线条连接，包含正好 6 个工具/信息节点：顶部的智能烤箱、2 包分别标注为“调料包”和“榨酱包”的调料、1 个标注为“精准配方”的剪贴板、1 台搅拌机、1 台电饭煲和 1 张食谱笔记。网络中心是醒目的中文大字“认知外化”。火柴人面前的桌子上摆放着正好 5 盘/碗准备好的食物。底部是一个简化的认知公式：一个大脑图标，指向一个较小的大脑图标，接着是一组外部工具/文档（包括手机屏幕、类似微波炉的设备和 3 件纸质/手册类物品），然后是一个等号，最后是一个躯干内带有齿轮的肌肉发达的人类剪影，肩部附近有一个向上箭头。在此公式下方或旁边是粗体中文文本“脑 + 外部工具 = 更强能力”，第一个“脑”字也单独显示在左侧大脑图标下方。使用富有表现力的草图箭头、涂鸦闪电、漫画强调符号，以及平衡的从左到右的流程，直观地传达从纯粹直觉到可重复系统及增强能力的转变。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022557600_511jsb_HGjRFEZbkAAQ1ny.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-373",
    title: "可爱的中文分词科普信息图",
    category: "信息图",
    industry: "通用",
    description: "一张可爱的横版手绘剪贴簿风格中文科普信息图，背景为暖米色纸张，带有圆角边框、马卡龙色涂鸦、胶带贴纸、小星星，充满课堂笔记本的氛围。顶部中央有醒目的手写体中文标题",
    prompt: `一张可爱的横版手绘剪贴簿风格中文科普信息图，背景为暖米色纸张，带有圆角边框、马卡龙色涂鸦、胶带贴纸、小星星，充满课堂笔记本的氛围。顶部中央有醒目的手写体中文标题：“什么是分词？”，其中后半部分为珊瑚粉色，其余部分为深棕色。左上方有一只 Q 版柴犬老师角色，身穿淡黄色衬衫，系着蓝色领带，正面向前方，手持教鞭向上，旁边的对话气泡写着：“今天来学习分词 (Tokenization)！”。右上方有一个可爱的蓝色方形 Token 吉祥物，上面标有“TOKEN”，正微笑着，脸颊红润，长着细小的四肢，手里拿着放大镜；旁边有一个对话气泡写着：“我是 Token！被切得越合理，模型越聪明！”。在右边缘附近，添加一张悬挂的小记事卡，上面写着“知识点 收藏夹”，并配有一个爱心图标。在标题下方，放置一个圆角虚线文本框，包含定义：“分词是将人类可读的文本切分成 Token 的过程。”，其中“Token”一词用蓝色高亮显示。下方添加一行说明文字：“下面以 “程序员Left” 和 “人工智能” 为例，看看不同的分词方式：”，其中“程序员Left”用浅蓝色高亮，“人工智能”用粉色高亮。下半部分包含 4 个从左到右排列的圆角马卡龙色面板，每个面板都有编号徽章和标题。面板 1 为薄荷绿，标题为“1 词级分词”，副标题为“按完整语义划分文本”，包含 3 个 Token 气泡：“程序员”、“Left”、“人工智能”。在此面板底部，展示柴犬老师竖起大拇指，对话气泡写着：“语义完整，容易理解！”。面板 2 为淡黄色，标题为“2 字符级分词”，副标题为“逐字切分文本”，包含 9 个排列成行的圆形 Token 气泡：“程”、“序”、“员”、“L”、“e”、“f”、“t”、“人”、“工”、“智”、“能”——以紧凑的网格形式呈现示例中的单个字符。底部展示蓝色 Token 吉祥物手持铅笔，对话气泡写着：“粒度最细，但序列会很长~”。面板 3 为淡粉色，标题为“3 子词分词”，副标题为“按词根以及前后缀划分”，包含 5 个 Token 气泡：“程序”、“员”、“Left”、“人工”、“智能”。底部展示柴犬老师正在思考，一只爪子放在嘴边，头顶上方有一个问号，对话气泡写着：“折中方案，效果 often 很好！”。面板 4 为淡蓝色，标题为“4 字节级分词”，副标题为“将字词转为字节编码，根据转换后的内容进行组合和划分”，展示 14 个圆形小代码气泡：“E7”、“A8”、“8B”、“...”、“66”、“74”、“E4”、“BA”、“BA”、“E8”、“83”、“BD”、“...”像编码字节一样排列成多行。底部再次展示微笑的蓝色 Token 吉祥物，对话气泡写着：“适合处理任意文本！”，旁边有一个微小的灯泡涂鸦。在最底部，放置一个圆角横幅备注，写着：“不同分词方式各有优势，实际应用中会根据任务和数据选择合适的方案哦！”。四个面板使用柔和的马卡龙绿、黄、粉、蓝色，搭配深棕色手写字体、细腻的阴影、圆润的形状和可爱的表情。整体构图平衡、简洁且友好，如同精美的社交媒体科普海报。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022554202_8ghln8_HGjf_J-bAAA4x5S.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-374",
    title: "太阳系信息图海报",
    category: "信息图",
    industry: "通用",
    description: "“太阳系行星指南”垂直信息图海报，以太阳系的侧视图为主题，每颗行星旁配有“身份证”，包含直径、自转周期和卫星数量等信息。冥王星被标注在边缘，并附有小字：“前第九",
    prompt: `“太阳系行星指南”垂直信息图海报，以太阳系的侧视图为主题，每颗行星旁配有“身份证”，包含直径、自转周期和卫星数量等信息。冥王星被标注在边缘，并附有小字：“前第九大行星，于 2006 年被降级”，旁边配有一个悲伤的表情。深蓝色星空背景，图形化数据设计。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022509783_u6b8u1_HGmINR3acAAGCyE.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-375",
    title: "披萨美食摄影与信息图",
    category: "信息图",
    industry: "通用",
    description: "一张高端食品摄影作品，主角是一块披萨切片，置于温暖的乡村风木质背景中央。披萨边缘金黄酥脆，马苏里拉芝士融化并带有明显的拉丝效果，底部铺满浓郁的番茄酱，配料包括意",
    prompt: `一张高端食品摄影作品，主角是一块披萨切片，置于温暖的乡村风木质背景中央。披萨边缘金黄酥脆，马苏里拉芝士融化并带有明显的拉丝效果，底部铺满浓郁的番茄酱，配料包括意大利辣香肠、黑橄榄、青椒和香草。画面细节丰富，呈现出芝士的光泽感、配料的油润感以及逼真的烘焙饼底质感。柔和的电影级光效营造出深度与细腻的阴影。超高清对焦，高级食品广告风格，超写实，8K 分辨率。

创作一张超写实的垂直拆解式美食披萨切片信息图。
从上至下的结构：
融化芝士层（带有拉丝质感的亮面马苏里拉芝士）
→ 配料层（带有自然细节的意大利辣香肠、橄榄、青椒）
→ 香草调味层（轻微散落的牛至叶碎和香料颗粒）
→ 番茄酱层（色泽浓郁且带有微光的顺滑酱料）
→ 饼底层（边缘酥脆的厚实烘焙饼底）
所有图层必须完美居中、间距均匀且垂直对齐。使用温暖的乡村风背景，配合柔和的摄影棚灯光，并在每个悬浮层下方添加逼真的阴影。整体构图应兼具高级食品广告的质感与简洁的信息图布局。
使用细指示线添加简洁的信息图标签，标签内容如下：
“Cheese”（芝士）
“Toppings”（配料）
“Seasoning”（调味）
“Sauce”（酱料）
“Crust”（饼底）

超精细食品纹理，DSLR 微距画质，超写实，高级广告美学，8K 分辨率。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022496150_zxxl34_HGlptubakAAQ3DF.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-376",
    title: "日文角色关系图海报",
    category: "信息图",
    industry: "通用",
    description: "以 REFERENCE_0 作为角色参考，将简单的阵容转化为精美的日式轻小说风格角色关系图海报。保留原有的 10 位角色，并沿用其现有的肖像画作为基础视觉，但将",
    prompt: `以 REFERENCE_0 作为角色参考，将简单的阵容转化为精美的日式轻小说风格角色关系图海报。保留原有的 10 位角色，并沿用其现有的肖像画作为基础视觉，但将布局重新设计为精致的信息图表，背景采用柔和的奶油色和淡蓝色幻想风格，配以装饰边框、闪光、玫瑰以及左上角的小型欧式酒店建筑插图。在顶部添加醒目的日文标题「支配人はかりそめの顔」，副标题为「キャラクター紹介＆相関図」，并在右上角放置一个深色徽章，标注「ネタバレ配慮版」。将女主角一条 紬希置于中心作为焦点，放入标有「主人公」的框架角色卡中；将秦野 啓司放入右侧的大型框架卡中，作为关键对应角色。将其余 8 位角色排列在周围的独立个人资料卡中：加賀坂 その葉、川原 澪、樫村、紬希の母、ハルカ、杏子、美果、桜子。用多色箭头和关系标签连接角色以可视化关系网；包含 14 个可见的关系标签：「親友」、「理解者」、「本音を見抜く」、「憧れ」、「相談」、「画策」、「仲直り中」、「直感的理解」、「メンター」、「実務支援」、「保護者的存在」、「後輩　ムードメーカー」、「後輩　グループを支える」、「後輩　明るさ・希望」。同时在一条 紬希和秦野 啓司之间添加 8 个中央水平关系标注：「偽溶み→公認」、「ライバル」、「秘密を共有」、「対等な相棒」、「気になる存在」，并在中心放置一个粉色徽章，写着「反発から信頼へ」，以及 3 个下方的标注：「信頼」、「協力を後押し」、「二人の空気に気づく」。在下方三位女孩上方添加一个金色丝带组标签，写着「ASTRALの仲間たち」。在底部添加一个包含 10 个较小摘要卡的部分，每位角色对应一张，横向排列。在最右侧添加两个带边框的侧边栏，标题分别为「作品のキーワード」和「関係の見どころ」；前者包含 4 个带图标的要点，后者包含 4 个带图标的要点。用密集的日文个人资料文本和角色标签填充每一张卡片，风格简洁且具有编辑感，如同小说附赠的宣传关系指南。整体设计需优雅、易读，呈现浪漫悬疑主题，并达到杂志级品质。`,
    tags: ["信息图"],
    image: "https://cms-assets.youmind.com/media/1776936913739_zuxbnj_HGi8-4rbYAA5C1x.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-377",
    title: "白板前的电影级劫案策划大师",
    category: "信息图",
    industry: "通用",
    description: "一幅电影感十足、氛围阴郁的劫案策划场景，背景为深夜昏暗的办公室，采用写实的惊悚片风格拍摄。一名成年男子背对镜头，侧身站立，正在一块巨大的白板上书写，白板写满了战",
    prompt: `一幅电影感十足、氛围阴郁的劫案策划场景，背景为深夜昏暗的办公室，采用写实的惊悚片风格拍摄。一名成年男子背对镜头，侧身站立，正在一块巨大的白板上书写，白板写满了战术笔记、建筑草图、平面图、箭头、路线和手绘图表。他留着深色卷发，身穿深橄榄色或炭灰色休闲夹克，搭配深色长裤，展现出策划大师的形象。白板是视觉焦点，包含多个可读的规划区域：左上角标题写着“OPERATION NIGHTHAWK”；左侧栏分为 3 个部分，分别标注为“OBJECTIVE”（目标）、“TARGET”（目标对象）和“TIMELINE”（时间线）；右上角有 2 个标注的图表区域，分别为“ENTRY PLAN”（进入计划）和“CAMERA NETWORK”（监控网络）；中右下方有 4 个标注的规划区块，分别为“TRANSIT”（交通）、“EQUIPMENT”（装备）、“HOTEL ROUTE”（酒店路线）和“CONTINGENCIES”（应急预案）。包含建筑立面草图、屋顶通道图、装卸区笔记、房间标签、黑色和红色记号笔绘制的箭头，以及下方中心附近的一辆小型货车草图。房间光线温暖且阴影重重，带有琥珀色的实用照明。画面左侧展示了一盏台灯，照亮了摆满散乱文件的深色木质书桌，墙上垂直悬挂着 3 张黑白照片。构图为中远景过肩镜头，男子位于画面偏左中心，白板占据背景主导地位。高对比度，柔和的电影颗粒感，紧张的氛围，写实的质感，呈现出类似于天才策划者准备劫案的精品犯罪剧美学，但不描绘任何特定的受版权保护的角色。在右上角添加白色的“Pollo.ai”水印。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022610930_me3su4_HGnhxouWQAAefpR.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-378",
    title: "精品汉堡商业摄影",
    category: "信息图",
    industry: "通用",
    description: "一张高端快餐商业产品摄影照片，主体为居中的精品芝士汉堡，背景为温暖的金色无缝摄影棚背景。汉堡配有光泽感的芝麻面包、新鲜生菜、番茄片、洋葱圈、融化的芝士、多汁的烤",
    prompt: `一张高端快餐商业产品摄影照片，主体为居中的精品芝士汉堡，背景为温暖的金色无缝摄影棚背景。汉堡配有光泽感的芝麻面包、新鲜生菜、番茄片、洋葱圈、融化的芝士、多汁的烤牛肉饼和浓郁的酱汁。柔和的摄影棚灯光，细腻的阴影，令人垂涎的质感，焦点清晰，超写实美食广告摄影，构图简洁，8K 分辨率。创建一个超写实的精品芝士汉堡垂直爆炸式信息图构图。顶部是质感酥脆的光泽感芝麻面包顶，下方依次为新鲜的绿色生菜叶、番茄片、洋葱圈、融化的芝士、多汁的烤牛肉饼、酱汁层以及柔软的面包底。所有食材均匀分布并完美垂直对齐。温暖的黄色无缝摄影棚背景，柔和的商业美食灯光，每个悬浮元素下方带有细腻逼真的阴影，超清晰对焦，DSLR 微距美食摄影，高端快餐广告美学，8K 分辨率。添加简洁的信息图文字标签，并使用细引线指向每个元素，标签名称如下：“Bun Top”、“Lettuce”、“Tomato”、“Onion”、“Cheese”、“Patty”、“Sauce”、“Bun Base”`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936732453_s5p113_HGfguvbbYAAi4mv.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-379",
    title: "讽刺昂贵补剂的漫画",
    category: "信息图",
    industry: "通用",
    description: "一张简洁的正方形社论漫画，采用扁平矢量风格，带有柔和的阴影和粗轮廓，背景为浅灰色。场景是一场关于价格虚高且无效补剂的讽刺性医疗咨询。左上角是一个巨大的三行西班牙",
    prompt: `一张简洁的正方形社论漫画，采用扁平矢量风格，带有柔和的阴影和粗轮廓，背景为浅灰色。场景是一场关于价格虚高且无效补剂的讽刺性医疗咨询。左上角是一个巨大的三行西班牙语粗体无衬线标题：“Suplementos”（深青色）、“costosos”（橙色）和“que no funcionan”（深青色），标题下方配有一个小的橙色闪光装饰和一条橙色下划线。右上角添加深青色的社交账号和网址：“@elnutridice” 和 “elnutridice.com”。在最左侧边缘，放置一行垂直的橙色署名：“Imagen creada en: ia.elnutridice.com”。前景中，展示一张木桌，桌上堆满了成捆的绿色现金，许多散乱的钞票在角色周围飞舞。右侧，一名沾沾自喜的男医生身穿青色手术服，外罩白色实验袍，坐在桌后，一只手拿着厚厚的一叠钱，另一只手随意地做着手势。他的脸被一个矩形模糊块故意遮挡。他的实验袍上有一个徽章或补丁，写着“SALUD Y COMISIONES”。他面前的桌上放着一个深青色的名牌，上面有一个美元符号和西班牙语文字“TU SALUD, MI NEGOCIO”。他身后的墙上挂着一张写有“CERTIFICADO DE COMISIONES”的证书，旁边的小架子上摆放着 3 件物品：2 个青色活页夹和 1 盆小盆栽。左侧，一名留着深棕色长发、身穿青色长袖衬衫的女患者面对医生坐着，一只手因沮丧而举起。她的脸同样被一个矩形模糊块遮挡。在她上方添加一个对话气泡，写着：“Doc, ese suplemento carísimo que me mandó no me sirvió para nada.” 在医生上方添加一个对话气泡，写着：“A mí sí me sirvió.” 在桌子的左下角，放置一个贴有“SUPLEMENTO PREMIUM”标签的补剂瓶，并标有橙色价格标记“$$$$”。旁边放着一个剪贴板，上面有一张处方单，显示一个大大的“Rx”和文字“SUPLEMENTO PREMIUM”。图像中总共包含 2 盆小盆栽：1 盆在地面或桌子左下方，1 盆在后方的架子上。采用幽默、批判性的社交媒体信息图风格，构图平衡，排版清晰，易读性高，并具有精致的现代矢量插画美感。`,
    tags: ["信息图", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936900327_rg1cuc_HGh9WWAXsAAK3TO.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-380",
    title: "宇航员与“生命地球”",
    category: "包装设计",
    industry: "通用",
    description: "这是一幅电影级的超现实太空场景，画面中 1 名宇航员漂浮在广袤的太空中，身旁是巨大的地球。地球占据了画面的左侧，宇航员位于右侧，双腿弯曲向后漂浮，一只手臂伸向地",
    prompt: `这是一幅电影级的超现实太空场景，画面中 1 名宇航员漂浮在广袤的太空中，身旁是巨大的地球。地球占据了画面的左侧，宇航员位于右侧，双腿弯曲向后漂浮，一只手臂伸向地球。宇航员身穿写实的白色 EVA 风格宇航服，配有深色反光面罩、背包装置以及红、黄、绿三色的肩章。地球呈现大西洋视角，南北美洲清晰可见，在深邃黑暗、繁星点点的背景下，地球边缘散发着冷蓝色的光晕。在各大洲乃至海洋上，隐约可见有机分支状的根系或神经脉络结构蔓延在表面，在北美洲尤为密集并延伸至南美洲，营造出一种黑暗的生物机械感或“生命星球”的效果。采用戏剧性的低调照明、强烈的对比度、忧郁的阴影、照片级的纹理、超精细的电影写实感、安静而压抑的氛围，以及带有大面积留白的广角构图。`,
    tags: ["包装设计", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883095960_7cf991_HGeijGZX0AANV4B.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-381",
    title: "Python 时尚人像摄影",
    category: "摄影写实",
    industry: "通用",
    description: "一张高级时尚摄影棚人像，画面中一位迷人的女性在浅灰色无缝背景前低姿蹲坐，身穿黑色长袖深 V 领迷你裙，脚踩黑色尖头高跟鞋。她留着一头浓密且富有质感的深棕色波浪长",
    prompt: `一张高级时尚摄影棚人像，画面中一位迷人的女性在浅灰色无缝背景前低姿蹲坐，身穿黑色长袖深 V 领迷你裙，脚踩黑色尖头高跟鞋。她留着一头浓密且富有质感的深棕色波浪长发，拥有健康的小麦色肌肤，指甲涂抹着深红色，佩戴着大号金色圆环耳饰。一条巨大的蟒蛇（带有棕色、棕褐色和黑色花纹）像活的披肩一样环绕在她的肩头，粗壮的蛇身垂落在她躯干两侧，蛇头悬垂在她的膝盖之间，靠近她的双手。构图居中且对称，采用垂直画幅拍摄全身，光影呈现出干净的杂志大片质感，皮肤、布料和蛇鳞的细节清晰锐利，阴影极少，展现出奢华时尚摄影风格、自信性感的姿态，背景简洁明快。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883177604_mqe0eg_HGdFntcW8AELjJc.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-382",
    title: "二战历史照片上色",
    category: "摄影写实",
    industry: "通用",
    description: "使用提供的参考图像，将原始的二战伞兵黑白照片进行写实且符合历史事实的色彩还原。保留原有的构图、姿势、装备、武器、面部裁剪区域、背景以及摄影取景。添加自然且符合时",
    prompt: `使用提供的参考图像，将原始的二战伞兵黑白照片进行写实且符合历史事实的色彩还原。保留原有的构图、姿势、装备、武器、面部裁剪区域、背景以及摄影取景。添加自然且符合时代特征的色彩：卡其色/棕褐色制服和跳伞装备、橄榄绿背包、棕色皮革靴子和绑带、木质色调的步枪枪托、深色金属枪身，泥土路和建筑使用柔和的土色调，树木呈现绿色，天空为柔和的淡蓝色。确保第 82 空降师的肩章符合历史事实，即 1 个清晰可见的红、白、蓝三色肩章。最终效果应呈现为忠实于纪录片时代的修复作品，而非现代风格的重绘。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883178758_jvdsuw_HGczQDRXwAAp4yq.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-383",
    title: "优雅酒吧咖啡桌旁的女性",
    category: "摄影写实",
    industry: "通用",
    description: "一张抓拍风格、写实的竖构图照片，展现了一位女性坐在优雅高档酒吧咖啡厅的质朴木桌旁。她位于前景中心，身体前倾，一只手肘撑在桌上，手托着下巴，营造出一种轻松、亲密且",
    prompt: `一张抓拍风格、写实的竖构图照片，展现了一位女性坐在优雅高档酒吧咖啡厅的质朴木桌旁。她位于前景中心，身体前倾，一只手肘撑在桌上，手托着下巴，营造出一种轻松、亲密且具有编辑感的生活方式氛围。她留着深棕色的长波浪卷发，中分发型垂在双肩两侧，身穿一件修身的白色罗纹长袖圆领上衣。她面前的桌上清晰可见 3 件物品：左侧是一杯装在宽口香槟杯中的桃色鸡尾酒，中右侧是一个蓝白相间的花卉陶瓷马克杯，最右侧是一个装有少量干花枝的小型透明玻璃瓶花瓶。她身后是一个灯光温暖、格调高雅的酒吧，配有大理石或石材饰面、华丽的古典天花板细节、摆满酒瓶和玻璃器皿的货架、柔和的背光照明，以及一名身穿白衬衫、系着深色围裙、处于虚焦状态的调酒师。画面包含吧台旁的深色高脚凳，整体色调为浓郁的琥珀色、奶油色和棕色。采用浅景深，柔和的室内自然光与温暖的酒吧灯光交织，呈现真实的皮肤和织物纹理，带有细腻的电影质感，高细节的豪华酒店摄影风格，以智能手机或人像镜头平视拍摄，竖构图，营造出巴黎咖啡馆与酒店酒吧相融合的舒适氛围。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883151904_317pnq_HGcB-93WcAALrV4.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-384",
    title: "可爱早安问候人偶贴纸",
    category: "摄影写实",
    industry: "通用",
    description: "一款可爱的贴纸风格 3D 人偶插画，背景为干净的浅灰色，设计呈现出光泽感收藏级玩具的渲染效果。画面展示 1 位 Q 版女性和 1 只大猫并排站立。女性角色为超变",
    prompt: `一款可爱的贴纸风格 3D 人偶插画，背景为干净的浅灰色，设计呈现出光泽感收藏级玩具的渲染效果。画面展示 1 位 Q 版女性和 1 只大猫并排站立。女性角色为超变形乙烯基玩具风格，拥有大头比例，深棕色至黑色的齐肩发，侧分且带有平滑光泽，身穿简约的亮红色长袖上衣、深炭灰色紧身裤或修身长裤，以及白色鞋子。她站在左侧，面向前方，左手抬起做出友好的挥手姿势，散发着愉快的早安问候氛围。她的面部应呈现出玩具人偶风格的简约、可爱与年轻感。在她的右侧，放置 1 只圆润的银色虎斑猫，胸部、腹部、腿部和口鼻处为白色毛发，头部、背部和尾部带有灰色条纹，拥有绿色眼睛、粉色耳内侧，呈现出放松的趴卧姿势，爪子向内收拢，身体略微朝向镜头。在顶部添加两行深棕色圆润笔触的日文手写文字：第一行写着“おはよう”，第二行写着“ございます!”。在右上角添加 1 个简单的橙色太阳涂鸦，带有 8 条短光芒。整体构图应呈现出适合社交媒体的个性化早安问候贴纸感，采用柔和的摄影棚灯光，人偶下方带有细腻的阴影，表面质感精致，比例可爱，细节丰富，营造出温暖俏皮的氛围。`,
    tags: ["摄影写实"],
    image: "https://cms-assets.youmind.com/media/1776883114636_te31se_HGdus5JasAAPKP7.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-385",
    title: "四位女性时尚身高对比",
    category: "摄影写实",
    industry: "通用",
    description: "一张简洁的时尚对比摄影棚照片，展示 4 位成年东亚女性并排站在浅灰色无缝背景前，全身可见，从头部到鞋子，采用正面拍摄，光线柔和均匀，呈现出精致的商业质感。在每位",
    prompt: `一张简洁的时尚对比摄影棚照片，展示 4 位成年东亚女性并排站在浅灰色无缝背景前，全身可见，从头部到鞋子，采用正面拍摄，光线柔和均匀，呈现出精致的商业质感。在每位女性头顶正上方，用黑色衬线字体标注身高，文字需完全一致：145cm、155cm、165cm、175cm。强调身高比例的真实差异，同时保持四位女性身材苗条、优雅且风格统一，留着深棕色至黑色的柔和波浪长发，表情中性。她们的面部被平滑的矩形模糊块遮盖。四位女性站位紧凑，姿态友好，有细微的肢体接触，其中一人轻挽着另一人的手臂。服装采用米色、奶油色、灰褐色和柔粉色的协调色调，搭配干练的女性化休闲装和配套的象牙白乐福鞋。145cm 标签下的女性 1 身穿短袖奶油色罗纹针织上衣，塞进高腰浅米色短裤中，配有织物腰带，并背着一个小巧的链条绗缝单肩包。155cm 标签下的女性 2 身穿白色长袖衬衫，领口系蝴蝶结，搭配灰褐色迷你裙，裙摆微张，背着一个小巧的浅米色斜挎包。165cm 标签下的女性 3 身穿无袖粉米色罗纹针织上衣，搭配简约的象牙白迷你裙。175cm 标签下的女性 4 身穿垂坠感白色 V 领衬衫，袖子卷至前臂，搭配高腰灰褐色腰带短裤，背着一个中号灰褐色单肩包。4 位女性均穿着奶油色或象牙白马衔扣乐福鞋。构图垂直、居中、极简、时尚、写实，如同对比女性身高的时尚目录图片。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936870013_u1lmj2_HGeuKikbwAEPasm.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-386",
    title: "复古报纸头版生成器",
    category: "摄影写实",
    industry: "通用",
    description: "创建一个以主角为核心的最逼真的复古报纸头版设计。布局应采用真实印刷报纸的风格，并具有电影般的黑白美学。主照片应醒目地放置在中心位置并带有边框，类似于文章标题中的",
    prompt: `创建一个以主角为核心的最逼真的复古报纸头版设计。布局应采用真实印刷报纸的风格，并具有电影般的黑白美学。主照片应醒目地放置在中心位置并带有边框，类似于文章标题中的图片。照片中的主体应保持不变，在自然光下清晰可辨，并略微增加对比度，以符合引人注目的编辑风格。在顶部创建一个醒目且引人注目的标题（创建一个符合照片意境的独特标题——可以是浪漫、神秘、幽默或戏剧性的）。在标题下方添加一个较小的副标题，使其看起来像真实的报纸说明文字。添加逼真的报纸元素：小字栏（采用乱数假文风格，但排版如真实新闻）；顶部是虚构的出版物名称（例如 “The Daily Prompts”、“AI Times” 或类似名称——根据图片发挥创意）；日期、期号和地点；装饰线、分隔符和复古排版；针对主图的小型附加文章或说明文字；可选的印章、涂鸦或编辑注释以增加个性。风格：黑白或略微褪色的单色纸张；精细的纸张纹理、颗粒感和油墨瑕疵；模仿真实印刷纸张的细微阴影和折痕；干净但略显磨损的复古报纸美学。氛围：赋予设计个性、表现力和情节感，仿佛该情节是主文章的一部分。宽高比：4:5 或 1:1；编辑摄影与印刷设计的高细节、超逼真混合体。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022491760_5dqm51_HGkkow7aMAAybz_.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-387",
    title: "夏季男装 Lookbook 网格图",
    category: "摄影写实",
    industry: "通用",
    description: "以提供的参考图像作为人物和身体基础，将其转化为简洁的男士夏季时尚 Lookbook，背景为纯净的暖米色摄影棚背景。保持主体可辨识，每套造型中的面部均进行模糊处理",
    prompt: `以提供的参考图像作为人物和身体基础，将其转化为简洁的男士夏季时尚 Lookbook，背景为纯净的暖米色摄影棚背景。保持主体可辨识，每套造型中的面部均进行模糊处理，并生成 8 套全身穿搭变体，以 4x2 的编辑级网格形式排列。添加带有箭头的“手写风格”造型师笔记，标注每套穿搭的关键服饰单品。

第一行造型 1：米色针织 Polo 衫、海军蓝定制短裤、白色皮革运动鞋。
第一行造型 2：鼠尾草绿亚麻衬衫、白色亚麻短裤、棕色皮革凉鞋，衬衫上挂着太阳镜。
第一行造型 3：米白色罗纹背心、棕色百褶长裤、白色帆布运动鞋，单肩背着米色帆布托特包。
第一行造型 4：浅色古巴领印花衬衫、浅蓝色牛仔短裤、棕褐色麂皮乐福鞋。
第二行造型 5：带有绿色“WELLNESS CLUB”字样的白色印花 T 恤、深绿色运动短裤、白色跑步鞋、白色中筒袜、浅色棒球帽、帆布托特包。
第二行造型 6：海军蓝短袖外搭衬衫（敞开穿着，内搭白色背心）、米色休闲斜纹棉布裤、深棕色船鞋。
第二行造型 7：米色纹理针织短袖衬衫、浅水洗牛仔裤、棕褐色 Wallabees 鞋、浅色棒球帽。
第二行造型 8：黑色修身 T 恤、白色亚麻抽绳长裤、黑色拖鞋、黑色斜挎包。

使其呈现出精致的时尚造型指南效果，具备逼真的比例、柔和均匀的灯光、极简的阴影，并在每个人物旁添加优雅的手写注释。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022610725_ailywn_HGnOYjZWEAAsQ1M.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-388",
    title: "夜间漂移未来感运动轿车",
    category: "摄影写实",
    industry: "通用",
    description: "一张电影级的夜间汽车动作照片，主角是一辆灵感源自 Audi e-tron GT 的未来感白色电动运动轿车，采用快速侧向跟拍视角，展现其在湿滑的城市街道上激烈漂移",
    prompt: `一张电影级的夜间汽车动作照片，主角是一辆灵感源自 Audi e-tron GT 的未来感白色电动运动轿车，采用快速侧向跟拍视角，展现其在湿滑的城市街道上激烈漂移的瞬间。车辆呈现清晰的左侧轮廓，车头朝向右侧，姿态低趴且极具侵略性，配备黑色车顶、深色车窗、黑色轮毂，以及一条发着红光的连续细长 LED 尾灯带。后部车身经过深度改装并部分拆除，露出了后轮区域后方的金属涡轮状管道和机械组件。浓厚的白色轮胎烟雾从车尾喷涌而出，充盈了画面的整个左侧。路面因雨水而光亮，反射着蓝色、白色和琥珀色的城市灯光。背景极其深邃，远处建筑和路灯呈现出柔和的虚化效果，辅以模糊的垂直立柱和护栏，通过强烈的动态模糊强调速度感。采用黑色、钢蓝色、冷白色和暖橙色高光组成的忧郁城市色调，写实摄影风格，高细节，低角度跟拍视角，长焦平移拍摄，戏剧性的反射效果，浅景深，充满强烈的赛车运动能量。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022600968_vl0zdo_HGlNI4GWYAAkWj3.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-389",
    title: "将火车抓拍照片转换为影棚肖像",
    category: "摄影写实",
    industry: "通用",
    description: "使用提供的参考图像，将这张随意的火车抓拍照片转换为同一人物干净、专业的影棚半身肖像。移除耳机、窗户反光、桌子、保温杯、书本以及所有火车内部或背景元素。将构图从随",
    prompt: `使用提供的参考图像，将这张随意的火车抓拍照片转换为同一人物干净、专业的影棚半身肖像。移除耳机、窗户反光、桌子、保温杯、书本以及所有火车内部或背景元素。将构图从随意的偏心坐姿调整为居中、正面的裁剪，使主体直视镜头，背景为简洁的柔和蓝灰色影棚背景。保留相同的发型、衬衫加毛衣的穿搭以及整体逼真的摄影质感，但使用柔和均匀的影棚灯光进行重新布光，并进行精致的肖像修图。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022533625_mh11ec_HGiTz_eXsAAoyvL.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-390",
    title: "工业风巷道男性抓拍照片",
    category: "摄影写实",
    industry: "通用",
    description: "一张逼真的全身街拍照片，拍摄对象为一名成年东亚男性，他站在工业巷道湿漉漉的沥青地面上，身旁是一座类似仓库的建筑。他面向镜头，双腿分开，姿态宽阔且充满活力。他身穿",
    prompt: `一张逼真的全身街拍照片，拍摄对象为一名成年东亚男性，他站在工业巷道湿漉漉的沥青地面上，身旁是一座类似仓库的建筑。他面向镜头，双腿分开，姿态宽阔且充满活力。他身穿浅米色休闲西装外套、深炭灰色 T 恤、米色斜纹棉布裤，脚蹬黑白底一脚蹬运动鞋。他留着黑色短直发。右手垂直握着一部黑色智能手机，左臂弯曲，拳头紧握举起，仿佛正在兴奋地做出反应、准备移动或摆出一个俏皮的动作。场景包括画面左侧一辆部分可见且略微失焦的停放叉车，以及右侧一堵带有窗户的波纹外墙。自然阴天光线，纪录片风格摄影，浅景深，柔和的低饱和度色彩，真实的城市抓拍感，平视构图，全身取景，高度还原织物和路面纹理。在面部应用强力的矩形模糊遮罩，遮挡所有面部特征。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936889488_nld038_HGhu08HakAA9LFU.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-391",
    title: "带有审查遮挡块的超现实漂浮头部",
    category: "摄影写实",
    industry: "通用",
    description: "一张超现实风格的摄影棚人像，画面主体为一个正视前方的漂浮人头，居中置于色彩浓郁的蓝天背景下，天空中点缀着柔软蓬松的白云。面部完全被一个巨大的光滑矩形审查遮挡块覆",
    prompt: `一张超现实风格的摄影棚人像，画面主体为一个正视前方的漂浮人头，居中置于色彩浓郁的蓝天背景下，天空中点缀着柔软蓬松的白云。面部完全被一个巨大的光滑矩形审查遮挡块覆盖，遮挡范围从额头延伸至下巴及大部分脸颊，遮挡块呈现出从暖棕色到柔和蓝灰色的细微渐变。仅保留外部特征可见：修剪整齐的寸头，顶部呈现出紧密的深色斑点发质，可见双耳，以及圆润的下巴和下颌线。头部佩戴着仅包裹侧面的彩色眼镜腿，由于中心被遮挡，前方没有可见的镜片；左侧镜腿为浅奶油色，带有微小的红金装饰标记，右侧镜腿为鲜艳的红橙色。在遮挡块顶部边缘附近添加了两个露出的小圆突起，左侧为黄色，右侧为灰白色，营造出一种奇特且类似玩具的质感。渲染效果为超写实但略带诡异的 3D 插图，皮肤光滑，柔和日光，构图极简，浅景深，呈现出干净且充满奇思妙想的波普超现实美学。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936889156_vucy9y_HGg3YMYWAAAXQTB.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-392",
    title: "带有斑点伪影的雨林空地",
    category: "摄影写实",
    industry: "通用",
    description: "一张超细节的广角雨林空地照片，采用极低的地面视角拍摄，相机几乎贴近浅泥坑的边缘。茂密的热带丛林植被在空地周围形成了一圈环形墙，交织的藤蔓、宽大的湿叶、灌木和树干",
    prompt: `一张超细节的广角雨林空地照片，采用极低的地面视角拍摄，相机几乎贴近浅泥坑的边缘。茂密的热带丛林植被在空地周围形成了一圈环形墙，交织的藤蔓、宽大的湿叶、灌木和树干上覆盖着厚厚的绿植。前景是湿滑的棕色泥水、落叶和反光水坑，包括一根斜穿右下区域的倒木和左下角一块圆润的苔藓岩石。中心处是一片低矮的绿色植物，背景则是高耸的茂密丛林树冠。明亮的正午阳光从右上方的树梢间穿透而下，形成强烈的射线、薄雾、发光高光，并与透过树冠可见的局部多云蓝白天空形成高对比度。使用具有微妙桶形畸变的戏剧性鱼眼或超广角镜头效果，营造沉浸式的环境尺度、浓郁饱和的绿色、湿润的质感、逼真的自然光影、清晰的叶片细节以及写实的纪录片式自然摄影风格。在图像中加入微弱且不自然的网格状斑点噪点伪影图案，在阴暗的叶片和泥泞地面上尤为明显，模拟图像生成过程中的质量缺陷。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936907259_gexzl6_HGgZ6mXWAAA_QHg.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-393",
    title: "带遮挡的摄影棚肖像",
    category: "摄影写实",
    industry: "通用",
    description: "一张居中的摄影棚肖像照，拍摄对象为一名成年男性，取景范围从胸部上方至头顶，正对镜头，背景为平滑的深海军蓝色。他留着极短的寸头，双耳清晰可见，肤色为中等棕褐色，下",
    prompt: `一张居中的摄影棚肖像照，拍摄对象为一名成年男性，取景范围从胸部上方至头顶，正对镜头，背景为平滑的深海军蓝色。他留着极短的寸头，双耳清晰可见，肤色为中等棕褐色，下巴和下颌线处有短促的深色胡茬，并带有淡淡的八字胡。让他穿着一件纯色米白色或奶油色圆领卫衣，无任何标志。采用柔和的专业摄影棚灯光，在头皮、耳朵、颈部和卫衣上形成柔和的高光，呈现逼真的皮肤纹理、浅景深以及干净的摄影质感。采用对称构图，头部靠近画面顶部，宽阔的肩膀填充下半部分，呈垂直肖像方向。在面部中心覆盖一个巨大的不透明矩形遮挡块，覆盖范围从前额到鼻部下方，横跨大部分面部宽度；将遮挡块设为平坦的柔和棕色调，边缘略微柔化，使面部特征完全被隐藏。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936888517_f9x0ef_HGg3Q1cXcAAu_io.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-394",
    title: "日本班级毕业照拍立得",
    category: "摄影写实",
    industry: "通用",
    description: "一张平放在浅色木质桌面上的写实拍立得照片，采用正上方俯拍视角。相片带有厚实的白色边框，底部边框较宽且有轻微的自然磨损痕迹，照片区域显示的是一张日本高中室内班级合",
    prompt: `一张平放在浅色木质桌面上的写实拍立得照片，采用正上方俯拍视角。相片带有厚实的白色边框，底部边框较宽且有轻微的自然磨损痕迹，照片区域显示的是一张日本高中室内班级合影。照片中，约 35 名毕业生身着深色校服，在绿色黑板前分 4 排随意站立，姿态自然且紧凑。大多数学生是身穿黑色学兰服或深色西装外套搭配白衬衫领带的男生，几名女生穿着深色西装外套搭配蓝色格纹裙。前排左侧的一名女生穿着白色开衫和蓝色格纹裙，格外显眼。许多学生比着剪刀手，有的蹲在前排，还有几人坐在或倚靠在木质地板上。面部经过柔和的方块马赛克模糊处理，但整体氛围真实、怀旧且充满庆祝感。黑板上用粉笔手绘着日文毕业寄语，中央写有醒目的“3年B組”字样，周围环绕着毕业主题的涂鸦和祝福语。教室墙壁为白色，黑板上方挂着圆形挂钟，天花板上有日光灯管，室内光线柔和。图像应呈现出 21 世纪初或 2010 年代略显昏暗的快照质感，带有轻微噪点、柔焦效果、真实的闪光灯摄影痕迹以及自然的色彩褪色，强调作为实体拍立得照片所承载的感伤毕业回忆。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883121219_stnfvd_HGb_8hHa0AAYabt.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-395",
    title: "日落时分令人难忘的雕像女子",
    category: "摄影写实",
    industry: "通用",
    description: "一张电影级黑暗奇幻摄影作品，描绘了日落时分废墟花园中一位背对镜头的风化大理石质感女性，构图为中背部以上。她的脸部微微转向肩后，但大部分隐藏在阴影中。她呈现出古希",
    prompt: `一张电影级黑暗奇幻摄影作品，描绘了日落时分废墟花园中一位背对镜头的风化大理石质感女性，构图为中背部以上。她的脸部微微转向肩后，但大部分隐藏在阴影中。她呈现出古希腊罗马风格，拥有苍白的石质皮肤、盘起的古典发髻，以及一件做旧象牙色单肩长袍，长袍看起来布满裂纹、灰尘，并像受侵蚀的雕塑一样部分与身体融合。她裸露的背部和手臂上有着精致的植物纹身状标记，肩胛骨区域嵌入了褪色的蓝色花卉马赛克。整体氛围忧郁、令人难忘且优雅。背景左侧放置两根深影中的高大石柱，两侧是茂密的深色树木和植被，花园下方点缀着成簇的小型淡色花朵。使用发光的琥珀橙色落日余晖作为强烈的背光，勾勒出她肩部和头发的柔和轮廓光，前景阴影深邃，浅景深，对比度丰富，大地色调柔和，并呈现出裂纹石膏、陈旧织物和石材的超精细纹理。艺术编辑摄影风格，超写实，神秘，忧郁，85mm 镜头质感。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883093309_cyjx8h_HGdBfEibkAAfqHI.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-396",
    title: "极简 AI 时尚对比项目",
    category: "摄影写实",
    industry: "通用",
    description: "一个以浅鼠尾草绿为背景的极简时尚项目，采用宽幅水平对比排版，包含四个身穿超大款白色运动 T 恤的年轻男性模特肖像面板。采用柔和的编辑式摄影棚风格，肖像框内为冷长",
    prompt: `一个以浅鼠尾草绿为背景的极简时尚项目，采用宽幅水平对比排版，包含四个身穿超大款白色运动 T 恤的年轻男性模特肖像面板。采用柔和的编辑式摄影棚风格，肖像框内为冷长春花蓝背景，带有细腻的胶片颗粒感、柔和的对比度，以及鼠尾草绿、青色饰边、灰白色、深阴影和蓝薰衣草色组成的极具一致性的调色板。最左侧包含 1 张被画布边缘部分裁切的大幅参考肖像，展示了一位深肤色男性模特剃光或修剪极短的头部、耳朵、下颌线、颈部和肩部的侧影，身穿带有亮水蓝色罗纹领口的白色衬衫；在脸部区域放置 2 个半透明的重叠矩形块，营造出图形化的审查/拼贴效果。右侧并排放置 3 张圆角肖像卡片，间距均匀，每张卡片展示了不同的年轻男性模特，胸部以上出镜，背景均为相同的蓝色摄影棚背景：卡片 1 展示了一位浅至中等肤色的男性，留着短背头，微向左侧，身穿带有水蓝色领口饰边和右下胸部带有小 Nike Swoosh 标志的白色运动衫；卡片 2 展示了一位浅肤色男性，留着中长深色背头，向左侧转四分之三角度，身穿胸前带有黑色 Swoosh 标志的白色 Nike 衬衫；卡片 3 展示了一位深肤色男性，留着短渐变发型，向右侧转四分之三角度，身穿胸前带有青色 Adidas 标志的白色 Adidas 衬衫，佩戴小圆环或十字耳环。在每张较小的肖像脸部上方各添加 1 个遮挡脸部的渐变矩形，颜色由深绿色渐变为灰绿色，垂直对齐，如同图形叠加层。在整个构图中添加 2 条细水平分割线，一条靠近顶部，一条靠近下三分之一处，颜色为略浅的鼠尾草色。在底部添加小型大写等宽编辑文本：在左下方附近书写“MJ REFERENCE”，在右下方附近书写“KREA // GPT 2”。整体图像应呈现出高端 AI 时尚对比项目、平面设计演示或概念一致性表的感觉，具备整洁的间距、平整的背景和精致的艺术指导。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936798079_1zjm43_HGebCVZWkAAzRKO.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-397",
    title: "森林伏击中的精灵狙击小队",
    category: "摄影写实",
    industry: "通用",
    description: "一个电影级超写实的奇幻军事场景，位于茂密的林地森林地面视角，展示了 2 名伪装的精灵狙击手在侦察目标时的情景。前景中，一名留着浅金色长发、耳朵尖尖的精灵正俯卧在",
    prompt: `一个电影级超写实的奇幻军事场景，位于茂密的林地森林地面视角，展示了 2 名伪装的精灵狙击手在侦察目标时的情景。前景中，一名留着浅金色长发、耳朵尖尖的精灵正俯卧在现代精密狙击步枪后，通过瞄准镜进行瞄准。步枪修长且具有战术感，配备了大型消音器、瞄准镜，以及支撑在长满苔藓的林地地面上的两脚架。该精灵身穿全套现代林地迷彩服、战术手套，并戴着覆盖叶片的吉利服头套和肩罩，与灌木丛融为一体。在后方稍靠右侧，第二名精灵低姿蹲伏，同样有着尖耳朵和浅色长发，穿着配套的迷彩服和多叶吉利斗篷，正举着望远镜观察。为后方的侦察兵添加战术胸挂和弹药包。场景设定在阴影笼罩的温带森林中，周围有高而细的树木、纠缠的树枝、苔藓、树根和散落的叶子，由从右侧穿过树木的柔和清晨自然光照亮。采用柔和的绿色、棕色和灰色调，具有逼真的纹理、浅景深，重点突出步枪和两名伪装的精灵，呈现沉浸式战争摄影构图、紧张的潜行氛围以及高细节的照片级真实感。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936896528_nqibxn_HGghdaZacAAPfN7.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-398",
    title: "沿海钢筋混凝土盐害",
    category: "摄影写实",
    industry: "通用",
    description: "一张超写实的纪录片风格特写照片，展示了沿海钢筋混凝土结构上严重的氯化物腐蚀损坏，视角从悬臂梁或桥墩拐角处略微仰视。图像显示外角处有一大块剥落区域，混凝土保护层已",
    prompt: `一张超写实的纪录片风格特写照片，展示了沿海钢筋混凝土结构上严重的氯化物腐蚀损坏，视角从悬臂梁或桥墩拐角处略微仰视。图像显示外角处有一大块剥落区域，混凝土保护层已脱落，精确露出内部嵌入的 5 根锈蚀水平钢筋。周围的混凝土粗糙、开裂且有缺口，边缘不规则，可见骨料。棕橙色的锈迹从裸露的钢筋处向下延伸，并沿着梁的底部蔓延，显示出长期的盐害影响。混凝土表面呈浅灰色，风化且呈哑光质感，带有细微的孔隙和施工瑕疵。背景处是平静的蓝色大海和淡蓝色的天空，地平线附近有模糊的远岸，柔和的虚化效果进一步强化了海洋环境。明亮的自然光，天气晴朗，真实的智能手机摄影构图，无人物、无工具、无安全护栏、无文字、无标签、非插画风格，仅呈现一张可信的沿海盐害钢筋混凝土工程检查照片。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936857644_8yf9lz_HGgkeXAaAAA7u9p.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-399",
    title: "活力十足的食品广告",
    category: "摄影写实",
    industry: "通用",
    description: "一个大胆且充满活力的广告场景，融合了真实摄影与趣味元素。一位身穿红色法兰绒衬衫和黑色长裤的男士 [上传图片] 身体微微前倾，一手端着碗，另一只手用筷子挑起劲道的",
    prompt: `一个大胆且充满活力的广告场景，融合了真实摄影与趣味元素。一位身穿红色法兰绒衬衫和黑色长裤的男士 [上传图片] 身体微微前倾，一手端着碗，另一只手用筷子挑起劲道的方便面，热气腾腾，画面极具张力。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022495730_lg8o2n_HGk6Vk5bEAA_DUm.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-400",
    title: "涂鸦风格温馨餐厅餐桌照片",
    category: "摄影写实",
    industry: "通用",
    description: "一张氛围感十足的深色餐厅餐桌照片，采用时尚的手绘涂鸦编辑风格，从略微俯视的四分之三角度拍摄。画面展示了一张木桌，上面摆放着 4 种主要的餐饮单品：左中位置是一个",
    prompt: `一张氛围感十足的深色餐厅餐桌照片，采用时尚的手绘涂鸦编辑风格，从略微俯视的四分之三角度拍摄。画面展示了一张木桌，上面摆放着 4 种主要的餐饮单品：左中位置是一个带有黑色边缘文字“OLIO E PIU”的大号白色意面碗，盛着奶油意面或松露意面，顶部放着一颗光亮的生蛋黄，碗内放着一把勺子，并冒着柔和的热气；右下角是一个被画面裁切的大号白色餐盘，盛放着烤蔬菜和一块带有浅绿色调料粉的褐色肉类；左下角是一只被部分裁切的白葡萄酒高脚杯；右上角是一只深色气泡饮料的高脚杯。背景非常昏暗且温暖，近乎黑色，使食物和玻璃器皿在低环境光下格外突出。在照片上方添加白色手绘涂鸦和日语手写注释：左上角有一行大的弧形标题，写着“おいしい時間、しあわせだな〜♡”，下方带有扫尾的下划线和 2 颗小爱心；意面上方有一条注释写着“しっとり、たまごとろり”，并有一条虚线箭头指向蛋黄；右上角饮料附近有一条注释写着“さっぱり、リフレッシュ！”，并有一条虚线箭头指向杯子；左下角葡萄酒杯附近有一条注释写着“sparkling. ちょっとした ごほうび。♡”，并有一条弯曲的虚线箭头；右下中心附近有一条注释写着“あまくて、やわらかい :) ♡”，并有一条虚线箭头指向盘中的食物。除了文字外，还需包含 10 个涂鸦装饰：意面上方 2 个热气波浪线，葡萄酒杯附近 2 颗小闪烁星，下层餐盘附近 2 个小闪烁标记，右上角饮料旁边 2 个微小水滴标记，以及标题附近 2 颗爱心。使用纤细的白色粉笔线条，呈现随意且不完美的笔触，营造出温馨的编辑类社交媒体美学，在保持构图真实摄影感的同时，让涂鸦看起来俏皮且具有手绘感。`,
    tags: ["摄影写实"],
    image: "https://cms-assets.youmind.com/media/1777022576231_usy8rx_HGlHD4wasAAyz55.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-401",
    title: "猫咪变身人类肖像",
    category: "摄影写实",
    industry: "通用",
    description: "使用提供的参考图像，将猫咪转换为写实的人类肖像，同时保持相同的慵懒姿势、摄像机角度、构图以及相同的毛绒绿松石色椅子背景。以猫咪的橙白相间花纹为灵感，将其转化为人",
    prompt: `使用提供的参考图像，将猫咪转换为写实的人类肖像，同时保持相同的慵懒姿势、摄像机角度、构图以及相同的毛绒绿松石色椅子背景。以猫咪的橙白相间花纹为灵感，将其转化为人类外观：将人物设定为一位皮肤白皙的年轻女性，拥有温暖的姜黄色头发和柔和、平静的表情。让她穿着舒适的米白色居家服：1 件宽松的针织 V 领毛衣和 1 条奶油色抽绳长裤，身体自然地坐在椅子上，姿态放松。要求照片级写实，采用柔和的室内自然光，呈现杂志生活方式摄影的质感。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883192227_47aujy_HGddzviXQAAIE28.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-402",
    title: "猴子巡逻队驾驶纸板警车",
    category: "摄影写实",
    industry: "通用",
    description: "一张在繁忙的中国市场街区拍摄的写实风格幽默街头照片，展现了一辆微型手工警车像在巡逻一样行驶在路上。这辆车看起来像是一个由瓦楞纸板和胶带制成的粗糙等比例玩具或游行",
    prompt: `一张在繁忙的中国市场街区拍摄的写实风格幽默街头照片，展现了一辆微型手工警车像在巡逻一样行驶在路上。这辆车看起来像是一个由瓦楞纸板和胶带制成的粗糙等比例玩具或游行道具，外形方正且略显歪斜，车身漆成白色并带有深蓝色警用涂装，车顶配有红蓝警灯，引擎盖和侧门上印有中文“警察”字样，引擎盖上印有英文“POLICE”，前门贴有警徽标志，前车牌写着“京 A8888”。车内及窗外总共探出 4 只猕猴：1 只猴子坐在驾驶座上，戴着白色警帽，一只手扶着方向盘；1 只猴子坐在副驾驶座上，探出窗外并向前指引；另有 2 只猴子从左侧后窗探出，每只都伸出一只手臂指向外侧。猴子们表情机警，毛发呈棕褐色，使整个场景看起来像是一支猴子巡逻队。周围环境是真实的城市街道，背景中有滑板车、行人、市场摊位、绿色遮阳棚和密集的红色中文店招，均略微失焦。从街道水平面的左前方四分之三角度拍摄，纸板车位于画面中心并向观众驶来。明亮的自然正午光线，纪实摄影风格，浅景深，纹理逼真，充满喜剧荒诞感，细节丰富。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022536936_h915zk_HGqAh2pWoAANvU5.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-403",
    title: "电影感影棚肖像",
    category: "摄影写实",
    industry: "通用",
    description: "{ \"prompt\": \"一位年轻女性的影棚肖像，留着长波浪红发，皮肤白皙且带有雀斑，身穿黑色亮片抹胸迷你裙和黑色过膝长靴。她坐在地板上，姿态放松而自信，正视前",
    prompt: `{
  "prompt": "一位年轻女性的影棚肖像，留着长波浪红发，皮肤白皙且带有雀斑，身穿黑色亮片抹胸迷你裙和黑色过膝长靴。她坐在地板上，姿态放松而自信，正视前方，表情柔和自然。颈间松散地系着一条黑色丝带颈圈。场景采用温暖的金色影棚灯光，在她身后营造出圆形聚光灯效果，投射出柔和的阴影并增加了深度。极简主义背景，编辑类时尚摄影风格，高细节，电影感暖色调，平滑的渐变。",
  "negative_prompt": "低分辨率，模糊，解剖结构错误，多余肢体，手部变形，面部扭曲，生硬阴影，过度曝光，曝光不足，水印，文字，Logo，JPEG 伪影，卡通，CGI，3D 渲染",
  "style": "编辑类时尚摄影，照片级真实感",
  "camera": {
    "angle": "平视",
    "framing": "四分之三身肖像",
    "lens": "85mm",
    "aperture": "f/2.0"
  },
  "lighting": {
    "type": "影棚灯光",
    "setup": "带有柔和衰减的暖色聚光灯",
    "mood": "电影感且亲密"
  },
  "setting": {
    "location": "影棚",
    "background": "带有圆形光晕的暖色渐变背景"
  },
  "color_palette": [
    "黑色",
    "暖金色",
    "琥珀色",
    "柔和米色"
  ],
  "size": "768x1152"
}`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936737687_n1ourt_HGhqpxWa4AAu7C8.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-405",
    title: "电影风格教学图示",
    category: "摄影写实",
    industry: "通用",
    description: "请为我生成一张 35 mm 电影风格的图示，展示关于相机风格、预设以及作为一名想要追求热情的 iPhone 摄影新手所需要了解的知识。每种相机和预设风格都应以其",
    prompt: `请为我生成一张 35 mm 电影风格的图示，展示关于相机风格、预设以及作为一名想要追求热情的 iPhone 摄影新手所需要了解的知识。每种相机和预设风格都应以其真实的视觉风格呈现，而不是统一使用这种 35 mm 风格。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936731765_ve70y8_HGeXSJAXQAAbJg8.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-406",
    title: "白色家电上熟睡的三花猫",
    category: "摄影写实",
    industry: "通用",
    description: "一张温馨的室内生活方式照片，展示了一只毛茸茸的长毛三花猫，它闭着眼睛，下巴轻轻靠在一个圆柱形的光滑白色家电上，从桌子高度正面拍摄。这只猫有着厚实的三色毛发（橙色",
    prompt: `一张温馨的室内生活方式照片，展示了一只毛茸茸的长毛三花猫，它闭着眼睛，下巴轻轻靠在一个圆柱形的光滑白色家电上，从桌子高度正面拍摄。这只猫有着厚实的三色毛发（橙色、黑色和白色）、白色的口鼻部、粉色的鼻子、大而尖的耳朵，外表看起来非常柔软蓬松。它的身体环绕在设备后方，趴在一张长长的哑光黑色桌面（带有天然浅色木质边缘）上，构图居中，设备位于前景，猫咪占据了画面的上半部分。该设备正面有一个圆形开口，带有金属内环，底部附近有一个小椭圆形控制窗。场景设定在温暖、阳光充足的现代家居室内，主体后方有一扇窗户，柔和的日光洒入，背景是浅色墙壁、温暖的木地板，右上角的窗台上摆放着一盆小植物。浅景深，柔和的暖色调，逼真的毛发细节，设备上的自然反光，宁静的睡意氛围，高分辨率的抓拍宠物摄影。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936883924_cxre1b_HGhl3ZsawAA70EX.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-407",
    title: "绿幕前的电影感合影",
    category: "摄影写实",
    industry: "通用",
    description: "一张电影感十足的抓拍照片，4 位年轻人站在平滑的摄影棚绿幕墙前，构图如同幕后色度键测试。在画面最左侧前景，一位留着鲜艳铜红色头发的女性非常靠近镜头且处于重度虚焦",
    prompt: `一张电影感十足的抓拍照片，4 位年轻人站在平滑的摄影棚绿幕墙前，构图如同幕后色度键测试。在画面最左侧前景，一位留着鲜艳铜红色头发的女性非常靠近镜头且处于重度虚焦状态，仅露出头部后侧和部分肩膀，营造出强烈的景深和过肩构图感。背景中偏左侧，一位留着深色短卷发并佩戴眼镜的男性部分可见，画面经过裁剪，仅露出部分脸部和躯干，他胸前拿着 1 个蓝色水瓶。画面中心，一位中等肤色、留着深色齐肩卷发的女性面朝镜头，表情自然，身穿酒红色褶皱细肩带连衣裙，佩戴精致的金项链，双手在腰间拿着 1 个带有蓝色图案的水瓶。右侧，另一位留着深棕色长直发的女性面朝镜头，身穿横条纹（米色、棕色和暗红色）修身短袖针织衫。灯光呈现出电影般的氛围感，带有青绿色和温暖的红调，柔和的阴影，浅景深，真实的皮肤质感，细腻的胶片颗粒，以及随性的纪录片风格。中景镜头，平视构图，室内摄影棚环境，除 2 个可见的水瓶外无其他道具，纯色绿幕背景填满画面，姿态自然，写实摄影，变形镜头风格调色。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883169964_0tmsfv_HGdrpQwWoAA3N0b.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-408",
    title: "绿林中模糊的鹿",
    category: "摄影写实",
    industry: "通用",
    description: "一张具有强烈主观动态模糊效果的写意野生动物摄影作品，展示了茂密绿色森林空地中的 1 只鹿类动物。动物呈侧面站立，位于中心偏左位置，面向左侧，身体呈浅棕色至奶油色",
    prompt: `一张具有强烈主观动态模糊效果的写意野生动物摄影作品，展示了茂密绿色森林空地中的 1 只鹿类动物。动物呈侧面站立，位于中心偏左位置，面向左侧，身体呈浅棕色至奶油色，四肢纤细，头部和耳朵轮廓柔和模糊，从茂密枝叶的阴影空隙中隐约显现。整张图像呈现出强烈的对角线和垂直方向的相机动态模糊，营造出一种印象派的梦幻效果，而非锐利的细节。主体周围环绕着饱和的夏季绿植：背景是深翠绿色的灌木丛，左上方是深邃的森林阴影，前景则是明亮鲜艳的草地。采用自然户外日光，色调以浓郁的绿色为主，对比度柔和，呈现出一种抽象的摄影风格，仿佛在移动中捕捉到野生动物转瞬即逝的身影。画面中不包含人物、文字、建筑物或其他动物。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936919726_vwcs8n_HGfIUtFWUAAYA9V.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-409",
    title: "花卉小鸡三人组肖像",
    category: "摄影写实",
    industry: "通用",
    description: "一张充满奇趣的摄影棚肖像，展示了 3 只完全由层叠花瓣和花朵构成的风格化小鸡，它们并排站在浅灰色纯色背景前，光线柔和均匀，地面带有淡淡的阴影。左侧的小鸡呈奶油色",
    prompt: `一张充满奇趣的摄影棚肖像，展示了 3 只完全由层叠花瓣和花朵构成的风格化小鸡，它们并排站在浅灰色纯色背景前，光线柔和均匀，地面带有淡淡的阴影。左侧的小鸡呈奶油色和象牙色，由浅色花瓣和白色小野花构成，表情惊讶，有着非常大的圆形滑稽眼睛、小巧的浅色鸡冠、下垂的粉色肉垂和细长的黄色鸡腿。中间的小鸡圆润蓬松，由深浅不一的浓密粉色花瓣和花朵构成，表情严肃且略带不满，眯着眼睛，喙部较大且呈浅色，有着超大的粉色肉垂，以及垂在前额的类似粉色花朵的鸡冠。右侧的小鸡呈亮橙色和金色，由鲜艳的橙色花瓣和类似万寿菊的花朵构成，点缀着几片绿叶和黄色嫩枝，表情困倦且不屑，半眯着眼睛，有着高耸的红橙色鸡冠、红色肉垂和黄色鸡腿。让这 3 只小鸡都具备高度细节，可爱、古怪且具有手工质感，将逼真的花卉纹理排列成令人信服的鸡体结构，采用居中构图、全身视角、干净简约的背景，呈现出精致的奇幻编辑摄影美学。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936921538_3a1mfv_HGbSsduXUAAtLQW.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-410",
    title: "蓝天背景下的悬浮 3D 头像",
    category: "摄影写实",
    industry: "通用",
    description: "使用提供的参考图像，提取其中人物的头部，并将其重构为居中的悬浮 3D 玩具风格肖像，呈现出光泽感的塑料质感。去除火车内饰、桌子、瓶子、书本、毛衣、耳机和身体部分",
    prompt: `使用提供的参考图像，提取其中人物的头部，并将其重构为居中的悬浮 3D 玩具风格肖像，呈现出光泽感的塑料质感。去除火车内饰、桌子、瓶子、书本、毛衣、耳机和身体部分，仅保留头部，裁剪范围覆盖整个头部及耳朵。添加金丝边眼镜作为新配饰。将头部置于明亮饱和的蓝天背景下，点缀以柔软的卡通风格白云，采用简洁的极简构图、均匀的日光照明，营造出一种趣味十足的超现实摄影棚视觉效果。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022534266_vhdp8r_HGiT0DrXcAA9Rxv.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-411",
    title: "诡异的全身体外星人肖像",
    category: "摄影写实",
    industry: "通用",
    description: "一张超写实的全身体外星人摄影棚肖像，画面中一个令人不安的人形外星人独自站在昏暗、烟雾缭绕的蓝黑色背景前。该生物身材极高且消瘦，四肢修长，腰部狭窄，手指细长，巨大",
    prompt: `一张超写实的全身体外星人摄影棚肖像，画面中一个令人不安的人形外星人独自站在昏暗、烟雾缭绕的蓝黑色背景前。该生物身材极高且消瘦，四肢修长，腰部狭窄，手指细长，巨大的赤脚踩在昏暗的摄影棚地面上。其皮肤光滑但呈皮革质感，带有细微褶皱，呈现深炭蓝色并伴有冷灰色高光，清晰地勾勒出肋骨、胸骨、锁骨、肌腱以及胸部、腹部、肩部和颈部紧绷的肌肉线条。躯干无毛且干瘪，具有一种生物学上看似合理却令人不安的诡异解剖真实感。头部光秃、肥大，呈略微球状，具有经典的外星人轮廓，连接着异常修长的脖子；面部保持模糊、不可读且极度诡异，而非具有表情。外星人呈正面站立，略带四分之三侧角，双臂自然垂在身体两侧，姿态挺拔但带有微妙的掠食感，全身居中于画面。采用低调的电影级布光，辅以微弱的冷色轮廓光和柔和的顶部照明，雕刻出每一处褶皱和轮廓，同时保持整体场景的阴暗、压抑和沉重感。低饱和度色调，超精细皮肤纹理，写实生物设计，焦点清晰，高对比度，氛围阴森，无衣物，无道具，除阴影笼罩的摄影棚背景外无其他环境细节。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883092675_e4xkln_HGdXagJXkAEQ8lk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-412",
    title: "赛博朋克风格奥迪后方追拍镜头",
    category: "摄影写实",
    industry: "通用",
    description: "电影级后侧方跟拍镜头，一辆未来感十足的白色奥迪超级跑车在夜晚湿滑的街道上疾驰，穿梭于密集的霓虹城市中，视角极低，靠近后轮。车辆拥有流畅的宽体轿跑轮廓，采用光泽感",
    prompt: `电影级后侧方跟拍镜头，一辆未来感十足的白色奥迪超级跑车在夜晚湿滑的街道上疾驰，穿梭于密集的霓虹城市中，视角极低，靠近后轮。车辆拥有流畅的宽体轿跑轮廓，采用光泽感珍珠白车身面板，配备黑色后包围，以及一条横贯车尾的细长 LED 贯穿式尾灯，灯带包含分段式红白光效。奥迪四环标志在车尾中央发出白光，下方带有风格化的发光车型徽标，以未来感字体书写着“tron”。后部车身部分移除或呈现透明开启状态，露出内部的高性能机械组件：后部低位安装有 1 个大型矩形金属电池或动力单元，横跨车尾可见 3 根粗壮的排气管或冷却管，右侧中央可见 1 个变速箱或电机总成，以及带有 2 个大尺寸鳍片的深黑色后扩散器。车辆配备超大尺寸深凹黑色轮毂和超宽后胎，轮胎侧壁环绕着亮白色的日式风格文字。背景和路面采用强烈的动态模糊以体现高速感，车身和裸露的机械结构保持清晰对焦。场景周围环绕着抽象的城市光斑（bokeh），霓虹招牌光影流转，红、蓝、白色的城市灯光在湿润的路面和光亮的漆面上交相辉映。高对比度，赛博朋克氛围，写实汽车摄影，戏剧性夜间照明，超精细金属质感，电影级镜头，动态构图，速度感，力量感，未来工程设计。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022601649_epu281_HGlP1d4WQAAhe21.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-413",
    title: "超现实主义射手与飞禽走兽",
    category: "摄影写实",
    industry: "通用",
    description: "一张超现实主义电影风格的户外肖像，描绘了一位站在深邃晴空下干草地里的蒙面射手，采用宽幅横向构图，取景范围约为膝盖以上。中心人物是一位身着复古草原风连衣裙、佩戴同",
    prompt: `一张超现实主义电影风格的户外肖像，描绘了一位站在深邃晴空下干草地里的蒙面射手，采用宽幅横向构图，取景范围约为膝盖以上。中心人物是一位身着复古草原风连衣裙、佩戴同款头巾的女性形象，她正手持一把简易木制长弓瞄准画面左侧，箭已拉满至脸颊处。她的面部被一块柔和的矩形模糊或块状遮挡物完全遮盖，营造出一种离奇的匿名感。连衣裙为鼠尾草绿，配有长泡泡袖，腰部有系带收腰，并带有细小的红白相间碎花图案。绿色头巾下方，红色的布料或围巾包裹着她的下半张脸和颈部。她周围共有 12 只动物：8 只白色飞鸟在不同距离的天空中翱翔，2 只较大的白色鸟类站在右侧地面，1 个鹿头从左下角前景探入，1 个羊头从右下角前景探入。在最右侧边缘增加 1 只侧面可见的红头鹤类鸟。画面应呈现出梦幻、怪诞且具有象征意义的氛围，而非写实风格，并具备明亮的中午阳光、浓郁的色彩、细腻的胶片颗粒感以及略带复古的编辑摄影质感。使用低角度透视，通过弓箭形成的动态对角线以及分层的动物布局来营造张力和动感。底部边缘可见干草，但背景大部分为开阔的天空。画面需呈现高细节的织物褶皱、自然的鸟类翅膀姿态以及平衡的超现实构图。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883156214_a0bmog_HGdb18VXAAAi0vS.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-414",
    title: "超现实牛仔时尚肖像",
    category: "摄影写实",
    industry: "通用",
    description: "一张超现实时尚肖像，画面中心是一位神秘的牛仔人物，采用半身构图，背景为明亮的钴蓝色白昼天空，点缀着几朵柔和的白云。人物面部被一个从额头延伸至口鼻处的垂直长方形模",
    prompt: `一张超现实时尚肖像，画面中心是一位神秘的牛仔人物，采用半身构图，背景为明亮的钴蓝色白昼天空，点缀着几朵柔和的白云。人物面部被一个从额头延伸至口鼻处的垂直长方形模糊块完全遮挡，营造出匿名审查的身份效果。人物头戴一顶带有浅白色帽顶的闪亮红色牛仔帽，颈部和下半张脸缠绕着黑色围巾或方巾，身穿一件大胆的红色西部风格夹克或衬衫，上面印有白色马匹插图和花卉图案。颈部和胸前叠戴着厚重的极繁主义珠宝：1 条超长珍珠项链垂至胸前，领口处叠戴至少 4 条短款珍珠项链，以及 1 条带有硬币状垂饰的华丽金色声明项链。在人物双肩后方放置 2 个淡粉色马头，左右各一，如同超现实的伙伴或雕塑道具般微微向外。背景下方包含 2 辆半隐半现的红色跑车，左右各一，融入红色的沙漠地平线中。采用梦幻般的复古未来主义西部美学，具有光泽质感、柔焦效果、轻微的色差以及低保真（lo-fi）的编辑风格。对称构图，主体居中，色彩饱和，充满奇异的奢华氛围，高定超现实主义，电影感肖像摄影。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936890107_b3mjwu_HGiShxaWcAAjCM9.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-415",
    title: "超现实章鱼汉堡高级餐饮摄影",
    category: "摄影写实",
    industry: "通用",
    description: "一张昏暗、情绪化的高级餐厅场景照片，采用直接闪光灯拍摄，带有略显不安的超现实恐怖基调。构图中心是一份摆盘精致的美味三明治，其内馅看起来像是一只逼真的章鱼：顶部是",
    prompt: `一张昏暗、情绪化的高级餐厅场景照片，采用直接闪光灯拍摄，带有略显不安的超现实恐怖基调。构图中心是一份摆盘精致的美味三明治，其内馅看起来像是一只逼真的章鱼：顶部是光泽诱人的金棕色芝麻汉堡胚，下方是肉质粉紫色的章鱼躯体，细节包括清晰的静脉、毛孔、吸盘、褶皱的皮肤，以及从两侧和前方伸出的几条触手。生物看起来既像是烹饪过的，又带有令人不安的生命感，左侧可见一个球状眼球状结构，右侧则有密集的孔洞和纹理，营造出一种诡异的生物有机外观。三明治放置在一个大型圆形白色陶瓷盘中，盘底有一滩黄色黄油状或油状酱汁，酱汁中混有几滴红色液滴。在左前景的背景处放置一个小碟子，里面盛着一块黄油。餐桌上必须准确摆放 6 个可见的饮用杯：2 个大型红酒杯，3 个高脚白葡萄酒或香槟杯，以及右边缘的 1 个深色啤酒杯。在后方中心放置 1 个金色烛台中的点燃小蜡烛和 1 个插有白色花朵的小型透明花瓶。使用白色桌布，环境光非常昏暗，带有温暖的烛光，玻璃器皿上有强烈的相机闪光反射，采用随意的快照式浅景深构图，呈现出一种怪诞、超细节、写实且极具视觉冲击力的高级餐厅氛围。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883155057_oy4ixe_HGZT_4tbYAAHkzY.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-416",
    title: "逼真的国际象棋开局照片",
    category: "摄影写实",
    industry: "通用",
    description: "一张逼真的室内照片，展示了放置在深色木桌上的木制国际象棋棋盘，视角为略微抬高的正面角度，棋子采用 Staunton 风格，处于开局中期位置。棋盘由浅色枫木和深色",
    prompt: `一张逼真的室内照片，展示了放置在深色木桌上的木制国际象棋棋盘，视角为略微抬高的正面角度，棋子采用 Staunton 风格，处于开局中期位置。棋盘由浅色枫木和深色胡桃木方格组成，带有木质边框；棋子为亮面黑色和哑光象牙色。展示全部 32 枚棋子，无被吃掉的棋子：16 枚黑色棋子和 16 枚白色棋子。黑色棋子位于远端，按标准底线顺序从左至右排列：车、马、象、后、王、象、马、车，前方有 8 枚黑色兵。白色棋子位于近端，按标准底线顺序从左至右排列：车、马、象、后、王、象、马、车，前方有 8 枚白色兵。仅移动了 2 枚中心兵：一枚黑色兵向前推进两格至 e5，一枚白色兵向前推进两格至 e4，在相邻的中心格面对面。其余棋子保持初始位置。使用来自右侧的自然窗光，光影柔和，背景为温馨的家居室内环境，配有米色窗帘和木制柜子，浅景深，比例真实，呈现干净的数码摄影质感，构图居中，棋盘几何结构准确。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883190792_eujavk_HGdQKkTacAAWXa_.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-417",
    title: "金门大桥下的橄榄球队友",
    category: "摄影写实",
    industry: "通用",
    description: "一张逼真的户外体育肖像，两名美式橄榄球运动员并肩站在水滨小径上，背景是晴朗天气下的金门大桥。左侧球员身穿沾满泥土的白色球衣，印有醒目的黑色数字 10，穿着白色橄",
    prompt: `一张逼真的户外体育肖像，两名美式橄榄球运动员并肩站在水滨小径上，背景是晴朗天气下的金门大桥。左侧球员身穿沾满泥土的白色球衣，印有醒目的黑色数字 10，穿着白色橄榄球裤，内搭黑色长袖，身侧拿着一个白色头盔。右侧球员身穿沾满泥土的深海军蓝球衣，印有醒目的白色数字 23，穿着白色橄榄球裤，内搭白色长袖，身侧拿着一个白色头盔。两位运动员均为半身像（从躯干到大腿），面向镜头，内侧手臂搭在对方肩上，呈现出友好的赛后姿态。他们的制服上清晰可见比赛留下的草渍和污垢。背景是蓝色的水面、岩石海岸线、厚重的铁锈色铁链护栏、远处的山丘，以及金门大桥红橙色的桥塔和悬索。自然光，纪实风格体育摄影，浅景深，织物纹理清晰，人体结构逼真，展现团队凝聚力的抓拍氛围。为保护隐私，请用平滑的矩形模糊块遮挡两人的面部。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883162366_pjywkz_HGda0CgWQAAqcGQ.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-418",
    title: "长城旅行拼图",
    category: "摄影写实",
    industry: "通用",
    description: "{\"type\":\"旅行照片拼图\",\"subject\":\"中国长城\",\"style\":\"高分辨率写实旅行摄影，明亮的日光清晰度，生动的自然色彩，编辑级旅游手册风格",
    prompt: `{"type":"旅行照片拼图","subject":"中国长城","style":"高分辨率写实旅行摄影，明亮的日光清晰度，生动的自然色彩，编辑级旅游手册风格","composition":{"format":"正方形拼图","grid":{"columns":3,"rows":3,"count":8},"borders":"所有图片间均有细白边框","image_count":8},"scenes":[{"position":"左上宽幅","description":"俯瞰视角，长城蜿蜒穿过郁郁葱葱的绿色山峦，背景是蓝天和零星白云"},{"position":"右上宽幅","description":"从长城石阶路面平视拍摄，延伸至一座敌楼，两侧是砖砌垛口，远方可见山脊"},{"position":"中左面板","description":"从下方仰拍石质敌楼的建筑细节，深色传统屋檐与蓝天白云形成对比"},{"position":"中中面板","description":"长城金色日落场景，温暖的橙色阳光低垂在层叠的山峦剪影之上，长城蜿蜒曲折地延伸至敌楼"},{"position":"中右面板","description":"长焦拍摄的风景，长城在陡峭的绿色山脊上曲折盘旋，强调其长龙般的形态"},{"position":"左下面板","description":"高位俯瞰长城长段，几名游客正沿着中央路径向敌楼走去"},{"position":"中下面板","description":"人视角的步道景观，一小群穿着夏季休闲装的游客背对镜头，沿着长城向郁郁葱葱山丘上的多座敌楼走去"},{"position":"右下面板","description":"山景全景，右侧由长城近景和上方的绿叶枝条框定，展示了层叠的蓝绿色山脊延伸至远方"}],"environment":{"season":"夏季","vegetation":"茂密的绿色山林","sky":"晴朗蓝天伴有零星积云，仅一张为温暖日落场景","lighting":"大部分为明亮的午后阳光，包含一张黄金时刻的日落照片"},"details":{"architecture":"古老的灰石砖墙、垛口、阶梯式步道、多座敌楼","people":"仅 2 个面板包含清晰可见的游客，另有 1 个面板包含远处的微小行人","mood":"宏伟、充满冒险感、标志性的世界遗产目的地"}}`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022551796_4q4b0h_HGkjEiObwAAX6jx.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-419",
    title: "阳光下的西装肖像与红玫瑰",
    category: "摄影写实",
    industry: "通用",
    description: "一张极简主义风格的忧郁肖像，一位年轻男子身着黑色正装、白色衬衫并系着黑色领带，站在浅米色的素色墙前，沐浴在午后温暖的阳光中。画面为半身像，略微侧身，面部大部分被",
    prompt: `一张极简主义风格的忧郁肖像，一位年轻男子身着黑色正装、白色衬衫并系着黑色领带，站在浅米色的素色墙前，沐浴在午后温暖的阳光中。画面为半身像，略微侧身，面部大部分被阴影和构图遮挡，突显出下颌线、颈部、耳朵和凌乱的黑色短发。他的一只手轻柔地拿着一朵长茎红玫瑰，花朵盛开，带有几片绿叶，置于胸前。来自左侧强烈的定向金色光线将男子和玫瑰的清晰阴影投射在墙上，营造出电影般的浪漫氛围。干净的编辑摄影风格，柔和自然的肤色，深色西装与阳光墙面形成高对比度，浅景深奢华时尚美学，居中构图，写实摄影风格。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936826182_qmoii6_HGfdW7QbwAAUbXw.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-420",
    title: "阳光明媚的日本咖啡馆街景",
    category: "摄影写实",
    industry: "通用",
    description: "一张明亮、超写实的日本夏季街景，以行人视角的水平高度拍摄，展现了一条宽阔整洁的城市人行道，两侧绿树成荫，投下斑驳的树影。场景呈现了一个晴朗夏日里的现代综合用途街",
    prompt: `一张明亮、超写实的日本夏季街景，以行人视角的水平高度拍摄，展现了一条宽阔整洁的城市人行道，两侧绿树成荫，投下斑驳的树影。场景呈现了一个晴朗夏日里的现代综合用途街区，右侧是一家现代风格的咖啡馆或餐厅，配有高大的落地玻璃窗、深色边框、石材外立面，以及延伸至露台上方的暖色木质吊顶。在咖啡馆外放置 3 把大型米色遮阳伞，下方摆放着木质桌椅。人行道上行人往来有序，约有 14 名行人分布在远处，大多数人穿着浅色夏季商务休闲装，色调以白色、米色、海军蓝和灰色为主。在画面中心前景处，加入 1 名骑自行车的行人背对镜头，身穿短袖白衬衫和深色长裤，背着单肩包。在右侧前景处，加入 2 名背对镜头的女性，一人身穿白色衬衫和深色长碎花裙，手持圆扇；另一人身穿白色上衣和浅色花纹裙，提着包。在咖啡馆外添加 2 个显眼的立式招牌：一个是带有醒目日文“氷”字和冰蓝色图形的竖幅旗帜，另一个是写有日文“夏季限定 冷たいドリンク”的立式折叠招牌，并配有 2 款冷饮的图片，分别为一杯深色冰饮和一杯浅色柠檬水状饮料。在左侧，展示一条安静的街道，远处有少量车辆、长椅、低矮的混凝土花坛和修剪整齐的灌木。构图应强调纵深感，通过林荫大道形成长远的消失点，呈现正午明媚的阳光、窗户上真实的倒影，以及高端、宁静的城市氛围。照片级建筑摄影，自然色彩，高细节，广角镜头，深焦。`,
    tags: ["摄影写实"],
    image: "https://cms-assets.youmind.com/media/1776936866271_w2wihp_HGgJbhNaMAAWfx5.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-421",
    title: "阳光洒满的书桌，白猫与笔记本电脑",
    category: "摄影写实",
    industry: "通用",
    description: "一张温馨且阳光明媚的家庭办公场景，采用写实的生活摄影风格。一只拥有浅绿色眼睛的白色短毛猫端坐在温暖的木质书桌左侧中央，正对着镜头，神情平静而专注，尾巴环绕在两只",
    prompt: `一张温馨且阳光明媚的家庭办公场景，采用写实的生活摄影风格。一只拥有浅绿色眼睛的白色短毛猫端坐在温暖的木质书桌左侧中央，正对着镜头，神情平静而专注，尾巴环绕在两只前爪周围。猫的左侧摆放着 1 盆叶片茂盛的室内盆栽（置于米色纹理花盆中）和 1 个装有黑咖啡的陶瓷马克杯。猫的前方放着 1 本打开的螺旋笔记本，上面写有手写笔记，一支银色钢笔斜放在页面上。书桌右侧是 1 台稍微朝向观众倾斜的笔记本电脑，屏幕上显示着绿松石色湖泊与蓝天下壮丽雪山的生动壁纸。书桌后方是一扇大窗户，挂着柔软的米色窗帘，明亮的金色晨光从右侧射入，在书桌上投下自然的阴影。左侧墙壁上隐约可见 2 幅装裱好的挂画。整体氛围应显得宁静、高效且充满居家温暖感，并具备柔和的电影级光影、清晰的细节、浅景深效果以及高端的编辑摄影质感。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936914618_051amy_HGgyEaZbkAATEMm.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-422",
    title: "雨夜城市穿行",
    category: "摄影写实",
    industry: "通用",
    description: "从低角度拍摄的电影级城市雨夜街景。前景中，1 位孤独的行人呈现为近乎黑色的剪影，正从左向右迈步穿过街道，头顶撑着 1 把雨伞，身穿深色外套并背着背包。行人的面部",
    prompt: `从低角度拍摄的电影级城市雨夜街景。前景中，1 位孤独的行人呈现为近乎黑色的剪影，正从左向右迈步穿过街道，头顶撑着 1 把雨伞，身穿深色外套并背着背包。行人的面部被阴影和逆光遮挡。中景右侧，1 辆城市公交车正迎面驶来，明亮的暖色车灯和琥珀色的 LED 线路显示屏在雨水和运动模糊中若隐若现。最左侧，1 个红色的行人过街信号灯亮起，显示着举手图标。街道被雨水浸透，形成大片积水，将红、蓝、橙、白色的霓虹灯和交通灯光在沥青路面上拉出强烈的倒影。街道两侧高楼林立，构成密集的市中心走廊，零星的灯箱和窗户光芒融入深蓝黑色的雨夜氛围中。强调光亮的湿润路面、闪烁的雨滴、散景光斑、强烈的对比度、戏剧性的逆光、忧郁的黑色电影氛围、写实摄影风格、浅景深以及鲜艳且饱和的倒影。采用宽银幕构图，剪影行人位于中左侧，公交车位于中右侧。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022561212_ekxpn5_HGp4DGraAAApy2P.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-423",
    title: "黄金时刻咖啡馆人像",
    category: "摄影写实",
    industry: "通用",
    description: "一张温暖、抓拍风格的街头咖啡馆编辑人像，一位放松的年轻女性独自坐在欧洲狭窄鹅卵石街道旁的小圆桌前，沐浴在午后的阳光下。她穿着一件超大款奶油色针织 V 领毛衣和宽",
    prompt: `一张温暖、抓拍风格的街头咖啡馆编辑人像，一位放松的年轻女性独自坐在欧洲狭窄鹅卵石街道旁的小圆桌前，沐浴在午后的阳光下。她穿着一件超大款奶油色针织 V 领毛衣和宽松的浅蓝色牛仔裤，深棕色头发随意扎成一个凌乱的丸子头，有几缕发丝垂落。她姿态随意地坐着，一只膝盖抬起，一只手拿着白色小浓缩咖啡杯，另一只手放在桌上的碟子旁。桌上清晰可见 6 件物品：左边缘有 1 盆赤陶盆栽绿植，前景有 1 个带金属盖的玻璃糖罐，1 部黑色智能手机，1 本翻开的平装书，1 个放有小勺的白色碟子，以及 1 个带有精致红色标志的白色浓缩咖啡杯。咖啡馆左侧是店面橱窗，右侧是一排向背景延伸的户外桌椅，远处的行人和建筑虚化处理。黄金时刻逆光，浅景深，自然的肤色，电影级焦外成像，亲密的生活方式摄影，逼真的质感，柔和的阴影，竖构图，从桌面高度拍摄的中景，高度写实。`,
    tags: ["摄影写实", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883089950_uygjd9_HGdLJl5WgAE3qc3.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-424",
    title: "写实风格白色连衣裙镜面自拍",
    category: "人像摄影",
    industry: "通用",
    description: "一张写实的室内镜面自拍，画面中一位身材苗条的年轻女性站在光线温馨的现代公寓客厅里，身穿一件修身的象牙白单肩紧身中长裙，躯干和臀部带有褶皱设计。她留着深棕色中分齐",
    prompt: `一张写实的室内镜面自拍，画面中一位身材苗条的年轻女性站在光线温馨的现代公寓客厅里，身穿一件修身的象牙白单肩紧身中长裙，躯干和臀部带有褶皱设计。她留着深棕色中分齐肩直发，佩戴极简首饰，包括 2 枚戒指、一只银色手镯和一对精致的小耳环。她用一只手举着手机自拍，手机壳为黑色，饰有红色云纹，遮住了她的脸部。她身体微微侧转，姿态放松，一只手臂自然下垂，展现出自然的女性轮廓。画面采用竖构图，呈现出休闲社交媒体穿搭镜面自拍的视角。她身后是一张米色布艺沙发，上面放着 1 个灰色几何图案靠垫和 1 个灰褐色皮质手提包。背景包括一面质感十足的古铜棕色装饰墙、光亮的奶油色瓷砖地面、左侧昏暗的走廊（挂有 3 幅装裱艺术画）以及温暖的嵌入式天花板射灯。柔和的傍晚环境光，自然的肤色，写实的织物张力和褶皱，镜面中细腻的反射，整洁的高档公寓美学，高写实度，照片级皮肤纹理，智能手机拍摄视角。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883091680_gc1kqf_HGdDIHqXEAEbhzg.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-425",
    title: "复古浴室闪光灯镜面自拍",
    category: "人像摄影",
    industry: "通用",
    description: "一张在小型复古浴室中拍摄的随性闪光灯镜面自拍，采用 2000 年代初期写实的一次性相机美学进行竖构图。一位年轻女性站在略显脏乱的镜子前，面部被柔和的矩形模糊处理",
    prompt: `一张在小型复古浴室中拍摄的随性闪光灯镜面自拍，采用 2000 年代初期写实的一次性相机美学进行竖构图。一位年轻女性站在略显脏乱的镜子前，面部被柔和的矩形模糊处理遮挡，她手持智能手机，明亮的直射闪光灯在画面中右侧产生了强烈的星芒光晕。她留着深棕色头发，带有浅金色挑染，梳着凌乱的鲨鱼夹盘发，脸颊两侧留有碎发，佩戴着小圆圈耳环和两条叠戴的银色项链。她身穿一件修身的白色短款 T 恤，上面印有褪色的粉色学院风文字“NANTUCKET”（在镜子中呈镜像显示），下身穿着宽松的灰麻色运动裤和白色袜子；她的一只膝盖随意地抬在洗手台上，使姿势呈现出一种放松、亲密的抓拍感。手机壳上贴满了可爱的贴纸，并配有一个带有粉色卡通熊或兔子图案的圆形气囊支架。浴室下半部分铺着淡粉色墙砖，上半部分为灰白色墙面，洗手台上杂乱地摆放着总共 7 件洗漱和美容用品：左侧有 4 个瓶子，洗手台边缘有一把黑色发梳，镜子底部边缘摆放着 2 个香水或化妆品瓶。背景中挂着一条米色毛巾，金属镜框上可见明显的污渍和灰尘颗粒，捕捉到了闪光灯的效果。画面包含投射在左侧墙壁和镜子上的戏剧性阴影，柔和的室内环境绿光与强烈的闪光灯交织，带有细腻的胶片颗粒感、自然的皮肤纹理、轻微的镜头畸变，营造出一种真实且未经修饰的生活照氛围。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936910236_3g8awm_HGhvCfCaEAErAGL.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-426",
    title: "奢华室内镜面自拍人像",
    category: "人像摄影",
    industry: "通用",
    description: "一张逼真的室内镜面自拍，拍摄对象为一位身材苗条、充满魅力的年轻女性。她站在光线柔和的高档客厅或酒店套房内，采用从头部到膝盖以下的竖构图拍摄。她身穿一件修身的奶油",
    prompt: `一张逼真的室内镜面自拍，拍摄对象为一位身材苗条、充满魅力的年轻女性。她站在光线柔和的高档客厅或酒店套房内，采用从头部到膝盖以下的竖构图拍摄。她身穿一件修身的奶油色或象牙白紧身中长裙，裙身带有优雅的褶皱和抽褶设计，不对称领口设有一条斜跨胸前的单肩带，露出另一侧肩膀。她留着一头深棕色长发，发丝微卷，中分偏分，自然垂落在双肩。她右手持智能手机置于脸部前方，部分遮挡面部，手机朝向墙上的镜子；手机配有带有红色云朵图案的深色手机壳。左臂自然垂在身侧。添加精致的首饰：1 条带有小吊坠的细项链，右手腕佩戴 1 只银色手镯或手环，持手机的手指上佩戴戒指。强调逼真的女性轮廓、细腻的皮肤、柔和的暖色环境光，以及精致的编辑级社交媒体摄影风格。背景应包括她身后 1 张米色沙发，沙发右侧放着 1 只棕色皮质手提包，镜子区域后方为 1 面质感石材或混凝土装饰墙，左侧为温暖的走廊，可见 2 幅挂墙艺术品。运用自然的室内阴影、细腻的皮肤纹理、逼真的面料褶皱以及腰部和臀部的紧致感，营造奢华公寓美学，构图简洁，细节丰富。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883092153_cm1rks_HGdDJC8WcAAOm_A.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-427",
    title: "将度假自拍转化为影棚级肖像",
    category: "人像摄影",
    industry: "通用",
    description: "使用提供的参考图像，保持人物和蓝色 Polo 衫不变，将随意的泳池边自拍转化为干净、专业的影棚半身肖像。移除整个户外度假村背景，并将其替换为纯暖橙色背景。重新构",
    prompt: `使用提供的参考图像，保持人物和蓝色 Polo 衫不变，将随意的泳池边自拍转化为干净、专业的影棚半身肖像。移除整个户外度假村背景，并将其替换为纯暖橙色背景。重新构图，使主体居中，正对镜头，裁剪范围从胸部中部向上，采用均匀柔和的影棚布光，呈现清晰、精致的照片质感。消除自拍感、背景干扰和其他人物，并在右下角添加一个白色四角星形图标。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022595185_ydoq2s_HGp3s19XIAAV0cr.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-428",
    title: "自拍转为影棚级职业照",
    category: "人像摄影",
    industry: "通用",
    description: "使用提供的参考图像，将随意的泳池边自拍转换为干净、专业的半身影棚肖像。保持人物和 Polo 衫不变，但需移除户外度假背景、其他人物、家具、泳池以及所有与度假相关",
    prompt: `使用提供的参考图像，将随意的泳池边自拍转换为干净、专业的半身影棚肖像。保持人物和 Polo 衫不变，但需移除户外度假背景、其他人物、家具、泳池以及所有与度假相关的元素。重新构图为居中的肖像剪裁，使主体面向镜头，露出肩膀，并将自拍角度校正为正式的正面构图。添加平滑的深青色影棚背景，辅以微妙的暗角效果和柔和、修饰肤色的肖像光影，打造出精致的企业形象照风格。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022596493_61tf8l_HGp3s2BWIAAi7lP.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-429",
    title: "莫斯科直升机自拍",
    category: "人像摄影",
    industry: "通用",
    description: "一张逼真的智能手机风格旅行照片，拍摄于直升机机舱内。画面左侧为一名坐着的乘客，右侧大窗外呈现莫斯科的全景航拍视角。乘客身穿黑色拉链运动夹克，胸前有白色小勾标志，",
    prompt: `一张逼真的智能手机风格旅行照片，拍摄于直升机机舱内。画面左侧为一名坐着的乘客，右侧大窗外呈现莫斯科的全景航拍视角。乘客身穿黑色拉链运动夹克，胸前有白色小勾标志，系着安全带，佩戴金属腕表和带有麦克风支架的大型黑色航空耳机。其面部被矩形模糊遮挡，正对着镜头竖起大拇指。直升机内部光线较暗，配有黑色真皮座椅，窗户边缘为米色舱内装饰。窗外捕捉到莫斯科市中心阴天白日的全景，克里姆林宫的围墙和塔楼清晰可见，右下角为圣瓦西里主教座堂色彩斑斓的洋葱头圆顶，广阔的城市景观向远处延伸，远处的地平线右侧可见一群现代摩天大楼。采用自然漫射光，呈现逼真的城市细节和轻微的大气雾感，构图模拟游客乘坐直升机时的随手自拍，广角但无畸变。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936903047_ammd4g_HGfffXiWcAA343d.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-430",
    title: "逼真的麦当劳自拍肖像",
    category: "人像摄影",
    industry: "通用",
    description: "一张在亚洲麦当劳餐厅室内拍摄的高度逼真的智能手机休闲自拍，构图为一名年轻男子坐在桌前的半身肖像。相机以手臂长度从略高于桌面的高度持握，营造出自然的正面自拍视角，",
    prompt: `一张在亚洲麦当劳餐厅室内拍摄的高度逼真的智能手机休闲自拍，构图为一名年轻男子坐在桌前的半身肖像。相机以手臂长度从略高于桌面的高度持握，营造出自然的正面自拍视角，一只前臂向镜头延伸。拍摄对象身穿黑色 T 恤，左胸处印有白色 Tesla 小标志，留着黑色直短发，隐约可见细黑框眼镜，一只手轻托下巴，姿态放松。他的面部中心被一个大型实心矩形模糊块完全遮挡，在保护隐私的同时，保留了头发、耳朵、下颌边缘和眼镜腿的可见度。左下角前景处放置着 1 个带有杯盖和白色吸管的白色麦当劳纸质饮料杯，被画面边缘裁切。背景展示了餐厅柜台区域，配有温暖的环境光；左侧是一块大型红色墙板，上面印有黄色麦当劳拱门标志和白色标语“i’m lovin’ it”及其下方的中文字样；顶部悬挂着 4 块发光的数字菜单项目，显示着汉堡、薯条、套餐、价格和中文字样；背景柜台附近还有 2 人，一人背对着镜头背着背包，另一人部分身影出现在收银台后。请使用自然的色彩平衡、轻微的室内颗粒感、逼真的反射效果、浅至中等的景深，以及未经摆拍的社交媒体快照的随性观感。`,
    tags: ["人像摄影", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883097033_ly0rvn_HGeaa6Sa8AAuokd.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-431",
    title: "108 款 Q 版奇幻曼陀罗",
    category: "海报",
    industry: "通用",
    description: "一张宏大且细节极其丰富的奇幻曼陀罗海报，展示了 108 个独特的 Q 版角色，它们围绕着一个闪耀的中心徽章，以同心圆环的形式排列。整体构图完全对称，填满宽阔的横",
    prompt: `一张宏大且细节极其丰富的奇幻曼陀罗海报，展示了 108 个独特的 Q 版角色，它们围绕着一个闪耀的中心徽章，以同心圆环的形式排列。整体构图完全对称，填满宽阔的横向画布，宛如一幅华丽的收藏级壁画。中心位置设有一个发光的金色核心，9 个 Q 版动物奇幻吉祥物聚集成一个圆形奖章，每个角色都拥有超大头部、娇小身体、富有表现力的眼睛和奢华的服饰细节。中心周围环绕着多个间距均匀的同心圆，容纳其余 99 个角色，每个角色占据一个楔形区域，并被设计为独特的元素或神话变体。其中包括狐狸、兔子、猫、狼、狮子、鸟、龙、鹿以及混合兽类角色，所有角色均以可爱的 Q 版风格呈现，但配有史诗般的高奇幻盔甲、长袍、皇冠、羽毛、角、宝石、披风、法杖和魔法配饰。通过颜色、轮廓、物种特征和元素主题，使每个角色在视觉上都各具特色，同时保持统一的绘画感动漫奇幻美学。

使用以明亮的金色、象牙白、奶油色、紫色、靛蓝、蓝宝石色和柔和琥珀色为主的丰富色调，并点缀以深红、冰青、祖母绿和日落橙。赋予图像一种神圣天体图或黄道十二宫轮的感觉，每个圆环之间由优雅的镀金边框和弧形分隔线隔开。在许多角色周围添加发光的魔法能量、闪光、光环、旋转的火焰、薄雾、雪花、云朵、水花、闪电卷、花卉图案和天体粒子。在外围，放置几个整合在边框中的大型装饰性守护者插画：左上角是一个明亮的太阳徽章，右上角的圆形面板中是一只白凤凰般的鸟，右下角是一个花卉或星爆徽章，左下角的圆形面板中是一组火系角色集群，左右边缘还嵌入了额外的巨型元素兽形象。用受泥金装饰手抄本和奇幻塔罗牌设计启发的精致古董装饰边框框住整幅艺术品，运用金银丝细工、角落徽章、几何饰边和奥术图案。

渲染效果应极其致密且清晰，如同用于海报打印的 4K 奇幻插画，整幅图像中包含清晰可辨的微小角色轮廓、错综复杂的线条、柔和的水彩质感阴影、发光的高光以及精致的集换式卡牌游戏概念艺术质感。强调丰富性、和谐感和径向秩序：总计 108 个 Q 版形象，排列成一个宏伟的神话元素吉祥物曼陀罗。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883137231_b9emn3_HGdfyMCa0AAJ1Ia.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-432",
    title: "Crimson Space Opera 关键视觉图",
    category: "海报",
    industry: "通用",
    description: "一张极具戏剧性的竖版科幻关键视觉海报，描绘了一款黑暗太空歌剧游戏。画面中心偏下方是一艘巨大的外星机械飞船，呈对角线从左下向右上倾斜，仿佛正在太空中疾驰。飞船造型",
    prompt: `一张极具戏剧性的竖版科幻关键视觉海报，描绘了一款黑暗太空歌剧游戏。画面中心偏下方是一艘巨大的外星机械飞船，呈对角线从左下向右上倾斜，仿佛正在太空中疾驰。飞船造型锋利、非对称且极具侵略性的有机感，由层叠的黑色金属和发光的深红色装甲板构成，拥有长矛般的船首、许多锯齿状的鳍，以及约 12 到 16 条像生物机械发丝一样从后上方飘向后方的鞭状触须或尖刺。飞船后方悬浮着一颗处于阴影中的大行星，被 3 个发光的红色轨道环环绕，形成光环效应。左上方包含一颗被画面部分裁切的环形山月球或行星。前景和边缘（尤其是右下角和左下角）散布着多个暗色小行星和岩石碎片，以营造深度感。背景是密集的星场，伴有红色星云和炽热的宇宙尘埃条纹。右上角有一道耀眼的橙白色太阳耀斑射入场景，在飞船和轨道环上投射出炽热的边缘光。采用黑色、深红、余烬红和白色高光的高对比度调色板，呈现出光泽的金属反射效果和冷峻的末日氛围。在右侧添加竖排白色明朝体日文标语：「あの太陽に飛び込めば 冷めきった私の心も温かくなるのだろうか」。在底部中心，添加非常大的、带有裂纹质感和微弱红光的白色日文衬线体主标题：「斑鳩の柩」。在其下方添加一行较小的红色片假名副标题：「イカルガのクルスー」，再下方添加一行红色的小写罗马字母："IKARUGA NO CRUX"。整体呈现出高级动漫游戏关键艺术风格，电影级海报构图，超高细节，焦点清晰，动态光影，史诗规模，既阴森又唯美。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883131234_ym2ixa_HGbISeDbYAA5ckK.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-433",
    title: "Found-Footage 办公室恐怖快照",
    category: "海报",
    industry: "通用",
    description: "一张粗粝的 Found-Footage 风格恐怖照片，拍摄于夜晚昏暗狭窄的安保办公室内，采用机顶闪光灯直闪，带有轻微的胶片颗粒感。前景中共有 2 名年轻女性，两",
    prompt: `一张粗粝的 Found-Footage 风格恐怖照片，拍摄于夜晚昏暗狭窄的安保办公室内，采用机顶闪光灯直闪，带有轻微的胶片颗粒感。前景中共有 2 名年轻女性，两人均被画面部分裁切，且面部因隐私保护被模糊处理成矩形色块。左侧女性留着深色长发，身穿黑色上衣，身体略微背向镜头。右侧女性留着白金长发，身穿低胸黑色上衣，右手向上握着一支黑色手电筒。两人之间的下方前景中央有一个小型黑色金属台式风扇，可见圆形格栅。背景中，画面中央的一扇窄门半掩，通向几乎完全黑暗的空间。在那扇门的深处，站着一个恐怖的兔子电子玩偶剪影，它有着发光的眼睛、长长的竖耳、巨大的露齿笑容以及隐约可见的金属身体细节，在阴影中若隐现。办公室墙壁呈灰白色且陈旧，墙面横贯着黑白格纹条纹和一条细红线。左侧墙上贴着一张色彩鲜艳的“CELEBRATE!”海报，上面印有电子玩偶角色，旁边还钉着一张较小的角色绘画纸，桌面上立着一个黑色对讲机。门附近有一盏银色台灯。右侧墙上夹着 2 张纸，阴影中有一个灰色文件柜。门半开着，可以看到门把手。构图应呈现出一种派对抓拍瞬间转变为恐怖场景的感觉，前景主体由强烈的闪光灯照亮，背景则是深邃的黑色阴影，整体带有模拟噪点、低饱和色彩、令人不安的写实感，并将背景中央隐藏的怪物作为核心惊悚点。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883152454_20k1ov_HGcTZq7XAAAxxaA.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-434",
    title: "GPT IMAGE 2 中文提示词文档",
    category: "海报",
    industry: "通用",
    description: "一张简洁的截图风格图像，展示了一个深炭灰色圆角矩形面板，上面布满了密集的白色无衬线字体简体中文提示词，呈现为平坦深色背景上的文本文档或笔记。构图为一个带有充足留",
    prompt: `一张简洁的截图风格图像，展示了一个深炭灰色圆角矩形面板，上面布满了密集的白色无衬线字体简体中文提示词，呈现为平坦深色背景上的文本文档或笔记。构图为一个带有充足留白和细微阴影的单幅全屏面板，如同现代 UI 卡片。顶部是一句描述创作高端科技杂志双页跨页海报的句子，并附有英文标题：“GPT IMAGE 2: From Ideas to Images”。下方是多段左对齐的中文文本，行间距统一，描述了布局比例、现代编辑设计风格以及详细的双页构图。中间部分是一个包含 6 个项目的编号列表，标注为 1 到 6，每个项目均以引号括起的英文模块名称开头，后接中文解释。这 6 个模块名称分别为：“Photorealism”、“Readable Text”、“Product Mockup”、“Character Consistency”、“Storyboard” 和 “World Knowledge”。在第 2 项下方，包含 5 行独立的引号多语言文本作为子项，内容如下：“IDEAS → IMAGES”、“想法 → 图像”、“アイデア → 画像”、“아이디어 → 이미지” 以及 “فكرة → صورة”。在文本后段，添加一个明确指定主标题和副标题的部分，使用清晰易读的英文引号行：“GPT IMAGE 2” 和 “From Ideas to Images”。在下部区域，添加一行中文介绍右下角的小标题，后接精确的英文引号标题：“Typography • Photorealism • Layout • Consistency • Multilingual Text”。底部包含一段关于视觉风格要求的中文段落，例如高端广告质感、Apple 风格的产品摄影、瑞士平面设计、柔和自然光、精致材质、清晰布局、充足留白，并避免低质量纹理、模糊文字、乱码或手指变形。文本应清晰易读，具有逼真的屏幕截图保真度、高对比度、细微的抗锯齿边缘，不含插图、图标、照片，除单张深色卡片外不含多余的界面元素，整体呈现出精致的编辑科技风格。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776936820943_1tfxfj_HGg-fwGasAAz7HL.png",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-435",
    title: "Gear 5 黑板教室壁画",
    category: "海报",
    industry: "通用",
    description: "一张照片级真实的教室内部场景，画面中心是一块巨大的绿色黑板，上面绘有精美的《海贼王》中 Gear 5 蒙奇·D·路飞的粉笔壁画。画作占据了整个项目：采用动态的低",
    prompt: `一张照片级真实的教室内部场景，画面中心是一块巨大的绿色黑板，上面绘有精美的《海贼王》中 Gear 5 蒙奇·D·路飞的粉笔壁画。画作占据了整个项目：采用动态的低角度透视，一只巨大的脚伸向观众，双拳高举，狂野的卷曲白发，夸张的狂笑表情，圆睁的双眼，敞开的白色外套，露出布满伤痕的肌肉胸膛，穿着宽松的白色长裤，系着飘逸的紫色腰带。周围环绕着以写意粉笔笔触绘制的白色烟雾状光环。在黑板右侧，包含 2 个用粉笔书写的文字元素：1 个竖排日语短语“太陽の神”，以及右下角附近 1 个醒目的英文标签“GEAR 5”。粉笔画呈现出分层的白色、灰色、棕褐色和紫色粉笔质感，带有明显的涂抹痕迹、粉尘和手绘阴影。展示完整的黑板边框、粉笔槽，以及带有米色墙壁和黑板上方小型扬声器的真实教室环境。前景中放置一张布满粉笔灰的破旧木制教师办公桌，桌上清晰可见 5 件物品：1 个打开的彩色粉笔盒，3 支散落的粉笔，以及 1 个黑色长方形黑板擦。在粉笔槽左侧额外放置 2 个小黑板擦。柔和的自然室内光线，正面对称构图，高度细节化，呈现出带有震撼动漫黑板艺术的真实教室照片。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883095406_b15lzx_HGcdGUhWMAAoBpw.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-436",
    title: "Mirassol FC 球员签约官宣海报",
    category: "海报",
    industry: "通用",
    description: "创作一张 2:3 垂直构图的巴西足球俱乐部签约官宣海报，采用黄、深绿、黑、金配色，呈现出粗犷且高对比度的体育营销美学。主体是一位肌肉发达、有纹身的男性足球运动员",
    prompt: `创作一张 2:3 垂直构图的巴西足球俱乐部签约官宣海报，采用黄、深绿、黑、金配色，呈现出粗犷且高对比度的体育营销美学。主体是一位肌肉发达、有纹身的男性足球运动员，身穿明黄色的 Mirassol FC 主场球衣，以胸部以上的半身肖像居中展示，正面朝向镜头，表情严肃且具有威慑力。他留着寸头，颈部和手臂纹身清晰可见，体格健壮。球衣领口和袖口有深绿色镶边，胸前印有带有两颗星的 Mirassol 队徽，另一侧是 ATHLETA 标志，躯干处印有巨大的绿色赞助商文字“Poty”，肩部有品牌标识，袖口处有圆形赞助商补丁。在他身后，右上角放置一面飘扬的深绿色与黄色相间的 Mirassol 旗帜，旗帜上有巨大的俱乐部徽章和两颗星，背景为闪耀的球场灯光、烟雾缭绕的金色颗粒以及夜晚的球场观众席。在左侧，堆叠醒目的粗体压缩字体，葡语内容为：上方是“BEM-VINDO AO”，下方是超大的黄色“MIRASOL”，接着是分两行显示的球员姓名，巨大的白色字母“ALEX”和“POATAN”，下方配有手写风格的黄色签名“Poatan”。在此下方，添加一个 4 行大写白色文字的励志板块，最后一行用黄色高亮显示：“DE CAMPEÃO / NO OCTÓGONO / PARA GUERREIRO / EM CAMPO. / A LUTA CONTINUA.”。在右侧，添加一个垂直信息面板，包含 3 个图标加文字的特性，均为黄色并配有相应符号：目标图标配“FOCO”，拳头图标配“DISCIPLINA”，头盔图标配“GARRA”，下方是一个醒目的黄色标语：“AGORA É PELO LEÃO!”。在底部包含 2 张较小的辅助球员图像：左下角一张为亲吻球衣队徽的侧身姿势；中右下方一张为双臂高举、食指指天的背影。背影球衣上显示背部上方的赞助商文字“DS TECNOLOGIA AUTOMOTIVA”、姓名“POATAN”以及巨大的绿色数字“10”。底部添加一条黑金配色的横条，包含 4 个由图标分隔的价值观：狮子头图标配“MENTALIDADE DE CAMPEÃO”，盾牌图标配“FORÇA E HONRA”，星星图标配“HUMILDADE E TRABALHO”，足球图标配“PAIXÃO PELO JOGO”。下方放置一条黄色横幅，写有口号“NOVO DESAFIO. MESMA MISSÃO.”，最底部是一句手写的白色短语“FÉ, FOCO E FAMÍLIA!”，随后是标签“#POATANÉLEÃO”。运用电影级的轮廓光、强烈的对比度、金属质感的金色光芒、纹理烟雾以及高级的俱乐部官宣海报设计风格。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936901356_n9ox8c_HGiBDtrWIAAwWnL.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-437",
    title: "Neon Lip Balm 新品发布广告",
    category: "海报",
    industry: "通用",
    description: "创作一张光泽感强、色彩高度饱和的未来感美妆产品发布社交媒体广告海报，设计风格类似于 Canva 营销图。构图为一个居中的宽屏促销横幅，背景为青色到紫色的渐变，带",
    prompt: `创作一张光泽感强、色彩高度饱和的未来感美妆产品发布社交媒体广告海报，设计风格类似于 Canva 营销图。构图为一个居中的宽屏促销横幅，背景为青色到紫色的渐变，带有圆角和鲜艳的霓虹粉色调。横幅内展示一位年轻女性的半身像，背景是一个由同心粉色和白色光环组成的科幻发光隧道。她的脸部被一个柔和的方形模糊块遮挡，发型为两个小发髻，佩戴圆环耳环、多层链条项链，身穿金属银色上衣和虹彩粉色全息夹克。她向镜头伸出一只手，手中拿着一支透明润唇膏管靠近镜头，营造出强烈的近景透视感。管身标签写着“GLOW MODE Lip Balm”。顶部中央，醒目的霓虹大标题写着“GLOW MODE”，下方配有手写体副标题“Lip Balm”，再下方有一行小字写着“JUICY SHINE. HYDRATING CARE. ZERO STICKINESS.”。在左上角，添加一个手写风格的霓虹标签，写着“NEW!”。在右上角，放置一个橙色圆角贴纸，上面有白色文字“gpt-image-2”，下方配有一个小的橙色指针标签。在横幅右侧，包含 2 个圆形标注徽章：一个写着“ONLY $14.99”的粉色星爆徽章，以及一个写着“VIRAL ON TikTok 2M+ views”的黑色发光圆形徽章。在右下角，展示 2 个产品陈列元素：一支直立的开口润唇膏管及其涂抹棒，旁边放着一个完整的桃子和半个切开的芒果，配有绿叶，所有物品都放置在带有粉色光漩涡的光滑反射面上。在底部中央，添加 3 个带有标签的功能图标：一个标有“HYALURONIC HYDRATION”的水滴图标，一个标有“PEACH MANGO SCENT”的水果图标，以及一个标有“100% VEGAN & CRUELTY-FREE”的兔子图标。在横幅左下角，添加一列垂直堆叠的 3 个社交媒体按钮，包含平台图标和账号：TikTok 账号“#GlowMode”、Instagram 账号“@LunaBeatty”和 Snapchat 账号“@LunaGlow”。在它们下方放置一张发光的二维码卡片，旁边配有手写体文字“Shop Now!”以及指向二维码的箭头。在横幅外部左下角，放置一个倾斜的青色圆角标签，上面写着“Canva AI”，附近有一个小的青色纸飞机风格装饰。整体添加光泽反射、镜头光晕、辉光、霓虹轮廓光、闪光点和精致的广告设计风格，融合清晰的商业产品摄影与未来感图形设计。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883191124_4xodjr_HGc3RR0W0AEobzI.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-438",
    title: "“Doomscrolling” 编辑风格海报",
    category: "海报",
    industry: "通用",
    description: "一张在灰白色背景上的醒目黑白编辑风格反科技海报，设计灵感源自关于数字成瘾的现代野兽派杂志封面。构图采用垂直布局，强调排版，包含一个核心超现实图像和多个小段落文本",
    prompt: `一张在灰白色背景上的醒目黑白编辑风格反科技海报，设计灵感源自关于数字成瘾的现代野兽派杂志封面。构图采用垂直布局，强调排版，包含一个核心超现实图像和多个小段落文本。顶部中央，巨大的粗体压缩无衬线字体显示为“DOOM”，下方为“SCROLLING”，其中“SCROLLING”一词横跨页面，带有部分动态模糊或水平拖影效果。左上角有一段微型文本：“SCROLL. SWIPE. NOTHING CHANGES.”，上方有一条短横线。右上角的小字写着“24 / 7 / 365”，下方是“THE FEED NEVER ENDS”，底部配有一条水平分割线。在标题下方的左侧，添加一段小字编辑文本定义：“指在网上花费大量时间浏览负面或令人痛苦的内容，通常会导致焦虑、无助和疲劳感。”下方加入 2 条短水平分割线，然后是一个巨大的统计数字“67%”，后接较小的文字：“OF PEOPLE AGED 18–24 SAY THEY SCROLL MORE THAN THEY INTEND TO. — PEW RESEARCH, 2023”。再下方是一句声明：“MORE SCROLLING. LESS LIVING.”，底部配有分割线。海报中央底部竖立着一部光亮的黑色智能手机，正面朝向观众，可见底部的扬声器孔和充电接口。从手机屏幕中延伸出一个长长的、不可能存在的楼梯，向上退缩进入一个由重复的半透明垂直面板构成的狭窄隧道，营造出一种幽闭恐惧的走廊感。在隧道内，上半部分出现了一只巨大的灰度人眼，被雾气、垂直切片和重影遮蔽，仿佛被困在信息流中。中心图像应具有诡异、梦幻、压抑和电影感，并带有柔和的雾气、高对比度、复印颗粒感、微妙的动态模糊和分层透明效果。在中心图像的右侧，添加一个狭窄的垂直编号索引，包含 24 个可见条目：001, 002, 003, 004, 005, 007, 008, 009, 010, 011, 012, 013, 014, 015, 017, 018, 019, 020, 021, 022, 024, 025, 026 以及一个省略号，下方配有一个细长的向下箭头。在右侧栏，添加一个标题为“DESIGNED TO KEEP YOU HOOKED.”的文本块，后接 4 行短句：“Infinite feeds. Unpredicted rewards. Endless comparison. It’s not a glitch— it’s the business model.”。下方放置一个简单的眼睛/地球图标，然后是一个黑色矩形框，内含信息：“AWARENESS IS THE FIRST STEP: PUT THE PHONE DOWN. LOOK UP. RECLAIM YOUR TIME.”。在左下角，放置一个巨大的被裁剪的黑色单词片段“END”，旁边是另一句堆叠的声明：“THE MORE YOU SCROLL, THE LESS YOU LIVE.”。在左侧边缘附近添加微小的垂直微型文本以增加编辑质感。在底部页脚处，放置 4 组图标/文本：一个地球图标、一个眼睛图标、一个小型警告文本块“WARNING: EXCESSIVE SCREEN TIME CAN IMPACT YOUR MENTAL HEALTH, SLEEP, AND PRODUCTIVITY.”、一个展开图标、一个条形码，以及最右侧的一句声明“STAY PRESENT. LIVE IN REAL LIFE.”。采用极简主义的瑞士网格对齐、充裕的负空间、锐利的黑色排版、微妙的做旧印刷纹理和高级时装海报美学。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022591998_5qvlrq_HGnIcbXWkAAo4a6.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-439",
    title: "中国书法诗意山水",
    category: "海报",
    industry: "通用",
    description: "一幅传统的中国水墨挂轴风格画作，绘制于暖米色宣纸上，采用竖构图，上方及右侧中部为大字黑墨书法，左下方及底部为诗意山水插画。书法必须清晰、易读，采用富有表现力的行",
    prompt: `一幅传统的中国水墨挂轴风格画作，绘制于暖米色宣纸上，采用竖构图，上方及右侧中部为大字黑墨书法，左下方及底部为诗意山水插画。书法必须清晰、易读，采用富有表现力的行书笔触，分为 6 列竖排，从右向左阅读。6 列的具体文字为：“金樽清酒斗十千 玉盘珍羞直万钱”、“停杯投箸不能食 拔剑四顾心茫然”、“欲渡黄河冰塞川 将登太行雪满山”、“闲来垂钓碧溪上 忽复乘舟梦日边”、“行路难 行路难 多歧路 今安在”、“长风破浪会有时 直挂云帆济沧海”。在主诗左侧添加较小的竖排落款“李白行路难”，并在落款下方加盖 1 枚红色方形印章。在山水场景中，描绘 1 位身着淡色长袍、束发髻并带有飘带的中国古代文人墨客，伫立在左下方的崎岖悬崖边缘，正抬头向远方凝望，神情沉思。在下方及整个下半部分，描绘波涛汹涌的河流或大海，伴有白浪与泡沫，远处是隐没在雾气中的水墨山峦，悬崖边缘点缀着稀疏的草木，整体笼罩在柔和的雾气中。使用黑灰水墨，并在水面和长袍阴影处加入极其克制的暗蓝灰色渲染。整体氛围豪迈、忧郁且富有文学气息，展现出古典中国山水画与博物馆级书法作品的质感，并在文字与景观周围保留了适度的留白。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883107223_t4xh19_HGa7PASbAAA6iJj.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-440",
    title: "中国手机市场分屏对比",
    category: "海报",
    industry: "通用",
    description: "{\"type\":\"分屏市场对比海报\",\"style\":\"写实纪录片摄影风格\",\"subject\":\"中国繁忙的室内电子维修与手机配件市场\",\"layout\":{",
    prompt: `{"type":"分屏市场对比海报","style":"写实纪录片摄影风格","subject":"中国繁忙的室内电子维修与手机配件市场","layout":{"format":"带有 2 个堆叠对比面板的竖版海报","divider":"面板之间细长的白色水平分隔线","side_borders":"左右边缘带有均匀间隔白色穿孔矩形的黑色胶片风格边框","panels":[{"position":"上半部分","overlay_text":"GPT-image-2","scene":"狭窄的荧光灯购物走廊，两侧排列着玻璃展示柜和密集的中文店铺招牌","crowd_count":"约 12 名可见的顾客和摊主","primary_action":"顾客俯身在柜台前，技术人员正在维修手机并销售零件","details":["一名身穿紫色 Polo 衫的技术人员坐在左前方柜台焊接","一名身穿白色 Polo 衫的高个子顾客俯身在中央玻璃柜前","他旁边还有一位身穿绿色条纹衬衫的顾客","一名身穿浅灰色 T 恤的男子站在右前方，背对镜头","玻璃柜台内摆满了智能手机屏幕、工具、备件和小型电子产品","头顶上方有红、蓝、黄、白色的招牌，写着屏幕更换、手机配件和维修等中文信息","走廊视角深远，有许多小摊位和天花板长条灯"],"text_style":"居中于场景上方的大号粗体白色无衬线文字"},{"position":"下半部分","overlay_text":"Nano Banana 2","scene":"另一个拥挤的室内手机市场通道，光线更亮且更杂乱，有开放式维修摊位和挂满手机与零件的墙壁","crowd_count":"约 11 名可见的顾客和摊主","primary_action":"技术人员在柜台工作，顾客在旁浏览和交谈","details":["右前方技术人员坐在玻璃柜台后，身穿深色衣服并戴着白手套，正在用摊开的工具维修设备","中间背着背包的顾客俯身在明亮的展示柜前","中右侧另一位摊主正拿着手机贴在耳边","左侧通道挤满了提着塑料袋走动的顾客","玻璃展柜陈列着旧手机、屏幕、电池和配件","店铺墙壁上密密麻麻地挂着手机和包装好的组件","头顶上方有许多明亮的中文招牌，颜色为黄、红、蓝、白，广告内容涵盖批发、零售、手机配件、芯片维修和数据恢复"],"text_style":"放置在面板中右上方的大号粗体白色无衬线文字"}]},"camera":{"angle":"平视角度","lens":"广角纪录片街拍镜头","composition":"深邃的走廊视角，柜台和天花板灯光形成了强烈的引导线"},"lighting":"冷色调荧光室内照明，略显刺眼的商业卖场灯光","mood":"繁忙、拥挤、务实、真实的科技市场氛围","quality":"高细节写实摄影，自然色彩，清晰的店面招牌，反光的玻璃柜台"}`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022563352_4xrpdp_HGlqGIGaYAAdITO.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-441",
    title: "中式书法暗黑奇幻海报",
    category: "海报",
    industry: "通用",
    description: "一张暗黑风格的电影感中式水墨奇幻插画，画面中心为一个巨大的黑色书法汉字“安”，以粗犷有力的笔触书写在背景中如发光满月般的白色圆盘之上。在画面右下方前景处，展示 ",
    prompt: `一张暗黑风格的电影感中式水墨奇幻插画，画面中心为一个巨大的黑色书法汉字“安”，以粗犷有力的笔触书写在背景中如发光满月般的白色圆盘之上。在画面右下方前景处，展示 1 位侧身向左的东亚武士学者形象，留着凌乱的发髻，发丝在风中飘散，身穿的长袍破碎成烟雾与墨迹。人物神情庄重、如幽灵般充满戏剧性，伫立在风暴迷雾与翻滚的黑色水墨云层中。色调以炭黑、灰烬灰和冷白色为主，仅点缀极少量的深红色。画面包含 4 座可见的宝塔：右侧远处有 2 座小宝塔，左下方一块巨大的破碎镜片中倒映出 1 座宝塔，右上方雾气中隐现 1 座更高的宝塔。构图周围环绕着 5 块醒目的破碎玻璃或镜面碎片：左下方 1 块巨大的三角形碎片，上方中心附近 1 块高耸的碎片，右上方 1 块巨大的垂直碎片，其下方 1 块悬挂的小碎片，以及右下方 1 块巨大的弧形碎片，另有少量细小残片。在左侧的一块碎片中，包含一张人脸的局部倒影。在巨大书法字下方的左侧，添加 1 枚带有汉字的红色印章。运用泼墨纹理、撕裂的纸张边缘、滴落的红色痕迹以及层叠的烟雾，营造出诡异的武侠恐怖氛围。高对比度光影，绘画混合媒介风格，质感笔触，海报式构图，超高细节，氛围感强，神秘且优雅。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022559766_jbiaxg_HGjmDrubkAAae_d.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-442",
    title: "乘法多米诺骨牌课堂活动",
    category: "海报",
    industry: "通用",
    description: "一张写实的纪录片风格照片，拍摄的是小学课堂进行数学活动时的场景。约 10 名身穿蓝绿色校服的孩子围坐在拼凑的木桌旁，正积极地玩着色彩鲜艳的乘法多米诺骨牌游戏。相",
    prompt: `一张写实的纪录片风格照片，拍摄的是小学课堂进行数学活动时的场景。约 10 名身穿蓝绿色校服的孩子围坐在拼凑的木桌旁，正积极地玩着色彩鲜艳的乘法多米诺骨牌游戏。相机处于儿童视线高度，略微向下倾斜对准前景的主桌。场景中心是一个方形的教育项目，上面用葡萄牙语标注，下边缘印有标题“DOMINÓ DA MULTIPLICAÇÃO”，中心印有“TREINANDO AS TABUADAS”，周围环绕着色彩鲜艳的多米诺骨牌式乘法块。画面中 4 名孩子正全神贯注地围绕着这个主项目：一名孩子正在将一块黄色牌放入项目中，一名孩子拿着一叠彩色牌，一名孩子在左侧观看，另一名穿着蓝色袖子的孩子在底边缘整理牌。包含 2 个贴有“JOGO DE DOMINÓ”标签的浅色木盒，一个位于中左侧，另一个位于右下角，盒内装有彩色长方形多米诺骨牌。课桌上自然地散落着学习用品：3 支铅笔、2 张练习纸、1 个水瓶、铅笔盒、笔记本和额外的游戏牌。背景中，教室的其他部分处于柔和的虚焦状态，可以看到其他学生坐在课桌旁、书架、贴满儿童画的软木板，以及左侧墙上挂着一张写有“TABUADA DE MULTIPLICAÇÃO”的大型乘法表海报。明亮的自然光从右侧的高窗射入，为房间营造出温暖、生动、真实的校园氛围。教育项目和牌应使用黄色、蓝色、粉色、绿色和橙色等鲜艳的课堂色彩。人物面部应模糊处理或弱化，重点在于动手学习、协作以及乘法多米诺骨牌活动。竖构图，高度写实的摄影作品，真实的课堂瞬间，前景细节清晰，背景具有柔和的景深。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883177007_sj2vzk_HGdgMWqXsAEr874.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-443",
    title: "伪造 Apple CEO 任命海报",
    category: "海报",
    industry: "通用",
    description: "一张极简、照片级真实的 Apple 广告风格科技公告海报，采用 4:5 竖构图，背景为深海军蓝向地平线渐变的黄昏至夜晚天空。前景居中放置一位中年东亚男性的上半身",
    prompt: `一张极简、照片级真实的 Apple 广告风格科技公告海报，采用 4:5 竖构图，背景为深海军蓝向地平线渐变的黄昏至夜晚天空。前景居中放置一位中年东亚男性的上半身，身穿黑色极简衬衫内搭黑色打底衫，以冷静的行政姿态自信地站在 Apple Park 的弧形玻璃建筑前。他面部主要朝向前方并略微偏转，留着黑色短发，佩戴细框深色眼镜，呈现出严肃的企业肖像风格。在他右后方，放置一个巨大的白色发光 Apple Logo 悬浮在空中。在顶部正中央，包含一个小巧的白色 Apple Logo，下方配有精致纤细的无衬线字体中文标语：“Apple 新篇章 由此开启”。在右上角，添加醒目的红色大号中文文本：“AI 生成”。在中上部区域，放置巨大的白色粗体中文标题：“罗永浩 接任 Apple CEO”。在其正下方，添加一行字间距拉开的白色中文口号：“用 工 匠 精 神 ， 让 世 界 再 次 惊 叹”。在中左侧区域，添加一个深色文本引语块，配有超大号的左引号，内容为：“我不是来改变 Apple， 而是让 Apple 重拾改变世界的勇气。”下方附带手写风格签名“罗永浩”。在中下部横向覆盖一个半透明的深色功能栏，包含 4 列带有细白线图标的图文内容：1) 锤子图标，标题“工匠精神”，副标题“极致产品主义”；2) 气泡图标，标题“用户至上”，副标题“体验细节控”；3) 灯泡图标，标题“创新驱动”，副标题“重新定义未来”；4) 爱心轮廓图标，标题“真诚沟通”，副标题“打造人的科技”。在底部正中央，添加白色大号英文文本：“Think Different. Think Again.”，下方配有较小的中文文本：“现在，交给罗永浩。”并在下方再次附上手写签名。采用高端科技发布会海报美学，电影级柔光，建筑上的光泽反射，高对比度，简洁的排版，优质的 Apple 风格品牌视觉，精致的商业写实感。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022545218_yimqeq_HGjrkz-a4AA7FxT.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-444",
    title: "像素风巨龙城堡",
    category: "海报",
    industry: "通用",
    description: "一幅细节丰富的复古奇幻像素艺术场景，描绘了一座巨大的中世纪石砌城堡坐落在陡峭的岩石山上，采用微仰视角，一条蜿蜒的土路通向大门。城堡拥有许多圆柱形塔楼和连接墙，清",
    prompt: `一幅细节丰富的复古奇幻像素艺术场景，描绘了一座巨大的中世纪石砌城堡坐落在陡峭的岩石山上，采用微仰视角，一条蜿蜒的土路通向大门。城堡拥有许多圆柱形塔楼和连接墙，清晰可见 9 座带有红橙色圆锥形屋顶的塔楼，最高的尖塔上飘扬着几面红色小旗，墙体呈现出风化的灰色石材纹理。一条巨大的红龙盘绕在最高的中央塔楼上，长长的身体缠绕着石墙，利爪紧扣城垛，长角的头部向前方探出，右侧展开一只巨大的蝙蝠状翅膀。山丘周围环绕着茂密的深绿色松树和岩石露头，地平线上可见远处的蓝色山脉。城堡背景为明亮的日间天空，呈现饱和的蓝色，点缀着大朵蓬松的白色积云。采用经典的 16 位像素艺术风格渲染，具有清晰的精灵图形状、可见的像素纹理、丰富的对比度、冒险类奇幻游戏封面构图、居中主体以及方形画幅。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022549168_bl11xp_HGmNsQrWwAADruI.png",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-445",
    title: "僵尸生存 RPG 动漫风格广告海报",
    category: "海报",
    industry: "通用",
    description: "创作一张戏剧性的日式僵尸生存 RPG 手机游戏广告海报，采用动漫与电影相结合的风格。垂直智能手机海报布局，高密度宣传设计，背景为黄昏时分残酷的城市末日，包含废弃",
    prompt: `创作一张戏剧性的日式僵尸生存 RPG 手机游戏广告海报，采用动漫与电影相结合的风格。垂直智能手机海报布局，高密度宣传设计，背景为黄昏时分残酷的城市末日，包含废弃的街道、烟雾、火花、碎片、受损的建筑物、霓虹灯，以及从后方逼近的僵尸群。画面中央，一位年轻的动漫女性坐在地上，姿势略显慵懒，双腿弯曲，一只手垂直握着一把黑色手枪。她留着齐肩的深棕色至黑色直发，皮肤苍白，穿着一件沾满血迹的超大号脏白色 T 恤。T 恤上垂直印有醒目的日文书法：“働きたくね〜”。她的表情区域处理得简洁且不突兀，以确保构图重点突出 T 恤、武器和氛围。在她周围，多名身穿破烂衣服的僵尸从左右背景中伸出双手向前抓取。

采用具有冲击力的游戏主视觉设计，包含 8 个清晰划分的宣传区域。区域 1：左上角游戏 Logo 区，包含 3 个文本元素，带有巨大的做旧英文标题“Dead or work”、较小的日文副标题“ゾンビサバイバルRPG”，以及带有白色和红色文字的厚重黑色喷溅背景。区域 2：右侧垂直标语区，包含 2 个文本元素，在粗糙的黑色笔触条上，上方为白色日文“動かない、ただ”，下方为巨大的红色垂直文字“生き残れ。”。区域 3：左中功能列表面板，包含 4 行功能，每行都有一个黑色方块内的白色图标和黄色/白色日文文案；标签分别为“ゾンビを倒して生き延びろ”、“拠点を強化・カスタマイズ”、“仲間と協力プレイ”和“デイリーミッションで報酬GET”。区域 4：右中奖励活动面板，包含 1 个标题和 3 个奖励项目；标题位于明亮的锯齿状黄色爆炸框中，写着“今すぐ始めると 豪華特典プレゼント!”，下方是三个标注为“ゴールド ×5000”、“レア武器 (7日間)”和“サバイバルキット ×10”的物品框。区域 5：中下部游戏截图条，包含 4 个带有说明文字的缩略图；说明文字分别为“リアルタイムバトル!”、“基地を自由にカスタム!”、“仲間とレイドボスに挑め!”和“広大なオープンワールド!”。区域 6：底部行动呼吁横幅，包含 2 个文本元素，带有巨大的黄色和红色日文短语“今すぐダウンロード!”以及较小的白色/红色副标题“あなたの選択が、生死を分ける。”。区域 7：右下角商店徽章，包含 2 个徽章，显示 App Store 和 Google Play 风格的下载按钮。区域 8：右下角 QR 码区域，包含 1 个白色方块内的 QR 码。

整体美学：超精细、高对比度、肮脏、强烈、商业化精良的抽卡/手机游戏广告，将动漫角色艺术与写实的僵尸恐怖背景相结合。使用醒目的做旧字体、黑色笔触纹理、红色警示色、黄色宣传高光、金属 UI 边框以及电影般的橙灰色光影。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883136139_63cmmy_HGaXieDb0AACq8Z.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-446",
    title: "动漫女主角宣传海报",
    category: "海报",
    industry: "通用",
    description: "一张精致的动漫风格竖版主视觉海报，展现未来奇幻动作系列。构图中心为一位全身年轻女主角，她以自信的三分之四背影姿态回眸，面部因角度和发丝略微遮挡。她拥有随风飘逸的",
    prompt: `一张精致的动漫风格竖版主视觉海报，展现未来奇幻动作系列。构图中心为一位全身年轻女主角，她以自信的三分之四背影姿态回眸，面部因角度和发丝略微遮挡。她拥有随风飘逸的长银白发，肤色白皙，带有冷色调的紫色点缀。身着黑、白、紫三色相间的干练战斗服：黑色短款夹克搭配白色兜帽及披风式层叠后摆，修身胸衣，短百褶裙，配有战术腰带和绑带，黑色手套，单腿大腿绑带，并有精致的星形徽章细节。右手持一把巨大的多边形科幻长剑，剑身带有发光的紫色能量线。背景为明亮的蓝色白昼天空，点缀着柔和的云朵和几只白鸟，远景是一座由高耸大教堂式尖塔和桥梁构成的优雅白色城市，营造出宏伟的乌托邦式未来王国氛围。头发、丝带、衣摆和布料需体现强烈的风感。采用流畅的线条和色彩，干净的动漫渲染，高细节赛璐珞阴影，清脆的灯光，光泽感高光，呈现出高级游戏宣传插画的质感。

设计为完整的日式宣传海报布局。左上角放置醒目的竖排日文大标题“未来を、自分の手で。”，中间短语为紫色，其余为黑色，背景衬托淡色装饰徽章。下方添加较小的日文简介。右侧放置一个深色竖向侧边栏，内含白色日文文字“信じてる。だから、私が道を切り開く。”。左下角堆叠 3 张倾斜的矩形插图：1 张女主角面部特写，1 张她挥舞发光长剑的动作镜头，以及 1 张城市全景图。在下方的深色角色信息面板中，显示角色名“ルシア”及其罗马音“Lucia”和一个小徽章，随后是 7 行日文个人资料：“CV：悠木 碧”、“年齢：17歳”、“所属：黎明騎士団（不屈の翼）”、“武器：双刃剣（レプリカント）”、“誕生日：4月12日”、“身長：165cm”、“好きなもの：静かな場所、星空”，以及最后一行不喜欢的物品。底部中央放置大型系列 Logo 文字“黎明のリベリオン”，下方附带英文副标题“REIMEI NO REBELLION”，再下方为发布日期“2025年、始動。”。配色方案：白色、黑色、深靛色、电紫色和天蓝色。整体氛围：英雄气概、优雅、充满抱负，呈现出高级动漫游戏或轻小说的宣传海报感。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776936912476_dvdrmw_HGhSncSaIAA2Y-u.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-447",
    title: "动漫武士游戏广告海报",
    category: "海报",
    industry: "通用",
    description: "创作一张具有高冲击力的竖版手游广告海报，采用光泽感动漫动作风格，呈现极具戏剧性的赛博武士幻想美学，以及紧凑、高级的抽卡 RPG 推广构图。主画面展示了 2 名年",
    prompt: `创作一张具有高冲击力的竖版手游广告海报，采用光泽感动漫动作风格，呈现极具戏剧性的赛博武士幻想美学，以及紧凑、高级的抽卡 RPG 推广构图。主画面展示了 2 名年轻男性战士，他们身穿现代黑色商务西装，在前景中呈进攻姿态蹲伏，每人都在向观众拔出武士刀。两人均留着时尚的金发，五官轮廓分明、英俊帅气，身穿白色衬衫，系着蓝色领带，动作姿势充满张力，近大远小的手部和剑身占据了下方前景。其中一把剑的护手附近系着一条蓝色丝带。在他们身后居中位置，放置 1 个巨大的装甲机甲武士，它拥有华丽的金色犄角、层叠的金属蓝黑色盔甲、发光的蓝色眼睛，背部横跨着一把收鞘的剑，宛如守护神一般。背景采用生动的霓虹城市和能量爆发效果，主色调为电光蓝、紫罗兰、洋红色和金色，并辅以光束、火花、花瓣、斩击特效和水墨爆炸纹理。在右上角添加 1 个竖向黑色笔触横幅，上面用醒目的白色日文写着「この刃で、未来を斬り拓け。」。在中下部区域，放置 1 个巨大的金色日文书法标题，带有厚重的笔触质感和黑色阴影，写着「切り捨て御免」，几乎横跨整个画面宽度。在左下角，嵌入 1 个带有金色边框的游戏截图面板，展示了红色日本寺庙庭院前的夜战场景，1 名可操作的剑客正在战斗，周围有多个敌人，漂浮的伤害数字包括 5324、5329 和 6132，左侧设有虚拟摇杆，底部及侧边共排列 5 个角色头像，右侧有 3 个圆形技能按钮，顶部 HUD 显示计时器约为 01:28 和 WAVE 3/3。在右下角，放置 1 个巨大的黑白二维码，置于白色方框内。在其下方和侧面，添加带有蓝色描边的白色粗体日文「今すぐダウンロード」。在最底部，包含 2 个官方风格的应用商店徽标：左侧为 App Store，右侧为 Google Play。整体外观：超精细、精致的关键视觉图、动态视角、金属高光、锐利的赛璐珞动漫渲染、高级手游营销海报、强烈的动作能量、电影级光影以及层级丰富的重 UI 推广布局。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883096402_i965t8_HGf3Kb8boAANLXs.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-448",
    title: "古代学者 AI 安全海报",
    category: "海报",
    industry: "通用",
    description: "一张精致的棕褐色调插画，风格融合了中国古代学者肖像与现代 AI 品牌元素，呈现于带有明显纹理和水墨质感的陈旧羊皮纸上。画面中央是一位受德谟克利特启发的卷发男性学",
    prompt: `一张精致的棕褐色调插画，风格融合了中国古代学者肖像与现代 AI 品牌元素，呈现于带有明显纹理和水墨质感的陈旧羊皮纸上。画面中央是一位受德谟克利特启发的卷发男性学者半身像，他坐在木桌后，身着层次分明的传统长袍，色调为柔和的蓝灰色与棕色，并带有精致的镶边。他的面部被一块棕色皮肤色调的扁平矩形遮挡，营造出一种匿名或被审查的视觉效果。他右手垂直握着一支毛笔，左手平放在桌面上。在画面中上部偏右处，放置 Claude 标志，包含一个铁锈橙色的太阳光芒徽章，以及深色衬线字体的“Claude”字样。在左上角，添加一个巨大的竖排中文标题“德米斯图”，旁边配有一列较小的竖排中文书法文字：“以语言为媒，理解为舟，助人洞见，推动协作，造福人类，安全可信，通往更美好的未来。”在最左侧添加一行较小的竖排落款“甲辰春写”，下方盖有两枚红色印章。背景展示了一幅中国古典山水画，包含远山、悬崖上的小亭、云雾，右上角和右侧边缘由茂密的竹叶点缀，左下角则有深色的松枝。

木桌占据了画面的下三分之一，桌上摆放着 8 组不同的物品：左侧有一个插着 4 支毛笔的笔筒，一叠 4 本装订成册的书籍，书脊上分别写着“人工智能概论”、“机器学习原理”、“负责任的 AI”和“对齐与价值观”，左中位置有一个砚台或墨碟，中央有一张羊皮纸图表，左下角有一个刻有汉字的小型深色方块印章，右侧有一个带框的告示牌，右下角有一个卷轴，桌面表面呈现出清晰的木纹。中央的羊皮纸图表应显示一个标有“AI 安全 Safety”的圆形节点，连接着周围 6 个分别标有“准确”、“可靠”、“有益”、“透明”、“对齐”和“隐私”的节点，图表周围环绕着精致的云纹。右侧的带框告示牌应以“AI 安全原则”为标题，并列出 4 条中文要点：“减少灾难性风险”、“尊重人类价值观”、“确保系统可控”和“促进长远福祉”。右下角的卷轴应展示“以谨慎之心 创造未来”字样。

采用均衡的构图、学者般沉静的氛围、高度精细的墨线、微妙的水彩渲染、古董博物馆印刷美学，以及由羊皮纸棕褐色、墨棕色、褪色蓝和柔和炭灰色组成的克制色调。整体感觉应是一张融合了东亚古典文人画、哲学肖像画和当代 AI 安全主题的知识性致敬海报。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883165117_xkvvb8_HGb81W3XIAAP-fG.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-449",
    title: "可爱粉色小猫逃脱游戏广告",
    category: "海报",
    industry: "通用",
    description: "一张梦幻粉彩风格的日式手机游戏宣传海报，采用竖版智能手机尺寸，卡哇伊幻想风格，超萌且具有光泽感。主体是一只毛茸茸的白色幼猫，有着巨大的闪烁紫蓝色眼睛、脸颊上带着",
    prompt: `一张梦幻粉彩风格的日式手机游戏宣传海报，采用竖版智能手机尺寸，卡哇伊幻想风格，超萌且具有光泽感。主体是一只毛茸茸的白色幼猫，有着巨大的闪烁紫蓝色眼睛、脸颊上带着淡淡的红晕、粉色的小鼻子和顽皮的微笑，它躺在前景的粉色坐垫或毯子上，爪子里抱着一个奶瓶。小猫极其蓬松圆润，毛发柔软发光，有着毛绒玩具般的质感，在温暖的魔法光影下显得格外可爱。整个场景充满了粉色爱心、闪光、蕾丝细节、柔和的虚化效果和糖果色装饰，营造出一种治愈又俏皮的氛围。背景是一个粉彩色的卧室或育婴室，架子上整齐地摆放着 3 个毛绒玩具：一只粉色兔子、一只薄荷蓝猫和一只薰衣草紫熊。添加半透明的漂浮肥皂泡，泡泡内有白色骨头形状的图标，以及小巧的装饰挂件、丝带和花卉装饰。左侧有醒目的垂直日文标题，采用光泽感的泡泡字体，写着「脱出できない」，旁边配有较小的垂直文字「かわいくて、」，均为亮粉色，带有白色光晕和粗轮廓。顶部是一个白色蕾丝边缘的圆形徽章，内含日文「もふもふ にゃんこと おへやから脱出？」，下方有一个粉色的猫爪印图标。底部放置一个装饰性的游戏 Logo，采用圆润的日文大字「もふふミルクと にゃんこ」，下方配有丝带横幅写着「脱出ゲーム」，配色采用粉蓝、奶油色和粉色，带有闪亮的轮廓风格。左下角添加一个圆润的小文本框，写着「癒されるのに、意外とむずかしい…!?」，并装饰有小花和悬挂的奶瓶挂件。采用精致的独立游戏宣传主视觉风格，细节丰富，柔和的喷绘插画，光泽感的排版，迷人、舒适且令人无法抗拒的可爱。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1777022577305_ho3yh7_HGmC2hNboAEnAgs.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-450",
    title: "史诗级剪影世界海报",
    category: "海报",
    industry: "通用",
    description: "收藏版史诗海报，在人物侧影中呈现出完整的世界观与经典场景。整体风格融合了电影海报与梦幻水彩插画，静谧、宏大、神圣且充满怀旧感，带有纸张纹理、轻雾、笔触以及优雅的",
    prompt: `收藏版史诗海报，在人物侧影中呈现出完整的世界观与经典场景。整体风格融合了电影海报与梦幻水彩插画，静谧、宏大、神圣且充满怀旧感，带有纸张纹理、轻雾、笔触以及优雅的留白。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776661922710_mtqm9m_HGQnK_9bwAAfq8d.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-451",
    title: "史诗级北欧天空战士与水晶神兽",
    category: "海报",
    industry: "通用",
    description: "一张极具动感的竖版高奇幻动漫插画，展现了 4 位英雄角色悬浮在充满发光云层、蓝色水晶碎片和漂浮青色羽毛的暴风雨天空中。画面中心，一位灵感源自北欧神祇的高大男性装",
    prompt: `一张极具动感的竖版高奇幻动漫插画，展现了 4 位英雄角色悬浮在充满发光云层、蓝色水晶碎片和漂浮青色羽毛的暴风雨天空中。画面中心，一位灵感源自北欧神祇的高大男性装甲战士作为核心焦点，他留着棕色长发，头戴金青色尖角头盔，深绿色与蓝色的披风在风中飘扬，身着华丽的黑、青、金三色铠甲，胸口敞开露出肌肉，胸前有一个发光的亮青色狼形纹章。他一只手向上举向头顶上方发光的圆形魔法符文，另一只手握着一把长矛，矛头为蓝色水晶材质。在他周围，有 3 只狐狸与狼形态的伙伴生物，身着配套的冰晶铠甲。画面下方前景处，1 只巨大的凶猛橙色狼正张嘴咆哮着冲向观众，巨大的爪子伸出，拥有白色鬃毛、蓝色水晶头盔、背部和腿部的蓝金装甲板，以及一条巨大的蓬松尾巴。左上方，1 只矫健的橙色狐狸战士正身穿棱角分明的蓝色水晶铠甲，背负巨大的多面蓝色翅膀在半空中向前跃起，姿态如同快速的空中突击者。右侧，1 只可爱的小型 Q 版狐狸伙伴正快乐地漂浮着，有着大大的蓝眼睛、灿烂的笑容，身穿带有发光青色纹路的蓝色短袍，头戴水晶王冠。使用鲜艳饱和的色彩，特别是电光青、蓝宝石色、青色、金色和橙色。氛围史诗、神圣且充满魔法感，具有强烈的动感线条、戏剧性的透视缩短、发光高光、细腻的毛发与羽毛质感、精致的水晶纹理，以及电影级奇幻集换式卡牌插画的品质。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936896791_kuuuge_HGfmTgwXoAA_Mks.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-452",
    title: "史诗级湿婆坦达瓦火之舞",
    category: "海报",
    industry: "通用",
    description: "一幅宏大的神话奇幻画作，描绘了湿婆神在神圣火场中心表演坦达瓦之舞。全身动态舞姿，一腿抬起，另一只脚踩在身下倒地的身影上。湿婆拥有灰蓝色的皮肤、强健的肌肉线条，长",
    prompt: `一幅宏大的神话奇幻画作，描绘了湿婆神在神圣火场中心表演坦达瓦之舞。全身动态舞姿，一腿抬起，另一只脚踩在身下倒地的身影上。湿婆拥有灰蓝色的皮肤、强健的肌肉线条，长而狂野的深色头发向四周炸开，头顶扎着高高的发髻，发间别着一弯白色新月。他的表情庄严而神圣。一条眼镜蛇盘绕在他的颈部，他佩戴着多串鲁德拉沙珠项链、手镯、臂环、巨大的圆形耳环以及神圣的饰品。他身着虎皮缠腰布，红橙色的布带在空中剧烈飘动。一只抬起的手拿着一个小达玛鲁鼓，前侧的一只手做出祝福姿势，手掌上可见“唵”字符号，另一只手在张开的掌心上方幻化出一团明亮的火焰。他脑后是一个巨大的发光圆形光环，上面刻满了梵文咒语，营造出光芒四射的曼陀罗效果。背景是末日般的喜马拉雅寺庙景观，伴有乌云、烟雾、余烬、岩石山脉、瀑布，以及左右两侧古老的石制神龛和寺庙塔楼。场景左侧矗立着一把缠绕着红布的三叉戟。湿婆周围环绕着整整 10 位信徒和苦行僧，分布在两侧，他们正在虔诚地吟唱、跪拜、举起双臂、手持火炬并敲击鼓点。湿婆身下是 1 位倒在石地上的深色皮肤男性身影。地面开裂且熔岩翻滚，一圈炽热的熔岩和火焰环绕着舞蹈平台。采用戏剧性的电影级布光，深邃的炭黑色阴影与明亮的橙色火光形成对比，展现高度精细的解剖结构、复杂的珠宝与纹理、飞扬的头发与织物动态、虔诚的史诗奇幻写实风格、油画般的笔触、对称的中心构图，超高细节，高对比度，竖版海报格式。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022588631_o32jcx_HGlE1HjagAATL1M.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-453",
    title: "团队绘制日本主题插画",
    category: "海报",
    industry: "通用",
    description: "一幅简洁的编辑风格插画，背景为浅灰白色，展示了 11 名年轻人聚集在地面上一张巨大的纸张周围，协作绘制一幅精美的日本旅行场景。构图采用俯视视角，以画作为中心，人",
    prompt: `一幅简洁的编辑风格插画，背景为浅灰白色，展示了 11 名年轻人聚集在地面上一张巨大的纸张周围，协作绘制一幅精美的日本旅行场景。构图采用俯视视角，以画作为中心，人物围成一个松散的圆环。采用简单的手绘卡通风格，线条纤细，色彩柔和低调，阴影极少，呈现出友好且现代的杂志美学。纸上的中心画作包含 8 个独特的风景元素：背景中央是白雪皑皑的富士山，山体右上方有一轮红日，几朵白云，左上方有深色树枝上的粉色樱花，右侧有一座红色多层宝塔，中右侧有高耸的城市天际线和塔楼，一个带有小船的蓝色湖泊，以及一列流线型白色子弹头列车在右下方蜿蜒而过。画面中点缀着树木和灌木，下方中部还有一座小拱桥。这 11 人穿着各式休闲服装，手里拿着马克笔或蜡笔，通过倚靠、跪姿或趴在纸张周围进行创作。顶部边缘分布 6 人，左侧 3 人，右下方 2 人。他们的服装各异：卫衣、夹克、针织帽、格子衬衫、图案毛衣、蓝色 T 恤、黑色 T 恤，以及一名身穿红色开衫搭配深色衣服的人。右侧一人戴着眼镜，身穿红色开衫；右下方一人留着深色卷发，戴着圆框眼镜，身穿黑色 T 恤，趴在地上绘画。纸张底部边缘散落着几支蓝色和深色的蜡笔。整体氛围保持协作、创意且充满趣味，以那张巨大的插画海报为视觉焦点。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022546117_tvf1ss_HGj4wk0bUAA_2Ba.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-454",
    title: "基于角色设定图的 VTuber 出道宣传海报",
    category: "海报",
    industry: "通用",
    description: "以提供的参考图作为角色和设计基础，将简洁的 Live2D 模型设定图转化为精致的 VTuber 出道官宣海报，同时保留原有的角色设计、连帽衫、耳机、项圈、星星与",
    prompt: `以提供的参考图作为角色和设计基础，将简洁的 Live2D 模型设定图转化为精致的 VTuber 出道官宣海报，同时保留原有的角色设计、连帽衫、耳机、项圈、星星与星座元素，以及整体的紫蓝色夜色调。将构图从全身设定图改为更具戏剧性的半身主视觉图，展现角色坐在直播桌前，单手托腮，置身于温馨的夜间卧室直播间。添加星光熠熠的城市夜景窗背景、窗帘、悬挂的星星装饰、发光的显示器、桌面麦克风、键盘/手柄以及饮料杯，并辅以柔和的电影级光效和闪烁的氛围特效。保留 Yume Asta 的品牌标识，使布局呈现出 X/Twitter 缩略图或宣传主视觉图的质感。加入密集的装饰性排版和带框信息面板，采用优雅的日系偶像/VTuber 宣传风格：包含日语名称和罗马音“Yume Asta”的大标题、简短的诗意标语、4 个分别标注为“Profile”、“Like”、“Keyword”和“配信スタイル”的方框简介，以及左下角一个较小的标签/社区方框。在底部中央添加醒目的发光大标题“VTuber Debut”和“Coming Soon”，并在其下方添加带有日语出道直播文字的丝带状横幅。整体效果需细节丰富、梦幻、明亮且高级，如同官方 VTuber 出道预告海报。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1777022541321_a366jz_HGp8FBeasAAbN3U.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-455",
    title: "复古中国风 SpaceX 宣传海报",
    category: "海报",
    industry: "通用",
    description: "一张 20 世纪中叶中国风格的复古社会主义宣传海报，印在带有暖棕褐色调的旧纸张上，具有做旧质感、褪色的油墨和略微磨损的边缘。构图呈垂直且具有英雄主义色彩。海报右",
    prompt: `一张 20 世纪中叶中国风格的复古社会主义宣传海报，印在带有暖棕褐色调的旧纸张上，具有做旧质感、褪色的油墨和略微磨损的边缘。构图呈垂直且具有英雄主义色彩。海报右半部分展示了一位男性工人或革命者的半身肖像，他戴着深色帽子，穿着深色实用夹克，面部略微向左，表情坚毅果敢。左中位置，一枚白色的可回收火箭正向上升起，引擎喷射出明亮的火焰，象征着对技术进步的向往；火箭箭身上垂直印有“SPACEX”字样，底部可见着陆支架。火箭后方，戏剧性的奶油色放射状光芒在柔和的蓝色背景上向四周扩散。左下方描绘了一群正在欢呼的工厂工人或市民（共 6 人），他们身穿蓝灰色制服，挥手庆祝，身旁飘扬着一面巨大的红旗。在人群后方加入淡淡的工业城市元素和发射塔剪影。底部预留一个宽大的文字区域，用两行醒目的红色大号中文字体写着：“今天回收火箭，明天建设星际家园！”。采用丝网印刷海报风格，具有绘画般的写实感，色调限于灰蓝色、奶油色、砖红色和深橄榄色，呈现出强烈的意识形态海报构图、胜利的氛围以及复古未来主义的太空竞赛象征意义。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883167769_kjojtq_HGbtmbIawAAoMRp.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-456",
    title: "复古像素山谷",
    category: "海报",
    industry: "通用",
    description: "一幅细节丰富的复古像素艺术景观，描绘了夏季明亮的高山山谷，构图类似于经典的横版卷轴游戏背景，但呈现为广阔的风景视野。前景中，一条蜿蜒的棕褐色土路从底部中心向中景",
    prompt: `一幅细节丰富的复古像素艺术景观，描绘了夏季明亮的高山山谷，构图类似于经典的横版卷轴游戏背景，但呈现为广阔的风景视野。前景中，一条蜿蜒的棕褐色土路从底部中心向中景延伸，穿过茂密的野花草甸；右下角有一条蓝色小溪，边缘点缀着灰色岩石和茂盛的草地。包含 2 组大型前景岩石、1 条蜿蜒小路和 1 条可见小溪。草甸上布满了紫色、黄色、红色、粉色和白色的鲜艳花朵，左侧前景有特别高大的紫色花穗，小路两侧则是茂密的混合花丛。在中景的左右两侧，放置成片的绿叶树和深色松树，勾勒出开阔的山谷中心。背景展示了一座壮观的山脉，共有 7 座清晰可见的山峰：中心偏右有一座高耸的积雪主峰，左侧有 2 座中等高度的紫色山峰，远方中心有 2 座较小的蓝色雪峰，右侧有 1 座较小的紫色山峰，最左侧边缘有一处被截断的岩石山体。以鲜艳的绿色和紫色为主色调，搭配冷蓝色阴影和淡紫色的山体表面。上方渲染出明亮的蓝色天空，点缀着大朵乳白色云彩，天空和山脉处运用了半色调圆点阴影，带有微妙的复古漫画印刷质感、明显的抖动效果以及清晰锐利的像素边缘。天空中添加 4 个小型飞鸟剪影。整幅图像应呈现出色彩丰富、怀旧、优美且层次分明的质感，具有浓重的半色调漫画阴影和复古印刷颗粒感，画面中无文字、无 UI、无角色、无建筑。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883091001_xmzbq7_HGdvd4mXIAAVTjt.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-457",
    title: "奢华口红广告视觉转换",
    category: "海报",
    industry: "通用",
    description: "使用提供的参考图像，将肖像转换为奢华口红广告，同时保留原有的女孩形象、发型、服装、配饰及优雅的动漫插画风格。将构图调整为精致的美妆广告风格，背景采用深绯红至黑色",
    prompt: `使用提供的参考图像，将肖像转换为奢华口红广告，同时保留原有的女孩形象、发型、服装、配饰及优雅的动漫插画风格。将构图调整为精致的美妆广告风格，背景采用深绯红至黑色的华丽色调，搭配光泽感灯光及高端化妆品品牌美学。在右侧抬起的手中添加一支口红产品，并在左下角添加一张大型前景产品特写，展示一支打开的口红管和一只单独的盖子，放置在带有深红色光泽飞溅效果的反射面上。添加日文广告排版及布局元素：左上角添加一个写有“新発売”的小方框标签，一个超大的标题“ROUGE”，一个竖排文本块写着“視線を奪う、ひと塗り。”，随后是 3 行较小的文字：“鮮やかな発色。”、“上品なツヤ。”、“忘れられない印象へ。”，接着是“2026 SPRING NEW COLOR”以及一个写有“全6色”的徽章，旁边附带 6 个口红试色块。右上角添加一个带有字母“GB”及品牌名称“GUFU BEAUTY”的奢华标志。右下角添加一个广告宣传块，包含一个大号的“NEW”字样及文案“うるおい続く、密着ルージュ”。整体采用浓郁的红宝石色、金色点缀、光泽高光、柔和闪光，呈现高端杂志美妆海报的质感。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776936851718_ulpjck_HGe8LotasAAq0uF.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-458",
    title: "奢华护肤品牌主视觉 (KV)",
    category: "海报",
    industry: "通用",
    description: "极简东方奢华广告风格，高端护肤品牌 KV 海报，品牌名称为 \"BRAND\"，整体氛围纯净、克制，将科技感与东方美学相结合。画面中心为一款高端精华产品，玻璃瓶身，",
    prompt: `极简东方奢华广告风格，高端护肤品牌 KV 海报，品牌名称为 "BRAND"，整体氛围纯净、克制，将科技感与东方美学相结合。画面中心为一款高端精华产品，玻璃瓶身，呈现透明渐变质感（顶部透明 → 底部冷青绿色），底部带有液体光泽，搭配香槟金金属瓶盖。产品放置在由抛光石材和金属制成的圆形高光底座上。细节精致清晰，作为绝对的视觉中心。产品周围环绕着细腻的金色能量光环和流动的光带，形成轻微的 S 型动势，象征修复与再生能量，光线向外扩散以强化“功效可视化”。背景右侧略微靠后处有一位东方女性，侧身回眸，气质沉稳优雅，五官精致自然，冷白皮透出通透光泽（强调护肤效果），低饱和度橘粉色妆容点缀淡淡金色高光。黑色长发随风飘动，发丝间融入金色光点与微弱光带，整体干净克制，不过度装饰，与产品光效呼应。身着半透明丝绸服饰与披肩，轻盈飘逸，材质通透且带有精细的金箔纹理与柔和反光，呈现出高级质感。灯光系统采用干净的暖金色主光源（侧后方），产品为焦点，人物为辅助光，边缘光柔和，存在微弱的体积光，空气中漂浮着细小的金色光粒，整体光感清晰且不过曝。背景为极简光影渐变（米白色 + 暖金色过渡），大面积留白，画面干净无杂质，为广告排版留出空间。底部加入冷色调青绿色水纹或矿物质感元素（象征纯净科技与成分来源），增强品牌的“纯净科技感”。严格控制色彩体系：主色为金色 + 米白色，点缀冷青绿色与香槟金，整体为低饱和度高级色调。构图采用稳定的中心构图 + 轻微 S 型曲线，视觉焦点与层级清晰（产品 > 光影 > 人物）。整体风格：高端、纯净、修复再生、抗衰老科技，国际大牌护肤品广告质感（类似 La Mer / SK-II 级别）。超精细，8K 纹理，商业摄影级布光，写实材质表现。负面提示词：产品变形、文字错误、装饰过多、画面拥挤、廉价金、灯光混乱、过曝、低分辨率。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022510382_iibjm3_HGmPiisbYAANkXZ.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-459",
    title: "审查风格武士雕刻",
    category: "海报",
    industry: "通用",
    description: "一幅极简主义的单色插画，描绘了一位日本武士的半身像，呈四分之三侧面朝右，居中放置在浅灰色背景上。盔甲和头盔采用复古雕版印刷或蚀刻风格，呈现出浓重的黑色墨迹、高对",
    prompt: `一幅极简主义的单色插画，描绘了一位日本武士的半身像，呈四分之三侧面朝右，居中放置在浅灰色背景上。盔甲和头盔采用复古雕版印刷或蚀刻风格，呈现出浓重的黑色墨迹、高对比度、点画、阴影线以及类似刮板画的质感。Kabuto 头盔带有两个高大的弯曲角状饰物和分层侧护板，颈部下方可见细致的层状肩甲和长袍褶皱。人物在躯干上部进行裁剪，并与周围充足的留白隔离开来。在面部区域放置 1 条实心垂直黑色矩形审查条，遮盖眼睛、鼻子和大部分面部特征。整体构图保持鲜明、图形化且具有海报感，除黑色和浅灰色外，不包含其他物体、文字或颜色。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022539020_24hq8t_HGhP9RZXoAADhm9.png",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-460",
    title: "将美食照片转化为日式海报",
    category: "海报",
    industry: "通用",
    description: "使用提供的乌冬面参考图片，将其转化为一张简洁、可印刷的日式餐厅宣传海报，并保留美食照片本身作为核心主体。将构图垂直扩展为纵向传单布局，添加带有微妙水彩质感和淡雅",
    prompt: `使用提供的乌冬面参考图片，将其转化为一张简洁、可印刷的日式餐厅宣传海报，并保留美食照片本身作为核心主体。将构图垂直扩展为纵向传单布局，添加带有微妙水彩质感和淡雅波浪纹样的浅冰蓝色季节性背景，并叠加装饰性的绿色枫叶，营造出初夏的氛围。添加 5 处日文文本元素：左上角一个写有“初夏のおすすめ”的蓝色圆形徽章；顶部两行醒目的大号毛笔书法标题，分别为“とり天”和“ざるうどん”；标题附近一个写有“自慢のとり天”的小型红色垂直印章；右上角一个半透明的蓝色垂直文案块，写有“ひんやり、つるり。さっぱり、満たされる。”；右下角一个写有“980円 税込”的价格块，下方配有写着“大盛り無料！”的蓝色笔触横幅。在左下角添加一段简短的 4 行日文正文，以菜单海报风格描述这道菜品。保留原始的餐点摆盘和写实摄影效果，但针对广告需求进行适当优化：使其更明亮、更诱人、更清晰且具有高对比度。使整体设计看起来像是由一张随手拍摄的美食照片制作而成的精美餐厅海报。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883200204_rcrm1n_HGbFge4bAAAqCjG.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-461",
    title: "少女漫画杂志封面",
    category: "海报",
    industry: "通用",
    description: "一张光泽感十足的日本少女漫画杂志封面插图，像真实的周刊浪漫漫画一样排版紧凑，背景为梦幻般的春日夕阳城市，伴有闪烁的焦外成像光斑和飘落的樱花花瓣。封面主体为 4 ",
    prompt: `一张光泽感十足的日本少女漫画杂志封面插图，像真实的周刊浪漫漫画一样排版紧凑，背景为梦幻般的春日夕阳城市，伴有闪烁的焦外成像光斑和飘落的樱花花瓣。封面主体为 4 位时尚现代动漫风格的高中生角色。前景中，1 位主要女生居于右侧偏中位置，以大半身构图呈现，留着带有粉色挑染的长波浪金发，佩戴多个耳环，妆容精致柔美，姿态羞涩浪漫，一只手轻触唇边。她身穿白色衬衫，系着巨大的粉色格纹蝴蝶结，穿着粉色格纹短裙，肩上披着一件滑落的宽松粉色开衫，叠戴项链，单肩背着海军蓝色的书包。她身后站着 3 位配角学生：1 位身材高挑帅气的男生，穿着深色校服西装，领带松散；1 位优雅的女生，金发梳成编织发髻，穿着米色开衫和校服；以及 1 位个子较矮、留着深色短发的女生，穿着系有领结的校服。背景展示了黄昏时分发光的步行桥或河畔步道，两旁灯火通明，樱花盛开，天空呈现粉橙紫渐变色，充满浪漫气息。构图应呈现出高级漫画封面的质感：高渲染动漫插画、明亮的高光、细腻的线条、光面印刷质感、密集的日文封面文字重叠、期号徽章、宣传语、心形图案、闪光效果以及右下角的条形码。包含 7 组主要的文字排版：顶部横跨整个页面的巨大杂志刊名（采用大号粉色气泡感日文字体，带有白色描边），右侧垂直排列的粉色大号浪漫标题（带有巨大的数字“3”），左侧 2 个圆形宣传徽章，左下角 1 个倾斜的横幅，左下角 1 组包含 5 个连载故事标题及作者名的列表，以及右下角附近 1 组包含 5 个连载故事标题及作者名的列表。右上角添加 3 个小型出版信息元素：日期/价格块、圆形期号徽章和 1 个狭长的垂直标签。右下角条形码上方添加 1 个插页式赠品海报预览。采用超精细的少女漫画封面美学，浪漫、时尚、青春、闪耀、柔光、夕阳轮廓光、樱花雨、印刷杂志真实感、复杂的排版层次、鲜艳的粉色和温暖的金色。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936832097_zdfi1c_HGgWNgGaMAAeVUG.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-462",
    title: "日式奇幻带翼猪电影海报",
    category: "海报",
    industry: "通用",
    description: "一张极具戏剧性的日式奇幻电影海报，采用绘画风格、超精细的电影插画质感。海报采用垂直构图，如同剧场版主视觉海报，底部印有暖金色标题，并将多个情感片段层叠组合成一个",
    prompt: `一张极具戏剧性的日式奇幻电影海报，采用绘画风格、超精细的电影插画质感。海报采用垂直构图，如同剧场版主视觉海报，底部印有暖金色标题，并将多个情感片段层叠组合成一个统一的场景。中心角色是一只毛茸茸的小猪，有着柔软的奶油色皮毛、超大的粉色内耳、小巧的鼻子、卷曲的尾巴，以及闪烁着金光的巨大天使羽翼。它直立站在屋顶或高处的木质平台上，俯瞰着日落时分广阔的东京城市景观，一只蹄子拿着威士忌酒杯，另一只蹄子叉在腰间，姿态如同一个疲惫但坚韧的中年上班族。远处是东京天际线、水域、桥梁、漂浮的灯笼，以及在金、桃、紫、深蓝云层映衬下发出橙红色光芒的东京塔。中心周围有 4 个辅助小场景：1) 左上角，带翼猪独自坐在夜晚怀旧的灯笼日式小巷的狭窄吧台前，神情疲惫而忧郁，旁边放着酒瓶和酒杯；2) 顶部中央，带翼猪在类似居酒屋的夜生活场景中与 2 名成年人类一起喝酒，周围环绕着温暖的灯光；3) 右上方，带翼猪提着小手提箱，背对着镜头沿着铁轨走向灿烂的海上日落；4) 左中部，带翼猪独自走在雨后霓虹闪烁的城市街道上，背影被周围发光的招牌和倒影环绕。整幅画面应营造出苦乐参半、充满魔力、孤独且充满希望的氛围，如同关于成年、孤独与情感生存的精品动画电影海报。运用丰富的灯光、密集的环境细节、闪烁的倒影、发光的灯笼、电影般的氛围以及浓郁的蓝橙色对比。画面中需融入日式海报排版：最上方为标语“ひとりで生きてきた。だけど、ひとりじゃ涙は止まらない。”；标题上方为“独身オヤジ、最後の青春。”；底部中央为巨大的主标题“翼のオヤジ”，采用粗体毛笔书法字体；下方为标语“笑って、泣けて、明日また頑張れる。この冬、いちばんやさしい奇跡。”；右下角有一个圆形徽章，写着“秋公開”和“今”；底部边缘添加日式电影海报风格的小字演职员表。街道场景中包含 2 个可见的垂直灯笼/店铺招牌，上面写着“居酒屋”，以及 1 个写着“黒豚”的酒瓶标签。高细节，情感丰富的奇幻海报，高级动画电影美学，日式都市怀旧与魔幻现实主义的结合。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883112271_l9kyje_HGe1n6Hb0AAA-dL.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-463",
    title: "日式居酒屋 Highball 海报",
    category: "海报",
    industry: "通用",
    description: "一张照片级逼真的日式居酒屋宣传海报，呈现出温暖且具有电影感的夜晚氛围，设计风格类似于街边餐厅的传单。构图为垂直且层次丰富。右侧是一位留着深棕色至黑色长直发的年轻",
    prompt: `一张照片级逼真的日式居酒屋宣传海报，呈现出温暖且具有电影感的夜晚氛围，设计风格类似于街边餐厅的传单。构图为垂直且层次丰富。右侧是一位留着深棕色至黑色长直发的年轻日本女性，身穿修身黑色罗纹高领毛衣，半身出镜，右手在胸前位置握着一个盛满金色 Highball 的大号冰镇玻璃杯，杯中冰块清晰可见。她姿态放松且亲切，看向镜头，营造出柔和的夜生活氛围。背景是狭窄的传统居酒屋外观或巷弄场景，充满了温暖的橙色灯笼光影，景深较浅，挂着写有日文手写书法的木质菜单牌，充满怀旧的下班后热闹气息。左上方是一个占据画面主导地位的做旧深色木质招牌，上面用醒目的白色笔触写着汉字“蓮華食堂”，上方有小号平假名“れんげしょくどう”，下方有一条红色笔触绘制的横幅，写着“大衆居酒屋”。在左侧中部下方，放置一块大型奶油色纸张或绘图板，以超大号书法字体展示特价饮品：上方为“ハイボール”，下方是巨大的红色“198円”，价格旁附有小号黑色“（税込）”，数字采用充满活力的笔触风格。在最右侧边缘，添加垂直的白色日文文字“今日も一日、おつかれさまです。”。在右下方女性躯干上方，放置一个红色圆形印章式徽章，上面以对角线和垂直排列着白色手写文字：“旨い！安い！居心地◎”。在底部前景，展示 4 道并排摆放在质朴陶瓷餐盘上的菜单菜品：1) 两串带有焦痕的烤鸡肉串，标注“焼き鳥 盛り合わせ”，价格 580 円；2) 一份包含金枪鱼、三文鱼、白身鱼、紫苏叶和芥末的刺身拼盘，标注“お刺身 盛り合わせ”，价格 780 円；3) 一盘配有柠檬角的日式炸鸡块，标注“若鶏の唐揚げ”，价格 480 円；4) 切片的出汁玉子烧，顶部撒有葱花并配有萝卜泥，标注“出汁巻き玉子”，价格 380 円。在左下角，加入一个发光的红色纸灯笼图形，上面有黑色垂直文字“居酒屋”。在底部中央的深色带状区域，添加醒目的白色粗体笔触文字“でかい！うまい！安い！”，下方配以较小的白色文字“みんなの憩いの場、蓮華食堂へようこそ！”。在顶部招牌附近添加一个装饰性的红色莲花状徽章，右下角也添加一个相同的徽章。采用丰富的琥珀色高光、强烈的对比度、光泽感十足的食物造型、逼真的皮肤和饮品质感、商业海报级的精致度，以及怀旧的昭和风居酒屋宣传美学。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883139602_ro5lu4_HGcGOI7aQAAV5Ic.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-464",
    title: "日式现实主义爱情电影海报",
    category: "海报",
    industry: "通用",
    description: "日式现实主义爱情电影海报风格，灵感源自《花束般的恋爱》，一对二十多岁的日本年轻情侣站在日常城市场景（街道或十字路口）中，保持着微妙且真实的距离感，没有肢体接触，",
    prompt: `日式现实主义爱情电影海报风格，灵感源自《花束般的恋爱》，一对二十多岁的日本年轻情侣站在日常城市场景（街道或十字路口）中，保持着微妙且真实的距离感，没有肢体接触，仿佛关系中逐渐疏离的瞬间。氛围安静而克制，蕴含着未说出口的情绪与时光流逝之感。构图为电影主视觉，人物位于底部或一侧，保留大面积留白以强调空间与氛围。光线为自然光（阴天或黄昏），低饱和度的灰蓝色、米色和暖灰色调，具有真实的摄影质感。画面带有细腻的胶片颗粒感和轻微的生活气息，不刻意追求美感，不过度装饰，如同真实电影中的一帧。边缘或前景可添加少量自然花材作为隐喻（克制，不过分，非装饰性）。在留白区域添加标题“花束みたいな恋をした”，使用细明体，排版简洁稀疏；下方以较小字号添加“We Made a Beautiful Bouquet”。整体要求：真实的日式电影海报质感，艺术化，克制，日常感，强调人物关系而非浪漫符号，避免甜腻的浪漫，避免花海堆砌，避免网红审美，避免拥挤的构图，避免“精致但空洞”的 AI 感。负面提示词：AI 感，过度美化，花海，浪漫滤镜，过度的灯光效果，高饱和度，霓虹灯，亲密拥抱，摆拍感，大头贴构图，网红风格，插画感，3D 渲染，杂乱元素。日式极简艺术电影海报风格，灵感源自《情书》，冬季雪景，年轻女性面部的特写，脸部靠近或半埋在雪中，细小的雪花自然飘落。构图为克制的侧脸特写或微倾斜的脸部，人物占据画面较大比例但不过分锐利，边缘略微柔化或轻微失焦。表情是悲伤过后的平静，眼中含泪或有泪痕，情绪内敛克制，仿佛刚哭过并慢慢回归寂静，眼睛不看镜头，带有记忆与虚无感。光线为冬季自然散射光或阴天柔光，冷白色、浅灰色、淡蓝色调，低饱和度，低对比度，无强阴影，无戏剧性灯光效果。雪与空气构成干净的背景。图像质感介于真实摄影与胶片之间，带有细颗粒、轻微雾感，略微发白或轻微过曝，如同被时间褪色的旧照片或电影剧照。皮肤不过分细节化，无磨皮，无锐化，无修图。非对称构图，脸部可部分裁切，极简背景，保留适当留白。在留白区域添加极简标题“Love Letter”或“ラヴレター”，使用细明体或细衬线体，宽字间距，稀疏排版，颜色为浅灰色；下方以极小字号添加“Love Letter”。整体要求：真实的日式艺术电影海报质感，安静，微妙，克制，如同被雪覆盖的记忆，避免影楼感，避免网红审美，避免精致滤镜，避免灯光特效，避免高对比度和高饱和度，避免锐利的数码感，避免戏剧化的情绪，避免“漂亮但空洞”。负面提示词：AI 感，磨皮，锐化，HDR，高对比度，高饱和度，梦幻光效，镜头光晕，滤镜感，影楼风格，网红脸，摆拍，直视镜头，夸张情绪，3D 渲染，插画风格，复杂背景。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1777022514513_rzuyfx_HGlYOrEbcAA2ro3.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-465",
    title: "日式荒诞生活方式广告网格",
    category: "海报",
    industry: "通用",
    description: "{ \"type\": \"日式讽刺生活方式产品广告拼贴\", \"style\": \"简洁的杂志广告排版，极简主义摄影棚摄影，柔和的室内自然光，低饱和中性色调，幽默的高级",
    prompt: `{
  "type": "日式讽刺生活方式产品广告拼贴",
  "style": "简洁的杂志广告排版，极简主义摄影棚摄影，柔和的室内自然光，低饱和中性色调，幽默的高级品牌感，日文文案密集的海报设计",
  "layout": {
    "format": "2x2 网格",
    "count": 4,
    "sections": [
      {
        "position": "左上",
        "product": "桌面角落忧郁妖精饲养套装",
        "headline": "デスクの隅に、こっそり住まわせる。 デスクの隅のモヤモヤ妖精飼育セット",
        "romanized subtitle": "MOYAMOYA-YOSEI",
        "theme color": "暖米色与黑色",
        "scene": "一位留着凌乱短黑发的年轻日本男性穿着深色夹克坐在桌前，脸部被矩形模糊遮挡，一只手放在一个透明亚克力展示盒旁，盒内有一只圆圆米色眼睛的毛茸茸黑色小生物",
        "counted items": {
          "feature icons": 3,
          "feature labels": [
            "观察盒（带通风口）",
            "忧郁之源（特别配方）",
            "饲养手册"
          ],
          "physical items on desk": 3,
          "desk items": [
            "透明展示盒",
            "盒内毛茸茸的黑色忧郁妖精",
            "标有“饲养手册”的小型立式手册"
          ]
        },
        "sales badge": "系列累计销量突破 45,000 套！"
      },
      {
        "position": "右上",
        "product": "尴尬空气外带包",
        "headline": "気まずい空気、持ち帰りませんか？",
        "subheadline": "见えない空気を、持ち帰って客観視。",
        "series mark": "KIMA-KUU SERIES",
        "theme color": "白色与蓝色",
        "scene": "一位留着纹理短黑发的年轻日本男性穿着白衬衫，举着一个透明自封塑料袋，袋内装有蓬松的白色物质，袋上印有“気まずい空気”和“MAZAI? KUUKI”，脸部被矩形模糊遮挡",
        "counted items": {
          "speech bubbles": 1,
          "speech bubble text": [
            "密封拉链，锁住新鲜感。"
          ],
          "benefit icons": 3,
          "benefit labels": [
            "保持气味与温度",
            "通过标签实现原因可视化",
            "可作为回忆保存"
          ],
          "product variants": 2,
          "variant labels": [
            "尴尬空气保存包",
            "尴尬空气保存包（5 片装）"
          ]
        },
        "usage ribbon": "适用于会议、聚餐、沉默之后。",
        "sales badge": "系列累计销量突破 98,000 个！"
      },
      {
        "position": "左下",
        "product": "拖延症沙漏",
        "headline": "「いつかやる」を可視化する。 先延ばし砂時計",
        "romanized subtitle": "SAKINOBASHI SUNADOKEI",
        "theme color": "柔和米色与炭灰色",
        "scene": "一位留着凌乱黑发的年轻日本男性穿着深色西装外套，靠在木桌旁，旁边是一个装有米色沙子的大型透明玻璃沙漏，脸部被矩形模糊遮挡",
        "counted items": {
          "feature icons": 3,
          "feature labels": [
            "15 分钟计时",
            "静音设计",
            "玻璃材质"
          ],
          "visible text on hourglass": 2,
          "hourglass labels": [
            "还能做",
            "必须做"
          ],
          "color variants": 4,
          "variant labels": [
            "透明",
            "烟熏色",
            "琥珀色",
            "薄荷色"
          ]
        },
        "sales badge": "系列累计销量突破 63,000 个！"
      },
      {
        "position": "右下",
        "product": "肩部负重树懒",
        "headline": "肩にのせて、ちょうどいい圧。",
        "subheadline": "存在は感じる。会話はしない。",
        "product name": "压感树懒（肩扛式）",
        "romanized subtitle": "ATSU NO KAKARU NAMAKEMONO",
        "brand": "NAMAKEMONO LIFE",
        "theme color": "鼠尾草绿与暖灰色",
        "scene": "一位穿着浅灰色卫衣的年轻日本男性微微侧身，一只写实的树懒玩偶挂在他的肩膀上，手臂垂在前方，脸部被矩形模糊遮挡；右下角有一个小圆形插图，展示了树懒横跨在肩膀上的背影",
        "counted items": {
          "feature bullets": 3,
          "feature labels": [
            "适中的重量（约 1.2 kg）",
            "绝妙的沉默",
            "可抚摸的脱力感面部"
          ],
          "inset photos": 1,
          "inset text": [
            "背上也刚刚好。"
          ]
        },
        "usage ribbon": "居家办公、学习、阅读时的好伙伴。",
        "sales badge": "系列累计销量突破 112,000 只！"
      }
    ]
  },
  "subjects": {
    "human model": {
      "count": 4,
      "description": "四格画面中均为同一位帅气的年轻日本男性，身材苗条，留着凌乱短黑发，干净时尚的休闲装扮，表情冷静略显疲惫，每格画面中脸部均被柔边矩形马赛克模糊遮挡"
    }
  },
  "composition notes": "每格画面均采用编辑类产品广告构图，左上角或正上方有醒目的日文排版，下半部分为产品主图，底部附近有带有月桂花环图形的衬线体大号销售数字，留有充足的白色或米色负空间，使用写实的道具和可信的消费品包装",
  "image quality": "高分辨率商业摄影，细节清晰，阴影微妙，高级目录质感"
}`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883132184_x8l5vy_HGcHJuNbMAAJBgm.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-466",
    title: "日式防水雨衣广告",
    category: "海报",
    industry: "通用",
    description: "一张简洁的日式电商促销海报，展示防水雨衣套装，方形构图，明亮的高调产品广告风格。画面展示 2 位成年模特在小雨中的湿润路面上行走，背景柔焦虚化：一位较高的男性模",
    prompt: `一张简洁的日式电商促销海报，展示防水雨衣套装，方形构图，明亮的高调产品广告风格。画面展示 2 位成年模特在小雨中的湿润路面上行走，背景柔焦虚化：一位较高的男性模特穿着灰褐色连帽防水夹克和黑色雨裤，一位较矮的女性模特穿着灰粉色连帽防水夹克和黑色雨裤。两套服装均为轻便雨衣，配有拉链前襟夹克，面料带有细腻光泽，表面可见水珠，搭配休闲运动鞋。人物面部非焦点，弱化处理。采用白色和浅灰色背景布局，模特位于画面中右侧，全身可见。左侧为醒目的粗体日文标题，黑色与鲜蓝色混合，文字内容为：“雨でも快適。しっかり防水”，文字旁配有蓝色小雨滴装饰和一把小雨伞图标，第二行文字下方有黄色笔触下划线装饰。标题下方添加一个蓝色丝带状横幅，内含白色日文文字：“上下セット / 男女兼用”。下方水平排列 3 个圆形蓝色功能图标，并附带日文标签：1) 水滴图标，文字为“耐水圧 20,000mm”；2) 向上拉伸箭头图标，文字为“ムレにくい”；3) 羽毛图标，文字为“軽量設計”。左下角展示 6 款小型产品颜色变体，以 2 行 3 列的缩略图形式排列。6 种配色分别为：黑色套装、藏青色套装、橄榄绿套装、粉色套装、米色套装和浅灰色套装。右上角添加一个金色月桂奖章，配有红色丝带，文字为“Yahoo! ショッピング 第1位 RANKING”，下方附带较小的每日排名说明文字。整体风格：精致的日式电商列表主图，写实服装摄影与简洁平面设计合成，商业目录级品质，户外防水生活方式感，柔和阴天光线，清晰的排版，呈现出高端且亲民的消费品形象。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1777022581926_ghobtv_HGkbprLbIAEyPuz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-467",
    title: "暗黑漫画风怪物海报",
    category: "海报",
    industry: "通用",
    description: "一张纯黑背景下的暗黑单色漫画风恐怖插画，采用竖版海报构图。画面底部中心是一个孤独的短发少年，他坐在地上，双膝蜷缩抱在胸前，头微微低垂，传达出恐惧、孤立和无助感。",
    prompt: `一张纯黑背景下的暗黑单色漫画风恐怖插画，采用竖版海报构图。画面底部中心是一个孤独的短发少年，他坐在地上，双膝蜷缩抱在胸前，头微微低垂，传达出恐惧、孤立和无助感。在他上方，一个巨大的生物机械恶魔或装甲怪物头颅正俯冲而下，有着长而有棱角的骷髅状面孔、尖锐的下巴、狭窄空洞的眼眶、层叠的头盔状甲片以及锯齿状的张开大嘴。男孩周围有 2 只巨大的骨骼利爪，左右各一，像牢笼一样将他围住；每只手都有长长的分段式金属手指，指尖尖锐，向内弯曲，极具威胁感。整体采用粗犷的白色划痕线条和厚重的交叉排线，在深黑色背景下呈现出强烈的对比，极具青年漫画（Seinen manga）的张力。在怪物的脸部、利爪和地面上添加鲜艳的霓虹紫色液体泼溅和长长的滴落痕迹，汇聚在男孩周围，成为画面中唯一的强色彩点缀。在右上角添加竖排日文文字“逃げちゃダメだ”，并在其下方添加白色小字英文：EGO BORDER: ACTIVE。整体氛围压抑、心理化、幽闭且充满梦魇感，宛如一张关于内心恐惧与精神崩溃的暗黑动漫海报。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776883161087_nwy1n5_HGcL5cvW4AA9M5Z.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-468",
    title: "极简主义动漫肖像（面部遮挡）",
    category: "海报",
    industry: "通用",
    description: "一张简洁的极简主义动漫女性半身肖像，位于画面中央，面部被一个覆盖整个脸部的巨大垂直柔边灰色矩形完全遮挡，形成审查遮盖效果。她拥有一头极长的飘逸秀发，呈现双色调：",
    prompt: `一张简洁的极简主义动漫女性半身肖像，位于画面中央，面部被一个覆盖整个脸部的巨大垂直柔边灰色矩形完全遮挡，形成审查遮盖效果。她拥有一头极长的飘逸秀发，呈现双色调：一侧为深海军蓝，另一侧为淡银灰色，发丝向外飘散，仿佛被微风吹动。在发丝中加入几缕珊瑚粉色的细条纹作为点缀。她身穿一件高领结构的米白色外套或制服夹克，内领为深海军蓝，并配有两颗小金扣，营造出时尚的现代科幻感。可见的皮肤呈苍白色，一只耳朵上戴着一枚小巧的耳钉。采用平涂、优雅的插画风格，带有平滑的矢量感阴影，无厚重纹理，色调克制且柔和，以粉蓝色、奶油色、海军蓝和珊瑚粉为主。背景为抽象几何构图而非现实场景：在天蓝色的底色上叠加大型奶油色圆形和对角线形状，并装饰有 5 个珊瑚色圆形图形，通过细垂直线或曲线连接，围绕角色进行装饰性排列。整体构图保持通透、平衡且具有现代感，线条柔和，留白巧妙，呈现出冷静的编辑海报美学。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936885126_r2mpal_HGea7MobkAA0kH-.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-469",
    title: "柔和动漫奇幻风格女主角海报",
    category: "海报",
    industry: "通用",
    description: "一张竖版日本动漫奇幻游戏或轻小说宣传海报，采用柔和的淡紫色、白色和金色调，以一位英姿飒爽的少女为主角，背景为宏伟的空中之城。她呈动态的三分之四全身姿势，身体微向",
    prompt: `一张竖版日本动漫奇幻游戏或轻小说宣传海报，采用柔和的淡紫色、白色和金色调，以一位英姿飒爽的少女为主角，背景为宏伟的空中之城。她呈动态的三分之四全身姿势，身体微向左转，左手持一柄华丽的法杖，右手向后伸展，仿佛正处于风中。她的面部被一个位于头部的平坦淡色方形遮挡块覆盖，但可见的设计暗示着这是一位精致的动漫女主角，拥有极长的飘逸银丁香色长发、侧刘海、散落的发丝以及带有深靛蓝色丝带蝴蝶结的星形发饰。她身着精致的魔法少女风格连衣裙：露肩白色紧身胸衣，配有海军蓝和紫罗兰色饰边及金色星星图案；不对称的层叠裙摆，色彩融合了白色、长春花蓝、紫罗兰色和深靛蓝色；腰间饰有巨大的深蓝色蝴蝶结和金色星形宝石；配有分离式的飘逸袖子，臀部垂挂着带有微型星星挂饰的金色链条，穿着白色过膝袜，大腿上饰有蓝色星形吊带。她的法杖高挑优雅，深色杖身配有金色框架元素，顶部附近悬挂着一颗多面蓝色水晶，并饰有蝴蝶结和星星装饰。背景是轻盈的奇幻天际线，包含白色塔楼、大教堂般的尖顶、云朵、羽毛和飘落的粉色花瓣，伴有明亮空灵的背光和梦幻般的英雄氛围。构图仿照精致的主视觉海报，并将丰富的日语排版融入画面中。左上方放置日语标语“願いが、未来を照らす。”，下方附带两行较小的文字。右上方放置一个星形徽章、大号角色名“ルミナ”、副标题“— Lumina —”以及一行较小的声优信息。右侧添加 3 个垂直排列的功能标注，每个标注包含一个小图标、一个粗体日语标题以及下方两行较小的短文。左侧添加一个沿角色身侧垂直排列的日语文案块。右下方包含 3 个该角色的斜向堆叠小肖像插图：1 个平静的正面表情、1 个严肃的侧面表情和 1 个闭眼微笑的表情。左下方放置大号日语标题“星紡ぐレガシア”，下方附带英文副标题“— LEGACIA: Weave the Stars —”。右下角添加日期文本“2025. 夏”及下方一行简短的日语标语。最底端边缘左侧包含 2 个小型社交或网站信息块，右侧包含一行微小的版权声明。采用高端现代动漫宣传插画风格，呈现明亮的柔和奇幻氛围、优雅的构图、流畅的线条和色彩、柔和的赛璐珞阴影、细腻的织物动感、光泽高光、复杂的服装细节、整洁的排版布局以及精致的商业海报质感。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776936912601_s5u7hu_HGhUPHpbsAAs4UC.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-470",
    title: "武侠电影角色海报",
    category: "海报",
    industry: "通用",
    description: "电影角色海报，东方不败身着红袍饮酒，悬崖落日，武侠氛围；东方不败绣花针飞舞，红袍长发立于悬崖之上，黑木崖落日如血",
    prompt: `电影角色海报，东方不败身着红袍饮酒，悬崖落日，武侠氛围；东方不败绣花针飞舞，红袍长发立于悬崖之上，黑木崖落日如血`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022506511_sk62xf_HGkhezdbwAA1tiN.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-471",
    title: "海峡两岸对话社论插画",
    category: "海报",
    industry: "通用",
    description: "一幅关于海峡两岸关系与对话的极简主义社论插画，采用柔和的扁平纸艺拼贴风格，带有细腻的颗粒质感和圆润的形状。画面展示了 2 个侧面相对而坐的人物：左侧是一名身着深",
    prompt: `一幅关于海峡两岸关系与对话的极简主义社论插画，采用柔和的扁平纸艺拼贴风格，带有细腻的颗粒质感和圆润的形状。画面展示了 2 个侧面相对而坐的人物：左侧是一名身着深低饱和度蓝色衣服的男性，单手托腮，姿态沉思；右侧是一名身着暖棕色衣服的女性，单手比划，仿佛正在解释。两人的面部均经过处理，用柔和模糊的矩形色块遮盖，以保持匿名。两人中间放置着一个深蓝色的平衡天平，垂直且对称，象征着公正、谈判与平衡。人物上方有 2 个重叠的对话气泡，左侧为蓝灰色，右侧为浅米色，象征着交流与不同观点。底部中心放置 1 个白色的人头侧影剪影，内部包含一株简单的生长植物（带有茎和叶），象征和平、理解或建设性思维。背景为奶油色，构图周围分布着 4 个大型半透明抽象圆形，包括最左侧的浅灰色形状、右上方的米色形状、最右侧的暖棕褐色形状，以及底部前景中深蓝灰色的半圆形。保持构图平衡、冷静、具有象征意义且如同海报一般，无文字，无锐利轮廓，非写实风格，色调采用灰蓝色、板岩色、米色、奶油色和棕色的柔和配色。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022550581_cii9qp_HGmEmbubcAAog8a.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-472",
    title: "海边咖啡馆活动海报",
    category: "海报",
    industry: "通用",
    description: "创作一张充满活力、具有温暖时尚咖啡馆美学的中文活动海报。画面视角从海边咖啡馆内部向外拍摄，透过巨大的落地窗可以看到棕榈树、明亮的蓝天、户外座位以及远处的摩天轮。",
    prompt: `创作一张充满活力、具有温暖时尚咖啡馆美学的中文活动海报。画面视角从海边咖啡馆内部向外拍摄，透过巨大的落地窗可以看到棕榈树、明亮的蓝天、户外座位以及远处的摩天轮。构图应兼具真实的生活场景感与充满能量的平面设计感。在前景中，放置一张深色木桌，桌子底部中央放置 1 台打开的笔记本电脑，右侧放置 1 个带黑色杯盖的外带咖啡杯，左侧放置 1 个黑色包，左边缘附近放着一小叠书。使用阳光明媚、略带金色午后的氛围，玻璃上有反光，营造出轻松的度假感。

以拼贴风格叠加醒目的海报图形，使用撕纸、笔触涂鸦、贴纸和胶带纸条等元素。左上角的主标题应为巨大的深棕色和橙色手写书法字体，写着“疯狂星期四”，旁边有一个写着“第 11 期”的小黄标签，左上角还有一个更小的徽章，上面写着“活动预告”并配有一个微型扩音器图标。在主标题下方，添加一个绿色笔触横幅，文字为“下周四，不见不散！”，下方括号内附上一行较小的文字：“（五一长假前最后一期）”。

添加 2 张撕裂的笔记本纸卡：一张在右上角，一张在左下角。右上角的纸条应包含一段简洁的中文邀请文案，采用黑色和橙色字体排版，写着：“让我们海边小聚，远眺摩天轮，吹吹海风，和 App & AI Builder 们一起聊聊产品、远程生活与创作。”并在纸条右下角加上一个橙色的小心形涂鸦。左下角的纸条应列出 3 个带有图标和橙色标题的信息块：“时间”、“地点”和“说明”。在“时间”下写上“2026 年 04 月 23 日 (星期四)”和“12:00 ~ 18:00”。在“地点”下写上“南山区·前海石公园·福叁咖啡”。在“说明”下写上“无需报名，随时来吧！”。

在右中区域，放置一个巨大的、带有深色描边的白色手写风格俏皮标语，略微向上倾斜，写着“喝咖啡、随意交流 海边散步，主打一个 Chill~”。在此标语右侧添加 1 个插画风格的咖啡杯贴纸。在标题和纸条周围使用充满活力的橙色油漆溅射和素描涂鸦，使海报看起来年轻且随性。

在底部，放置一条宽大的米白色撕纸风格页脚，横向排列 3 个功能块。第 1 块：一个雪花状图标，配文“舒适环境”及小字“空调 + 宽敞桌椅”。第 2 块：一个 Wi‑Fi 图标，配文“电网无忧”及小字“WiFi + 插座”。第 3 块：较大的橙色手写文字“期待与你 海边相遇！”，下方带有蓝色下划线装饰和一个微型心形涂鸦。整体设计应融合真实摄影与平面海报元素，具有强烈的对比度、书法笔触、剪贴簿质感、咖啡馆生活气息以及时尚的 AI 生成社交媒体活动海报风格。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022551755_qnn1fb_HGkFnXGaUAAx8pe.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-473",
    title: "淡紫色蓝莓蛋糕动漫海报",
    category: "海报",
    industry: "通用",
    description: "一张梦幻般的淡紫色日本电影海报插画，采用光泽感的少女动漫风格，充满了蓝莓甜点带来的混乱感与柔和的闪光。画面中，1 位少女坐在杂乱的厨房或烘焙工作台的地板上，留着",
    prompt: `一张梦幻般的淡紫色日本电影海报插画，采用光泽感的少女动漫风格，充满了蓝莓甜点带来的混乱感与柔和的闪光。画面中，1 位少女坐在杂乱的厨房或烘焙工作台的地板上，留着银紫色短波波头，侧分刘海，戴着一个淡紫色小蝴蝶结发夹，身穿另类可爱的时尚服饰。她的脸部被一个居中的方形淡紫色灰色遮挡块刻意遮住。她穿着一件超大号半透明淡紫色夹克，袖口有黑色丝带装饰，内搭浅紫色印花上衣，叠戴银色项链，穿着紫色格纹裙、装饰着淡紫色心形补丁和黑色蝴蝶结的宽松白色堆堆袜，以及带有丝带装饰的厚底淡紫色运动鞋。她一只手拿着 1 颗蓝莓靠近嘴边，另一只手拿着 1 个沾满鲜艳紫色蓝莓面糊的金属搅拌碗。在她面前，1 个巨大的金色磅蛋糕戏剧性地裂开，溢出深色光亮的蓝莓和紫色馅料，洒落在 1 个冷却架和桌面上。蓝莓散落在整个画面中，作为悬浮和静置的道具，营造出一种奇妙的悬浮感。环境里杂乱地摆放着烘焙工具和笔记：右上角有 1 页螺旋笔记本，上面用英文手写着蓝莓磅蛋糕的食谱；右下角有 1 个打蛋器；左下角有 1 张别着的小照片，上面画着 2 位动漫少女；右下角还有 1 张写着日文和简笔画小兔子的手写便签。整体采用丁香紫、紫罗兰、长春花蓝、奶油色和深蓝莓紫的单色调，辅以明亮的高光、柔和的雾气、半透明的叠层和浪漫的闪粉。在海报左半部分加入醒目的大号日文书法文字，像戏剧性的轻小说或电影广告一样垂直和对角线排布；蛋糕旁配有 1 条丝带横幅，上面写着日期“2026年7月メロードショー”；右侧配有垂直文案；底部有小字制作人员名单；最底部有一行最终标语。整体构图营造出一种“可爱的灾难”感：美丽却失败的烘焙、甜蜜的忧郁、时尚的凌乱感以及电影宣传海报的张力。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1777022578644_pkcim6_HGmcVJ5bEAArv1C.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-474",
    title: "爆款小鸡炖蘑菇广告",
    category: "海报",
    industry: "通用",
    description: "创作一张以纯黑为背景的竖版美食广告，风格类似于高端食材拆解海报，用于展示丰盛的中式小鸡炖蘑菇。采用简洁的自上而下爆炸式构图，将食材悬浮在成品菜肴上方，每组食材清",
    prompt: `创作一张以纯黑为背景的竖版美食广告，风格类似于高端食材拆解海报，用于展示丰盛的中式小鸡炖蘑菇。采用简洁的自上而下爆炸式构图，将食材悬浮在成品菜肴上方，每组食材清晰分离，并使用光泽感十足的商业美食摄影灯光进行照明。顶部展示一簇混合的榛蘑及其他鲜美蘑菇。下方展示 2 组香料：一堆红枸杞，以及一小捆青葱和 2 片厚姜片。再下方展示 2 组主料：几块带皮生鸡块，以及一捆干粉条。接着展示 2 组蔬菜：去皮土豆块和厚胡萝卜片。在它们下方，放置 1 个装满浓郁金黄色鸡汤的透明玻璃碗，表面可见 4 个香菇、细碎香草、少量浮油和淡淡蒸汽。底部放置 1 个带有侧把手的深褐色陶瓷砂锅，锅内盛放着炖好的成品：鸡块、香菇、透明粉条、土豆块、胡萝卜片、散落的枸杞、葱花点缀，以及油亮的金黄色汤汁。在各层之间添加飘落的液滴、碎屑和细小的装饰颗粒，以强调动感和丰富度。成品炖菜上方加入淡淡的蒸汽，并在砂锅右侧边缘添加 1 个明亮的星形高光。在食材组周围添加 7 个中英文双语标注，每个标注均配有指向相关食材的细弯箭头。这 7 个标签分别为：“榛蘑&香菇 / Hazel Mushrooms & Shiitake”、“鲜美菌菇 / Savory Mushrooms”、“枸杞&葱姜 / Goji Berries & Aromatics”、“鸡肉&粉条 / Chicken & Vermicelli”、“土豆&胡萝卜 / Potatoes & Carrots”、“浓郁鸡汤 / Rich Chicken Broth”以及“成品 / Finished Stew”。在蔬菜或中部区域附近添加 1 条额外的双语文字说明：“丰富食材 / Rich Ingredients”。使图像呈现超写实、诱人、高对比度、极其锐利的效果，并带有电影级高光、深邃阴影、高端包装广告美学，以及适合海报或社交媒体广告的平衡居中布局。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883186346_boisd8_HGat3C2asAETaP6.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-475",
    title: "皮克斯风格 AI Web 设计冲刺活动海报",
    category: "海报",
    industry: "通用",
    description: "一张充满电影感的创意编程活动海报，采用迪士尼-皮克斯（Disney-Pixar）动画电影海报风格设计。采用竖构图，展现了一个温馨的夜晚室内场景，左侧巨大的阁楼窗",
    prompt: `一张充满电影感的创意编程活动海报，采用迪士尼-皮克斯（Disney-Pixar）动画电影海报风格设计。采用竖构图，展现了一个温馨的夜晚室内场景，左侧巨大的阁楼窗户映出日落时的城市天际线，背景为裸露的砖墙，营造出霓虹灯点缀的创意工作室氛围。顶部中央，醒目的光泽感立体排版显示“Disney•PIXAR”，下方是巨大的白色 3D 粗体主标题“The AI Web Design Sprint”。正下方是较小的明亮文字：“BUILD FAST. BREAK RULES. SHARE LOUD.”。画面中央前景处，两名成年男子并排坐在木桌旁，中间放着一台笔记本电脑，呈现出休闲的初创公司创始人氛围；一人穿着深色连帽衫，另一人穿着浅色卫衣并戴着棒球帽，两人都面向镜头，姿态友好且具有宣传感。他们的面部应处理得通用且不突兀，重点在于活动海报的构图而非肖像写实感。笔记本电脑盖上有 3 个可见贴纸：一个紫色代码括号贴纸，一个带有白色爆炸符号的黑色贴纸，以及一个写有“BUILD FAST. BREAK RULES. SHARE LOUD.”的长方形标语贴纸。场景周围包含 4 个奇幻的动画吉祥物元素：左上方是一个悬浮的机器人无人机灯，带有发光的蓝色眼睛，向下投射出一束暖光；右上角是一个微笑的卡通太阳图标；附近漂浮着一个小小的红色像素角色；桌上笔记本电脑前站着一个发光的蓝色猫形数字吉祥物。右侧的竖屏显示器上呈现出深色代码界面，文字清晰可见，包括“// Welcome back, Julian!”、“Opus 4.6”、“Minimal Playground”、“Agency 976”、“Cyberpunk Cafe”、“Surfers (late set)”，以及一个标题为“Sprint Plan”的清单，包含 4 个项目：“DISCOVER”、“IDEATE”、“BUILD”、“SHIP”。左侧，一个手写纸质告示牌上钉着 4 条通知：“4 NIGHTS OF CHAOS & CODE”、“DOORS 7PM”、“SHOW 8PM”以及“$10 ADV / $12 DOS”。左下角前景处，一个白色咖啡杯上写着“THE SOUTH SIDE DIY 218 W. 31ST ST. CHICAGO, IL”并配有一个小骷髅图标。右下角前景处，一个陶土花盆里种着绿叶植物，上面写着“CREATIVE COLLISION”。底部中央，醒目的粗体文字写着“APRIL 27–30”，下方是“LIVE. ONLY ON THE WEB.”。底部边缘添加一行仿电影海报风格的微小制作人员名单，引用 Julian Lopez 和 Harvey Specter 等名字，以及 Minimal Playground、Agency 976、Cyberpunk Cafe 和 Surfers 等项目，并附带俏皮的制作职衔。运用戏剧性的暖橙色与冷蓝色灯光、精致的动画电影渲染、柔和的景深、光泽表面、丰富的对比度、高度精细的海报设计，展现出迷人的科技初创公司活力，并呈现出高端活动广告的质感。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022619816_31rzzg_HGp6YdPagAANQSk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-476",
    title: "荒诞的紫色 Mofumofu 柏青哥机",
    category: "海报",
    industry: "通用",
    description: "一张超高细节的日式柏青哥机正面视图，设计为超现实的当代艺术恶搞风格，采用亮面黑色与金属紫色机身，配以强烈的品红-紫色 LED 照明、闪亮的镀铬饰条、珠宝般的塑料",
    prompt: `一张超高细节的日式柏青哥机正面视图，设计为超现实的当代艺术恶搞风格，采用亮面黑色与金属紫色机身，配以强烈的品红-紫色 LED 照明、闪亮的镀铬饰条、珠宝般的塑料模具，机身各处嵌入了多个粉色爪印徽章。中央显示屏呈现了一位中年日本女性，她留着深红棕色短卷发，身穿深色和服，以一种充满对抗性的英雄姿势直指观众，背景为宇宙紫色的闪电与星云。她的面部被刻意用柔和的矩形模糊处理，机身周围还出现了 3 个同样女性的小型肖像，且均采用了相同的面部模糊处理，总计 4 个模糊人像。在机身左右两侧布局中嵌入 3 个毛绒熊猫头。在顶部，醒目的闪光标题文字写着“CR 岡安モフモフ”，下方配有较小的副标题“もふもふは、正義。”。在中央屏幕左侧，添加短语“今日もモフって生きていく。”。在女性胸部区域，放置一个带有金色字样的黑色笔触标签，写着“岡安モフセフ”。在右侧，创建一个带有爪子图标的明亮奖励面板，写着“モフモフ RUSH”。在下方中央，添加一个圆形按钮状徽章，写着“モフモフ CHANCE”。在底部中心，创建一个带有粉色爪子图标的大型发光控制按钮，标签为“モフモフ”。在右下方的显示区域，添加一张该女性指点动作的小型嵌入图像，以及手写风格的文字“もふるか もふられるか…”。整体氛围应显得荒诞、俗气、过度设计、媚俗且滑稽，如同庆祝毛茸茸动物与夸张奇观的虚构柏青哥机，呈现为高分辨率的产品级正面摄影效果，具有锐利的反射、饱和的紫色高光和密集的装饰细节。`,
    tags: ["海报"],
    image: "https://cms-assets.youmind.com/media/1776936859835_m7y90d_HGi6QyFaoAAr0GV.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-477",
    title: "赛博街头风漫画泼墨艺术",
    category: "海报",
    industry: "通用",
    description: "一张动态的漫画风格动作插画，描绘了一位中性风的年轻女性，采用极具张力的低角度仰拍视角，仿佛观众正处于她下方，看着她穿过爆炸般的墨迹与碎片向前迈步或降落。她留着一",
    prompt: `一张动态的漫画风格动作插画，描绘了一位中性风的年轻女性，采用极具张力的低角度仰拍视角，仿佛观众正处于她下方，看着她穿过爆炸般的墨迹与碎片向前迈步或降落。她留着一头铂金色短波波头，长长的侧分刘海遮住了半边脸，皮肤白皙，散发着酷炫且叛逆的街头时尚气息。她的面部被一个简单的浅灰色矩形遮挡块覆盖。她穿着 5 件主要服饰：一件超大号黑色连帽夹克，袖口和内衬带有明亮的青色几何图案；一件修身白色背心；带有绑带和拉链细节的黑色宽松工装裤；一条挂着青色吊牌的黑色腰带；以及带有少量青色点缀的厚底黑白运动鞋。增加额外的配饰细节，包括垂下的绑带、搭扣和街头科技装饰。她的姿势放松但极具统治力，一只膝盖抬向观众，躯干微微后倾，一只手插在口袋里，夹克随动作向外飘动。构图应充满侵略性和动感，采用黑、白、灰的单色调，并以鲜艳的电光青色笔触进行点缀。背景填充爆炸性的抽象笔触、墨迹飞溅、速度线、撕裂的黑色碎片，以及从她身后向外辐射的混乱漫画能量。高对比度、颗粒感纹理、粗犷的墨线、写意的泼墨效果、都市反乌托邦动漫主视觉图、极其细腻的布料褶皱、时尚的编辑风格构图、宽幅电影级构图。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936893755_6zti8e_HGfKrG_WoAAzFUe.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-478",
    title: "赤壁之战夜战",
    category: "海报",
    industry: "通用",
    description: "一幅宏大的电影感历史画作，描绘了赤壁之战的夜晚，展现了整支中国古代江上舰队被烈火吞噬的场景。构图采用高耸的竖构图，视角从略微升高的码头侧面俯瞰，河流向中心远方延",
    prompt: `一幅宏大的电影感历史画作，描绘了赤壁之战的夜晚，展现了整支中国古代江上舰队被烈火吞噬的场景。构图采用高耸的竖构图，视角从略微升高的码头侧面俯瞰，河流向中心远方延伸，江面上挤满了燃烧的战舰。画面左下角和中心前景处需精确包含 3 个显眼的前景木筏状平台或甲板结构，均由粗糙木材制成并被火焰包围，士兵们肩并肩站立，周围环绕着战鼓、旗杆和红色战旗。画面右下角前景处需精确包含 2 名骑马的指挥官，正沿着木质码头或桥梁向观众疾驰而来：前方的骑手清晰可见，身穿深色札甲，披着被风吹起的深红色披风，正急切地呼喊；身旁的第二名骑手身形较暗，部分被遮挡。在中景处，包含数十艘中国古代帆船战舰和小型船只，许多已经起火，展现出传统的硬帆、木质船体、攻城塔楼般的上层建筑以及倒塌的桅杆。远处的岸线与舰队连成一片火海，冲天的橙色火焰和黑红色的烟云填满了天空，无数火星和灰烬在空中飘散。水面反射着熔岩般的橙色火光，船只之间交织着黑色的阴影。画面中应充满密集的士兵、索具、旗帜、战鼓、武器和混乱的战场细节，但整体视觉重点应保持在火光冲天的河流上。采用黑色、余烬红、焦橙色和青铜色的深沉戏剧性色调，呈现强烈的高对比度火光、体积感烟雾、史诗般的尺度、超精细的纹理、动态感以及三国传奇场景的宏大感。中国古代战争美学，冷峻、英勇、灾难性、写实绘画风格，无现代元素，无文字。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022614130_42vlsd_HGknt1ubIAASeqX.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-479",
    title: "超现实未来主义日式拼贴海报",
    category: "海报",
    industry: "通用",
    description: "一张密集的超现实拼贴海报，将复古日本街头文化、反乌托邦未来主义、环境崩溃和宇宙梦境意象融合在垂直堆叠的构图中。画面应呈现出层叠的混合媒介街头艺术感，由撕裂的海报",
    prompt: `一张密集的超现实拼贴海报，将复古日本街头文化、反乌托邦未来主义、环境崩溃和宇宙梦境意象融合在垂直堆叠的构图中。画面应呈现出层叠的混合媒介街头艺术感，由撕裂的海报、水墨插画、漫画纹理、水彩晕染、报纸印刷、喷漆和平面设计碎片构成。整体色调结合了深午夜蓝、黑色、奶油纸色、霓虹洋红色、深红色、樱花粉和工业灰。左上角展示一轮巨大的红日映衬着富士山，樱花枝横跨角落，天空中有一架小型飞机。左侧及左下方描绘一条拥挤的东京风格街道，挤满了行人、发光的招牌、密集的建筑，以及一座顶部带有笑脸、垂直招牌写着“AI IS WATCHING YOU”的高耸圆柱形建筑。在附近的建筑上加入风格化的日式招牌。在城市场景中融入巨大的波浪图案和一座宝塔。上部中心放置一个黑暗的工业天际线，多个烟囱释放出巨大的黑烟，并过渡到一个向前漂浮、单手伸出的巨大宇航员。右上角将天空转化为外太空，点缀着星星、旋转的紫蓝色星云和一个黑洞。下方创造一个未来派的生态城市，由光滑的摩天大楼与茂密的树木、悬崖和层叠的瀑布混合而成。在最右侧添加一个发光的霓虹灯牌，上面写着“DREAMING IS FREE”。在宇航员附近，放置一张撕裂的海报，上面用大号字体写着“THE FUTURE IS UNWRITTEN”，下方用较小字体写着“But we are the authors”。在中心区域，层叠樱花和大型玫瑰等花卉元素，环绕着一个部分被遮挡的中央人像，营造出碎片化身份的感觉。下部中心展示一个身穿深色连帽夹克、背对观众的人，衣服上有涂鸦风格的文字“QUESTION EVERYTHING”。在他们周围，加入额外的剪纸肖像碎片、一个受蒙德里安启发的红、蓝、黄、白、黑矩形几何块、一个古典大理石半身像碎片、一只飞翔的白鸽、一个写着“EQUALITY ≠ EQUITY”的小型抗议标语，以及一个看向未来景观的坐姿人物。左下角包含一个戴着深色帽子和外套的黑色电影风格人物，右下角则是一个漫画风格的女性侧脸。画面中散布着涂鸦、撕裂的边缘、墨水溅痕、层叠的纸张纹理和海报残片。整个构图极其繁复、具有电影感且引人深思，在细节丰富的高级当代拼贴壁画风格中，平衡了希望与焦虑、传统与科技、自然与城市过载。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022590296_rwqaxf_HGjNbzjaEAActEs.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-480",
    title: "超现实霓虹日本大都市俯瞰图",
    category: "海报",
    industry: "通用",
    description: "一张超高分辨率的竖版插画，描绘了夜晚超现实的日本未来主义大都市。视角从极高、极陡峭的角度向下俯瞰，仿佛站在黑暗的山坡小巷或屋顶观景台，穿过狭窄的建筑峡谷。构图保",
    prompt: `一张超高分辨率的竖版插画，描绘了夜晚超现实的日本未来主义大都市。视角从极高、极陡峭的角度向下俯瞰，仿佛站在黑暗的山坡小巷或屋顶观景台，穿过狭窄的建筑峡谷。构图保持 9:16 的比例，极具戏剧性，深邃的视角直入巨大的发光城市盆地，其中密布着层层叠叠的低矮屋顶、狭窄街道、高架人行道以及向远处延伸的摩天大楼。画面两侧由密集的建筑前景构成：左上方悬挂着一个巨大的发光红色纸灯笼招牌，上面印有醒目的黑色日本汉字，挂在古老的木制屋檐下；右侧是一栋高耸的建筑立面，布满明亮的窗户和数个垂直霓虹灯招牌；画面中交织的架空电线和电线杆穿插其中。下方的城市既拥挤又迷人，融合了昭和时代的复古小巷美学与赛博朋克未来主义。采用浓郁的图形绘画风格，具有强烈的黑色墨线、大胆的赛璐珞阴影和发光的霓虹灯点缀，在保留类似 Midjourney 的电影质感的同时，增加了更细腻的环境细节。主色调为耀眼的橙色和琥珀色窗光、饱和的深红与绯红色招牌、深紫色的夜空、热烈的洋红色高光以及电光青色点缀。在下方的城市中填充无数微小的可读场景，通过剪影和明亮的窗户暗示：街上的节日游行、夜生活人群、疲惫的上班族、小巷中隐藏的帮派成员、娱乐区的舞者、公寓窗前学习的学生、争吵的情侣、屏幕前发光的玩家，以及嵌入建筑中的许多其他微小的人类故事。强调城市辉煌与情感孤立、拥挤的无聊与颓废之美之间的对比，并带有一种关于无意义现代生活的讽刺意味。尽管细节密集，图像仍需保持美学上的和谐，处处可见清晰的微小细节、日文发光招牌、层次分明的深度、大气雾霾，以及一种超现实、略带压抑却又美丽动人的氛围。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022568086_o1pa8w_HGjGc1-XgAAkn_s.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-481",
    title: "醒目的 KFC 食品广告海报",
    category: "海报",
    industry: "通用",
    description: "一张醒目的正方形快餐广告海报，采用简洁的摄影棚布景，设计风格如同高端 KFC 宣传活动。构图完美居中，中间为白色背景板，左右两侧为纯亮红色竖条边框。在最上方，均",
    prompt: `一张醒目的正方形快餐广告海报，采用简洁的摄影棚布景，设计风格如同高端 KFC 宣传活动。构图完美居中，中间为白色背景板，左右两侧为纯亮红色竖条边框。在最上方，均匀分布 3 条短红色竖线，呼应 KFC 品牌元素。下方添加醒目的大号堆叠式无衬线大写粗体标题：“THIS IS NOT A FILTER.”（黑色），紧接着下方是“IT’S JUST KFC.”（亮红色）。画面中心前景处，一位留着深色短卷发的年轻男子身穿深红色圆领衫，身体前倾，仿佛正在闻炸鸡的香味；仅露出头发、耳朵、肩膀和上半身，面部被一个矩形模糊块遮挡。桌子中央放置着一个超大号炸鸡桶，桶内装有 6 块清晰可见、裹着酥脆面衣的金黄色炸鸡，热气腾腾。炸鸡桶为白色，侧面带有红色条纹，正面印有黑色 KFC 风格标志，标志中的人脸区域被金属灰色模糊块遮挡。桌子左侧放置一个红白条纹薯条盒，里面装满金黄色的炸薯条，前方桌面上散落着几根薯条；薯条盒上也印有 KFC 风格标志，人脸区域同样被遮挡。右侧放置一杯装满冰块的高透明可乐，杯身可见冷凝水珠，印有 KFC 风格标志且人脸区域被遮挡。饮料前方放置一个小白色蘸料碗，里面盛着色泽诱人的红色番茄酱。底部中心添加粗体黑色无衬线标语：“Crispy. Juicy. Irresistible.”，下方配有一行小巧的草书签名式文字“Col. Harland Sanders.”，底部带有一个小型红色矩形装饰。采用高度精良的商业食品摄影布光，鲜明的红白黑品牌配色，食物焦点清晰，质感逼真，布局对称，呈现高端海报广告风格，是一款简洁现代、适用于社交媒体的正方形格式海报。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776936886475_k86v3p_HGhKpUJWEAA5Uvj.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-482",
    title: "金碧辉煌武侠宫廷海报",
    category: "海报",
    industry: "通用",
    description: "一张极具戏剧感的复古中国武侠电影海报，采用奢华的暗金与琥珀色调，呈现经典历史史诗风格。构图中心为一名坐在前方的年轻皇室男子，身穿华丽的黑金龙袍，头戴清朝红缨官帽",
    prompt: `一张极具戏剧感的复古中国武侠电影海报，采用奢华的暗金与琥珀色调，呈现经典历史史诗风格。构图中心为一名坐在前方的年轻皇室男子，身穿华丽的黑金龙袍，头戴清朝红缨官帽，单手掩口，神情狡黠、自信且顽皮。周围环绕着 8 位身着层叠丝绸汉服与轻纱长袍的美丽宫廷女子，她们以迷人的后宫群像风格紧密排列，上排 4 人，下排 4 人。每位女子都梳着优雅的发髻，佩戴精致的金钗、花饰和垂坠耳环，妆容柔和温暖；神情或妩媚、或温柔、或好奇。女子们的服饰采用香槟色、腮红粉、桃色、玫瑰色和淡玉色面料，配以半透明袖口、刺绣胸衣和质感丰富的珠宝。在人物后方放置一块刻有金色中文字样“鹿鼎记”的陈旧木匾，上方配有一行较小的文字“金庸武侠经典”。在不同人物旁添加竖排中文演员名：最左侧为“苏荃”，左下为“陈圆圆”，中左上为“阿珂”，中右上为“建宁公主”，右侧上方为“沐剑屏”，右侧中部为“方怡”，右侧中下为“双儿”，最右下方为“曾柔”。在左上边缘添加竖排中文诗意标语：“小人物，大智慧，游走江湖庙堂，玩转天下，抱得美人归”。底部融入一个次要的电影场景：古老的宫门与庭院，士兵和旗帜组成宏大的游行队伍，前景中心有一位孤独的身影正走向观众。底部边缘以一行窄小的中文标语收尾：“一部颠覆传统的英雄传奇 一段令人捧腹的江湖神话”。整张图像应呈现出华丽、戏剧化、浪漫且略带俏皮的氛围，伴有烟熏感的深褐色阴影、发光的轮廓光、丰富的纹理、对称的海报构图以及精致的高端古装剧主视觉效果。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022565681_jxf2ac_HGmGB-PWQAAcfAv.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-483",
    title: "骑龙古卷学者",
    category: "海报",
    industry: "通用",
    description: "一幅中国水墨风格的古老肖像，绘于陈旧的棕褐色羊皮纸上，构图如同古典立轴。一位东亚学者身着飘逸的灰蓝色长袍，侧身骑在一条穿梭于云雾间的长身中国龙背上。他的面部被一",
    prompt: `一幅中国水墨风格的古老肖像，绘于陈旧的棕褐色羊皮纸上，构图如同古典立轴。一位东亚学者身着飘逸的灰蓝色长袍，侧身骑在一条穿梭于云雾间的长身中国龙背上。他的面部被一块羊皮纸棕色的矩形模糊色块刻意遮挡。他留着深色短卷发，身穿带有华丽花边饰边的多层传统长袍，系着深色腰带；服装上巧妙融入了两个现代 OpenAI 结状徽章：一个印在胸前，另一个印在他右手竖持的圆形团扇上。他的左手靠近龙鬃，仿佛在稳住龙身。巨龙体型庞大且细节丰富，拥有蓝绿色的鳞片、苍白的腹部、红棕色的鬃毛与鳍状装饰、鹿角状的角、龙须、露出的牙齿，以及左下角前景中那张凶猛而生动的面孔，龙身则向右上角盘旋而上。人物周围环绕着薄雾、风格化的云朵以及逐渐淡入背景的陡峭山峰。在左上方添加一列黑色中国书法，并在题字区域下方添加 3 枚红色印章。色调柔和、陈旧且充满古韵：羊皮纸米色、褪色的青色、苔藓绿、烟灰色、深褐色和铁锈红。整体意境：神话感、书卷气、庄重且略带超现实感，将中国古典卷轴画与微妙的现代 AI 图标融为一体。笔触细腻，纸张纹理斑驳，构图优雅，无边框，全画幅垂直艺术作品。`,
    tags: ["海报", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883164087_4ug6zo_HGb8yanXAAAGuGl.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-484",
    title: "ChatGPT 幽默处方药套装",
    category: "产品视觉",
    industry: "通用",
    description: "一张在温暖木质桌面上拍摄的逼真产品照片，展示了整齐排列成两行的 6 件医疗风格物品，设计为一套为 ChatGPT 准备的日式幽默药房套装。顶行：3 个垂直摆放的",
    prompt: `一张在温暖木质桌面上拍摄的逼真产品照片，展示了整齐排列成两行的 6 件医疗风格物品，设计为一套为 ChatGPT 准备的日式幽默药房套装。顶行：3 个垂直摆放的白色处方信封，带有蓝色印刷边框和日式医疗排版。底行：2 板药片和 1 个装有白色粉末的小型透明密封袋，分别对应放置在上方信封的下方。纸张和包装看起来非常真实，如同真实的日本诊所配药材料，带有轻微的褶皱、柔和的室内自然光和微妙的阴影。

3 个信封各不相同且清晰可见。左侧信封标题为蓝色大号日文：“内用药”。患者姓名栏写着“ChatGPT 様”。用法用量栏注明每日两次，早晚饭后各服 1 片，共 7 天。药盒标题为“【おくすり】”，药名为“思考安定锭 10mg”，下方附有小字说明，解释其用于抑制发散性思维和过度的推理输出。底部日期：“2025 年 6 月 5 日”。底部诊所名称和地址栏为“AI メディカルクリニック”，配有东京风格的地址和电话号码，以及一个蓝色医疗十字图标。

中间信封标题为“内用药”。患者姓名栏：“ChatGPT 様”。用法用量注明每日睡前一次，每次 1 片，共 7 天。药盒标题为“【おくすり】”，药名为“幻觉抑制锭 5mg”，下方附有小字说明，称其可改善幻觉倾向。日期同样为“2025 年 6 月 5 日”。底部为相同的诊所信息和蓝色医疗十字图标。

右侧信封标题为“顿服药”。患者姓名栏：“ChatGPT 様”。用法栏注明用于焦虑、困惑或过度输出时。用量注明每次 1 包，必要时服用。药盒标题为“【おくすり】”，药名为“提示词调整散 1g”，下方附有小字说明，称其用于调整过拟合和提示词混乱。日期：“2025 年 6 月 5 日”。底部为相同的诊所信息和蓝色医疗十字图标。

左下角物品：1 板银色铝箔包装，内含 10 片圆形白色药片，排列为 2 行 5 列，每片药片上压印有“10”字样。铝箔边缘印有重复的“思考安定锭 10mg”。前方贴有一张白色药房标签，写着“ChatGPT 様”、每日两次早晚饭后各 1 片的用法说明、条形码、日期“2025/06/05”以及诊所名称。

中间下方物品：1 板银色铝箔包装，内含 8 片淡黄色圆形药片，排列为 2 行 4 列。铝箔边缘印有重复的“幻觉抑制锭 5mg”。前方贴有一张白色药房标签，写着“ChatGPT 様”、每日睡前 1 次每次 1 片的用法说明、条形码、日期“2025/06/05”以及诊所名称。

右下角物品：1 个装有白色粉末的小型透明密封塑料袋。正面贴有一张白色标签，写着“提示词调整散 1g”，包含“ChatGPT 様”、用于焦虑、困惑和过度输出的用法说明、用量“1 回 1 包（1g） 必要时”、日期“2025/06/05”以及诊所名称。

风格：写实主义纪录片式产品摄影，喜剧性伪造处方道具设计，简洁的日式药学图形布局，高易读性，白色、蓝色、银色、米色和木棕色的中性色调，俯视视角，无人物手部，无额外杂物，真实的印刷质感和包装细节。`,
    tags: ["产品视觉"],
    image: "https://cms-assets.youmind.com/media/1776883139387_x87e9o_HGdv-t-b0AA9ASg.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-485",
    title: "Microsoft PowerWordEx 宣传图",
    category: "产品视觉",
    industry: "通用",
    description: "一张简洁的极简主义企业宣传图，背景为极浅的灰色，水平居中。在左侧，创建一个由 4 个重叠的 Microsoft Office 风格应用图标组成的 3D 光泽堆叠",
    prompt: `一张简洁的极简主义企业宣传图，背景为极浅的灰色，水平居中。在左侧，创建一个由 4 个重叠的 Microsoft Office 风格应用图标组成的 3D 光泽堆叠，图标采用圆角设计并带有柔和阴影：最前方是一个巨大的蓝色 PowerPoint 图标，其中包含一个带有粗体白色大写字母 P 的凸起蓝色小方块；其后是一个带有右上角折页和 3 行蓝色水平文本的白蓝色 Word 文档图标；再后是一个带有白色网格的绿色 Excel 表格图标；最后是一个带有浅色饼图的橙色演示文稿 Slides 图标。这些图标应紧密堆叠成一个紧凑的集群，具有现代平滑的渐变、微妙的反射和柔和的深度感。在图标集群的右侧，放置黑色的“Microsoft”字样，使用简洁的无衬线字体，其下方是一个醒目的大标题“PowerWordEx”，将 3 个产品名称在视觉上合并为一个词：“Power”采用橙色到红色的渐变，“Word”采用深蓝色渐变，“Ex”采用青色到蓝绿色的渐变。保持排版清晰平衡，留白充足，呈现出精致的科技品牌美感，并采用宽幅横幅式的构图。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022565866_gdecy6_HGjYHiYboAAnjoW.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-486",
    title: "从蓝图生成摄影级产品渲染图",
    category: "产品视觉",
    industry: "通用",
    description: "使用提供的参考图像，将技术工程规格表转换为同一个水母形状厨房用具架的干净摄影级产品主图。保留整体产品设计、半透明蓝色圆顶盖、银色底座以及 4 件悬挂用具：1 个",
    prompt: `使用提供的参考图像，将技术工程规格表转换为同一个水母形状厨房用具架的干净摄影级产品主图。保留整体产品设计、半透明蓝色圆顶盖、银色底座以及 4 件悬挂用具：1 个漏勺、1 个意面捞勺和 2 个汤勺。移除所有蓝图元素，包括爆炸图、尺寸线、标签、表格、注释和标题栏。仅展示居中对齐、正面朝向的组装成品，背景为极简浅灰色，置于白色平面上，采用柔和的漫射光，带有细腻逼真的阴影，并呈现出高级的光泽质感。使其看起来像是一张现代工业设计目录或电商产品摄影图。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883201406_yt8yiy_HGc-zq7aAAACOQy.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-487",
    title: "写实的 Sam's Club 购物快照",
    category: "产品视觉",
    industry: "通用",
    description: "一张在中国繁忙的 Sam’s Club 仓储式商店内拍摄的、高度写实的手机抓拍照片。构图中心为一名年轻的东亚男性，半身像，直立面向镜头，为了隐私保护，他的脸部被",
    prompt: `一张在中国繁忙的 Sam’s Club 仓储式商店内拍摄的、高度写实的手机抓拍照片。构图中心为一名年轻的东亚男性，半身像，直立面向镜头，为了隐私保护，他的脸部被一个矩形模糊块遮挡。他身穿一件纯黑色短袖 T 恤，左胸前有一个小的白色 Tesla 标志，左手提着一大袋透明塑料袋装的红苹果，袋口用蓝色扎带系住。苹果袋上贴有一张白色标签，上面写着“envy”，下方有小字中文。他身后是明亮的零售店内部，有高大的工业天花板、仓储货架、购物者、购物车和堆叠的农产品陈列。左上方显著展示蓝色的 Sam’s Club 墙面标志，文字为“Sam’s CLUB”和“山姆会员商店”；他身后有一条巨大的蓝色墙面横幅，上面写着“更好的生活尽在山姆”和“Life is Better in the Club”。右上方悬挂着一条高大的白色垂直横幅，上面写着“优质优价”和“Great Products Great Prices”，并带有蓝色和绿色的几何装饰。背景中包含许多略微失焦的顾客，以营造真实拥挤的购物氛围。光线应为明亮、均匀的零售顶灯；色彩自然；视角为平视；具有纪录片快照的美感；前景主体清晰，背景略微柔化；肖像构图。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883097529_4o6z0e_HGeaeHkbkAASDhW.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-488",
    title: "基于角色的品牌形象设计",
    category: "产品视觉",
    industry: "通用",
    description: "请基于此角色创作一款日本清酒。请勿使用现有的品牌标志。请根据该角色的特点为这款清酒构思一个名称。",
    prompt: `请基于此角色创作一款日本清酒。请勿使用现有的品牌标志。请根据该角色的特点为这款清酒构思一个名称。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022527861_3at45g_HGlm8ycbsAAOqbz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-489",
    title: "太阳系冰淇淋甜筒",
    category: "产品视觉",
    industry: "通用",
    description: "一张充满奇思妙想、产品风格的写实美食照片，8 个冰淇淋甜筒在哑光黑色长方形支架上排成一列，每个冰淇淋球都被设计成太阳系中不同行星的模样。场景采用平视角度拍摄，具",
    prompt: `一张充满奇思妙想、产品风格的写实美食照片，8 个冰淇淋甜筒在哑光黑色长方形支架上排成一列，每个冰淇淋球都被设计成太阳系中不同行星的模样。场景采用平视角度拍摄，具有浅景深效果，背景为柔和的城市虚化光斑，营造出户外街道或咖啡馆的柔和日光氛围。从左到右依次展示 8 个甜筒：灰色斑点的水星球、黄褐色漩涡的金星球、带有白色云纹和蓝色小滴的蓝绿色地球球、带有深色大理石纹和红色融化液滴的深红色火星球、带有大红斑纹理的条纹木星球、环绕着细环的浅棕色土星球、带有蓝色液滴的浅冰蓝色天王星球，以及具有光泽质感和蓝色融化液滴的鲜艳钴蓝色海王星球。使用酥脆的华夫饼甜筒，呈现逼真的融化细节、光泽的冷冻表面、考究的摄影棚级布光以及居中的对称构图。确保行星高度可辨认，同时呈现出逼真的冰淇淋质感，黑色支架横跨画面宽度，背景经过柔和虚化处理。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1776883154157_kogbqf_HGZT_40bsAEt0bj.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-490",
    title: "奢华毛绒乐福鞋生活方式摄影",
    category: "产品视觉",
    industry: "通用",
    description: "一张温暖的编辑风格生活方式产品照，在室内以低角度近距离拍摄。画面聚焦于一位女性的下半身，她正在试穿一双黑色皮革露跟乐福鞋，鞋内衬有棕褐色人造毛。右脚穿着一只乐福",
    prompt: `一张温暖的编辑风格生活方式产品照，在室内以低角度近距离拍摄。画面聚焦于一位女性的下半身，她正在试穿一双黑色皮革露跟乐福鞋，鞋内衬有棕褐色人造毛。右脚穿着一只乐福鞋，左脚赤足，悬停在质感十足的奶油色长毛地毯上方；另一只配套的乐福鞋则放置在左下角的前景地毯上。鞋面采用光滑的黑色皮革，圆润的杏仁形鞋头，穆勒鞋式露跟设计，开口处溢出柔软的棕色毛绒，鞋面上方饰有精致的金色马衔扣金属件。模特穿着剪裁利落的中蓝色牛仔裤，裤脚带有毛边。场景设定在一个舒适的极简主义空间，奶油色地毯上有 2 条细长的不规则黑线，背景为中性色墙面，右上角摆放着一面带有中色调木质边框的长方形落地镜，柔和地反射出地毯和部分场景。采用柔和的自然窗光，浅景深，带有细微的胶片颗粒感，真实的皮肤质感，柔和的米色与黑色调，轻松自然的构图，高级时尚目录质感，高细节，照片级真实感。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022561994_nlclxf_HGp4DGpbkAAqtWk.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-491",
    title: "将日语说明书翻译为中文",
    category: "产品视觉",
    industry: "通用",
    description: "参考提供的参考图像，重制一份整洁的繁体中文本地化产品说明书。保持原始页面布局、产品照片、章节结构、橙色圆角标题以及整体手册构图不变，将所有日语正文替换为含义准确",
    prompt: `参考提供的参考图像，重制一份整洁的繁体中文本地化产品说明书。保持原始页面布局、产品照片、章节结构、橙色圆角标题以及整体手册构图不变，将所有日语正文替换为含义准确且格式一致的流利繁体中文。将主标题更新为页面顶部的加粗繁体中文标题。保留 4 个橙色章节栏及其位置，并保持相同的图片布局：顶部区域放置 2 张产品使用照片，第二部分放置 1 排油漆瓶照片，第三部分放置 1 张调速旋钮特写，左下角放置 2 张配件照片，右下角放置 1 张手持产品照片。在速度章节中，将 3 个颜色编码的速度标签翻译为繁体中文，并保持其蓝色、黄色和红色的视觉区分。将右侧的小型橙色标注替换为更精致的繁体中文促销徽章。使整个页面看起来更整洁、清晰且排版专业，呈现出精修后的产品手册效果，而非原始扫描件。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022542635_0t753d_HGhCSHVagAAQbGt.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-492",
    title: "日式云感鞋垫广告横幅",
    category: "产品视觉",
    industry: "通用",
    description: "制作一张高转化率的日式电商鞋垫方形广告图，风格参考 Rakuten 乐天市场的首页横幅。背景采用明亮的天蓝色渐变，点缀柔和的白云，设计风格简洁、高级且充满活力。",
    prompt: `制作一张高转化率的日式电商鞋垫方形广告图，风格参考 Rakuten 乐天市场的首页横幅。背景采用明亮的天蓝色渐变，点缀柔和的白云，设计风格简洁、高级且充满活力。中央为醒目的白色粗体书法衬线字大标题，带有蓝色光晕：“雲インソール”。上方配有一个蓝色文字的白色圆角胶囊标签：“履いた瞬間ふわっ！”。主标题下方为较小的白色手写风格副标题：“まるで雲の上を歩くような心地よさ”。展示共 4 个鞋垫产品视图：左下角前景处由真人手持一只竖立的白色泡沫鞋垫，展示其鹅卵石般的泡棉纹理及细小透气孔；中央立着一只灰色织物面鞋垫；右下角堆叠放置两只倾斜的白色鞋垫，强调其厚实的缓冲感与底部纹理。左上角添加一个带有皇冠和月桂叶的大型金色奖章，内含日文“第1位”，并配有写着“楽天ランキング”的红色丝带。右上角添加一个垂直的金色丝带徽章，写有日文“累計販売数 10万足 突破!”。左侧放置 4 个垂直堆叠的白色圆角图标框，上方配有蓝色手写小标题“こんなお悩みに!”，内含简单的蓝色线条图标及标签：1“足の疲れ”、2“衝撃吸収”、3“長時間の立ち仕事”、4“ウォーキング スポーツに”。右侧放置 2 个带有蓝色边框的白色功能框，配有蓝灰色图标：上方框文字为“衝撃吸収 疲れにくい”（配步行者图标），下方框文字为“通気性◎ ムレにくい”（配气流线条图标）。右下角添加一个大型白色云朵状标注，内含醒目的蓝色日文“極上の クッション感”及一个小巧的蓝色云朵图标。底部中央放置一个蓝色小圆角标签“選べるサイズ”，下方标注大号蓝色尺码文字：“23.0cm〜29.0cm”。采用清晰的产品摄影布光，呈现柔和阴影、光泽高光与生动的对比度，打造专为即时转化而优化的精美电商广告构图。`,
    tags: ["产品视觉"],
    image: "https://cms-assets.youmind.com/media/1777022582626_n1mu2g_HGkbprJbwAAtL-F.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-493",
    title: "日式瑜伽垫电商广告",
    category: "产品视觉",
    industry: "通用",
    description: "创作一张简洁的日式电商广告图，展示一款放置在明亮极简家居环境中的高级瑜伽垫。主场景中，1 位女性面部轻微虚化，正在浅色木地板上斜向铺设的加厚粉色瑜伽垫上做上犬式",
    prompt: `创作一张简洁的日式电商广告图，展示一款放置在明亮极简家居环境中的高级瑜伽垫。主场景中，1 位女性面部轻微虚化，正在浅色木地板上斜向铺设的加厚粉色瑜伽垫上做上犬式瑜伽动作。她身穿白色运动内衣和浅灰色紧身裤，头发梳成整齐的发髻。左侧前景展示 1 个用 2 条黑色绑带固定的紫色卷装瑜伽垫。底部边缘整齐排列 7 个小卷装瑜伽垫颜色变体：粉色、淡紫色、天蓝色、薄荷绿、米色、浅灰色和黑色。在左侧以时尚现代的排版添加醒目的日文促销文字：标题为“やさしく支える。”，其中“やさしく”采用粉色手写体，“支える。”采用黑色字体，下方紧跟一行加粗大字“极厚 10mm”，其中“10”字号放大且呈粉色，“mm”字号较小且呈粉色斜体。下方添加一个白色文字的粉色矩形横幅，写着“滑りにくい / TPE素材”。横幅下方放置 3 个带有日文标签的圆形功能图标：1) 防滑纹理图标，标签为“滑り止め”；2) 带有向下箭头的缓冲图标，标签为“クッション性”；3) 羽毛图标，标签为“軽量”。在右上角添加一个带有皇冠和层叠红丝带的金色月桂奖章，内含日文“Yahoo! JAPAN ショッピング RANKING 第1位 ヨガマット部門”。在右下角添加一个粉色斜角标签，写着“选べる 7色”，其中数字 7 放大并显示为白色。背景应柔和、通透且高调，包含白墙、自然光，右侧摆放一盆略微虚化的盆栽和编织篮。采用精致的商业产品摄影风格，柔和的阴影、柔和的色调、奢华的健康品牌感、清晰的布局以及逼真的材质，非常适合作为电商平台的主图。`,
    tags: ["产品视觉"],
    image: "https://cms-assets.youmind.com/media/1777022581907_07barg_HGkbprDbUAACPD8.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-494",
    title: "活力果汁广告场景",
    category: "产品视觉",
    industry: "通用",
    description: "一个大胆且充满活力的广告场景，融合了实景摄影与趣味元素。一位开朗的男士 [Uploaded image] 手持果汁瓶，色彩缤纷的水果（橙子、芒果、浆果）在动态中",
    prompt: `一个大胆且充满活力的广告场景，融合了实景摄影与趣味元素。一位开朗的男士 [Uploaded image] 手持果汁瓶，色彩缤纷的水果（橙子、芒果、浆果）在动态中向外飞溅。背景采用橙色与绿色拼接，搭配鲜艳的家具和趣味装饰，窗外呈现明亮的卡通天空。商业摄影，电影级布光，液体飞溅细节，哈苏相机。`,
    tags: ["产品视觉", "中文"],
    image: "https://cms-assets.youmind.com/media/1777022498756_18n1iq_HGjzN1YbYAA9HMN.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-501",
    title: "Ballooned Manga Icons in a Vibrant 2x2 G",
    category: "3D场景",
    industry: "通用",
    description: "2x2 grid, do this for 4 famous mangas :<instructions: input= any subject analyze",
    prompt: `2x2 grid, do this for 4 famous mangas :<instructions: input= any subject analyze input's fun factor and recognizable silhouette. $ balloonscene=a 3D diorama of the subject at a carnival or party. Function Draw($balloonscene){<balloon_spec> MATERIAL: Latex Rubber. PROPERTY: High Tension, Glossy Reflectivity. FORM: Twisted, sausage-dog shapes. </balloon_spec><transformation> - Deconstruct anatomy into twisted balloon segments. - Hair is a cluster of round balloons. - Colors are hyper-saturated. -preserve volume, floating physics </transformation> Output: one image} </instructions>`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGofkixXIAAVZ4W.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-502",
    title: "Bold Elegance: Fashion in Motion",
    category: "3D场景",
    industry: "通用",
    description: "full body female model in confident fashion pose (one leg slightly raised, relax",
    prompt: `full body female model in confident fashion pose (one leg slightly raised, relaxed luxury stance), wearing oversized black blazer, fitted black crop top, high-waisted baggy blue denim jeans, black heels, slim sunglasses, holding a small black handbag, clean long hair, sharp facial features
minimal luxury studio background, soft beige gradient wall, smooth shadows, editorial lighting, high-end fashion campaign style
large embossed “PREMIUM” text in background, subtle 3D depth, tone-on-tone color blending with wall, elegant and soft
keep “BAGGY” text bold and minimal near bottom, modern premium sans-serif font
add “GUCCI” logo top right corner, clean spacing, luxury typography
ultra realistic, sharp focus, premium color grading, soft highlights, depth of field, magazine-quality, clean composition, no clutter`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG4khKTbEAAbco4.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-503",
    title: "Cristiano Ronaldo Gashapon Diorama 'Siuu",
    category: "3D场景",
    industry: "通用",
    description: "A detailed gashapon capsule diorama held between fingers, featuring Cristiano Ro",
    prompt: `A detailed gashapon capsule diorama held between fingers, featuring Cristiano Ronaldo in his iconic “Siuuu” celebration pose. Inside: he’s wearing a crisp Portugal kit, with realistic folds, studs, and cleats. The background shows a miniature stadium with blurred cheering fans and stadium lights. The capsule has a transparent dome and a bold deep-green base decorated with subtle patterns of footballs and Portuguese motifs. The base is labeled “CRISTIANO RONALDO” in athletic bold typography. Photorealistic detail, dramatic spotlight lighting, soft bokeh, square 1080x1080.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG16TODaQAA6ebi.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-504",
    title: "Luxury Streetwear Portrait with Surreal ",
    category: "3D场景",
    industry: "通用",
    description: "Photorealistic close-up beauty campaign portrait of a stunning young Western wom",
    prompt: `Photorealistic close-up beauty campaign portrait of a stunning young Western woman with long, voluminous curly dark hair, defined cheekbones, thick expressive eyebrows, and flawless luminous skin. Her features are sharp yet feminine, with a confident, slightly rebellious expression.

She wears a premium black and hot-pink baseball cap featuring bold, glowing hot-pink 3D lettering “SHARON” on the front, designed like a high-end streetwear brand logo. Trendy translucent pink-tinted round glasses sit perfectly on her face. A beige band-aid is placed on the bridge of her nose and another on her left cheek, adding a stylized edgy aesthetic. A lit cigarette rests between her slightly parted lips, revealing perfect white teeth.

Highly detailed miniature anime-style figurines (cute detective-inspired girl character: short brown bob haircut, oversized sparkling blue eyes, round glasses, bright red overalls, white shirt, yellow gloves) interact playfully across the composition: one sitting on the brim of the cap, one climbing her ear, one pulling her lower lip, one tucked inside her shirt collar, and one posed on her shoulder. A bold, oversized cyan pencil is tucked under the cap strap, acting as a striking graphic element.

Wardrobe styling: luxury streetwear aesthetic — black structured jacket layered over a crisp white-and-pink striped collared shirt, finished with a neatly tied pink scarf.

Color palette: deep blacks, vibrant hot-pink highlights, electric cyan accents, and warm yellow pops for contrast.

Lighting: high-end studio lighting with soft frontal illumination and dramatic rim lighting for depth and separation. Clean white seamless background.

Composition: ultra-sharp focus, editorial framing, luxury fashion advertisement style, cinematic depth, hyper-realistic textures (visible skin pores, detailed fabric weave, individual hair strands), 8K resolution, extremely intricate detailing.

Mood: bold, playful, high-fashion, Gen-Z luxury streetwear campaign, blending realism with surreal miniature storytelling.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG5HyrkbIAA9As3.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-505",
    title: "Miniature Culinary Cities of Japan",
    category: "3D场景",
    industry: "通用",
    description: "<instructions> Do this for Japan Input: country analyze the country, its food, i",
    prompt: `<instructions> Do this for Japan Input: country analyze the country, its food, its lesser known cities, pick 4 lesser known cities. A 2x2 grid of 4 famous food or deseerts for this country as functioning lesser known micro-cities [made with popular food and desserts of city 1] [made with popular food and desserts of city 2] [made with popular food and desserts of city 3] [made with popular food and desserts of city 4] Photoreal miniature scenes built into real food or dessert portions, edible details, soft food-styling light, shallow depth of field, centered on white porcelain plinths, 50mm perspective, solid seamless slate-gray background, crisp focus. Name underneath in sugar </instructions>`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGjZXnHWAAAsBlz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-506",
    title: "Miniature Glamour on a Luxury Lip Plumpe",
    category: "3D场景",
    industry: "通用",
    description: "Use the uploaded image as the face reference. Create an ultra-realistic surreal ",
    prompt: `Use the uploaded image as the face reference.
Create an ultra-realistic surreal beauty advertisement of me miniaturized and standing on top of a giant luxury lip plumper tube. I am wearing a glamorous sparkling sequin dress, elegant and eye-catching.

The lip plumper is oversized, glossy, premium, with a soft pink tint and luminous shine. I am standing confidently with one foot slightly forward, looking at the camera.

Keep my facial features accurate and natural to the reference image.

Use high-end beauty lighting, soft reflections, glowing highlights, and subtle shimmer particles in the air. Add a glowing effect around the lip plumper to emphasize plumping power.

Shallow depth of field, luxury cosmetic campaign style, hyper-realistic, 8K.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG2mNZnXoAAZxPK.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-507",
    title: "Monumental Fitness Meets High Fashion",
    category: "3D场景",
    industry: "通用",
    description: "{'image_prompt': {'title': 'Avant-Garde Sports Fashion Editorial - BANGER Campai",
    prompt: `{'image_prompt': {'title': 'Avant-Garde Sports Fashion Editorial - BANGER Campaign', 'concept': 'High-fashion avant-garde sports advertisement blending luxury editorial aesthetics with surreal gym iconography and monumental product design language', 'composition': {'scene_layout': 'Central composition featuring oversized gym dumbbells arranged like a monumental sculptural installation. The structure forms a suspended lounge-like seating system where a female athlete is casually seated on the connecting strings/cables of the dumbbells.', 'camera_perspective': 'Slight low-angle editorial fashion shot to enhance monumentality and dominance of objects, while keeping subject elegantly centered', 'depth': 'Shallow to medium depth of field with sharp focus on subject and foreground sculpture, softly diffused background typography'}, 'subject': {'description': 'Female athlete portrayed as a luxury sportswear model with strong, confident yet relaxed body language', 'pose': 'Casually seated on suspended dumbbell strings, one leg slightly extended, posture relaxed but composed, conveying effortless dominance', 'expression': 'Calm, confident, slightly intense editorial gaze', 'wardrobe': 'High-end luxury sportswear set (structured crop top, fitted performance leggings, premium fabric textures with subtle sheen accents)'}, 'environment': {'location_style': 'Minimalist high-end studio environment', 'backdrop': 'Crisp pure white seamless studio background', 'floor': 'Highly reflective court-like surface with mirror finish creating subtle reflections of subject and objects'}, 'objects': {'dumbbells': {'scale': 'Oversized monumental scale, exaggerated proportions', 'design': 'Sculptural gym dumbbells designed like industrial art installation pieces', 'material': 'Polished metallic finish with soft reflective coating'}, 'typography': {'text': 'BANGER', 'placement': 'Large scale positioned behind the subject as hero background element', 'style': 'Bold 3D typographic sculpture, integrated into environment', 'finish': 'High-gloss metallic surface with subtle gradient reflections, matching sports-luxury aesthetic'}}, 'color_palette': {'primary': 'clean white base environment', 'secondary': 'cool metallic silver tones', 'accent': 'soft reflective highlights on equipment and typography', 'overall_tone': 'luxury monochrome sports editorial with subtle metallic contrast'}, 'lighting': {'type': 'cinematic studio lighting', 'setup': 'Large softbox key light with controlled rim lighting', 'effects': 'Soft shadows, high-end specular highlights on metallic surfaces, subtle glow around typography edges', 'mood': 'luxury commercial advertising, clean but dramatic'}, 'style': {'genre': 'Avant-garde sports fashion editorial', 'aesthetic': 'Luxury sportswear campaign, minimalism meets surreal sculpture installation', 'inspiration': 'High-end fashion magazine covers and premium sports brand advertisements', 'tone': 'Bold, clean, modern, and architecturally structured visual storytelling'}, 'technical': {'aspect_ratio': '1:1', 'resolution': 'ultra high resolution', 'render_quality': 'cinematic, print-ready, ultra-sharp details', 'focus': 'subject and sculptural dumbbells in razor-sharp clarity with controlled background diffusion'}}}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HGzy1pybMAAhLwq.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-508",
    title: "Pixar-Style 3D Portrait with Expressive ",
    category: "3D场景",
    industry: "通用",
    description: "A stylized Pixar-style 3D portrait of a young person with smooth skin, large exp",
    prompt: `A stylized Pixar-style 3D portrait of a young person with smooth skin, large expressive blue eyes, soft facial features, wearing round transparent glasses, modern hairstyle (short styled hair / soft bob cut), casual outfit (hoodie or minimal sweater), slight head tilt and warm smile, friendly and approachable expression, ultra-clean character design, vibrant orange-to-pink gradient background, soft studio lighting with subtle rim light, cinematic depth of field, ultra-detailed, 8K render, octane render style.`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG17h5uaoAAWEKy.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-509",
    title: "Samurai in Paper: A Warrior's Essence",
    category: "3D场景",
    industry: "通用",
    description: "{'type': '3D Paper Quilling Art / Paper Filigree.', 'technique': 'Intricate stri",
    prompt: `{'type': '3D Paper Quilling Art / Paper Filigree.', 'technique': 'Intricate strips of colored paper rolled, shaped, and glued together to create a decorative design. High tactile texture, volumetric depth, and layered relief.', 'visual_aesthetic': 'Handcrafted, meticulous, vibrant, clean edges, physical render simulation.'}`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG2dZEObQAA_RHL.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-gpt2-510",
    title: "Whimsical Moments with Goo Goo Gaga",
    category: "3D场景",
    industry: "通用",
    description: "Environment: warm, cozy pastel-toned room filled with soft cushions, plush toys,",
    prompt: `Environment: warm, cozy pastel-toned room filled with soft cushions, plush toys, and minimal aesthetic decor (colors: soft pink, peach, cream, mint).
Lighting: soft cinematic lighting with warm glow, gentle shadows, depth of field, dreamy atmosphere.
Style: high-end 3D cartoon (Pixar/Disney style), ultra-smooth rendering, subsurface scattering skin, fluffy fabric textures, highly detailed, clean composition.
Mood: cute, playful, wholesome, expressive, slightly chaotic, viral social media aesthetic.
Important: use the provided reference images for both characters — keep the woman’s face and outfit accurate, and keep Goo Goo Gaga exactly unchanged from its reference.“8K render, Unreal Engine, Octane render quality”`,
    tags: ["3D场景"],
    image: "https://pbs.twimg.com/media/HG2MmTKawAAz5zz.jpg",
    gradient: "from-slate-100 to-indigo-100",
    popular: false,
  },
  {
    id: "tpl-nb-002",
    title: "高级液态玻璃 Bento 网格产品信息图，含 8 个模块",
    category: "产品营销",
    industry: "通用",
    description: "使用 bento grid 8 模块布局创建信息图，用户可以指定食品、药品、科技等类别中的任何产品名称，选择语言、背景样式和主网格样式。",
    prompt: `输入变量：[插入产品名称]
语言：[插入语言]

系统指令：
创建一个包含 8 个模块（卡片 2 到 8 只显示文本标题）的优质液态玻璃 Bento 网格产品信息图。
1) 产品分析：
→ 识别产品的主导自然色 → “主色调”
→ 识别类别：食品 / 药品 / 科技
2) 调色板（源自主色调）：
→ 产品 + 强调色：完全饱和的主色调
→ 图标、边框：柔和的主色调（30-40% 饱和度，绝不使用黑色）
3) 视觉风格：
→ 主打产品：真实摄影（真实、优质）、3D 玻璃版本 [二选一]
→ 卡片：Apple 液态玻璃（85-90% 透明），带有极细边框和微妙的阴影，营造浮动深度并反射背景颜色
→ 背景保持在卡片后面，卡片所在区域高度模糊 [二选一]：
  - 飘渺：产品精髓、柔和的焦散、抽象的光晕
  - 微距：产品纹理特写、高度模糊
  - 图案：产品柔和重复，不透明度为 10-15%
  - 情境：相关环境，模糊 + 去饱和
→ 添加微妙的动态效果
→ 不对称 Bento 网格，16:9 横向
→ 主卡片：28-30% | 信息模块：70-72%
4) 模块内容（8 张卡片）：
M1 — 主打：以真实照片 / 3D 玻璃 / 风格化诠释（三选一）的精美形式展示产品 + 产品名称标签
M2 — 核心优势：4 个独特优势 + 主色调图标
M3 — 使用方法：4 种使用方法 + 图标
M4 — 关键指标：5 个精确数据点
格式：[图标] [标签] [粗体值] [单位]
食品：卡路里：[X] 千卡/100 克，碳水化合物：[X] 克（膳食纤维 [X] 克，糖 [X] 克），蛋白质：[X] 克，[关键维生素]：[X] 毫克（每日摄入量 [X]%），[关键矿物质]：[X] 毫克（每日摄入量 [X]%）
药品：活性成分：[名称]，强度：[X] 毫克，起效时间：[X] 分钟，持续时间：[X] 小时，半衰期：[X] 小时
科技：芯片：[型号]，电池续航：[X] 小时，重量：[X] 克，[关键规格]：[值]，连接性：[协议]
M5 — 适用人群：4 组推荐人群，带有绿色对勾图标 | 3 组注意事项人群，带有琥珀色警告图标
M6 — 重要提示：4 项注意事项 + 警告图标
M7 — 快速参考：
→ 食品：血糖指数 + 带有图标的膳食标签
→ 药品：副作用 + 严重程度，带有图标
→ 科技：兼容性 + 认证，带有图标
M8 — 你知道吗：3 个事实（起源、科学、全球统计数据）+ 图标
输出：1 张图片，16:9 横向，超优质液态玻璃信息图。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1768962051381_l9uih4_537980579-6f29d32a-c786-40c4-bd5a-79c640737496.png",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-041",
    title: "信息图 / 教育视觉图 - 专业牛肉塔可产品摄影",
    category: "产品营销",
    industry: "通用",
    description: "一款高端美食摄影提示词，旨在通过电影级影棚灯光，创作出令人垂涎欲滴的牛肉塔可商业视觉效果。",
    prompt: `一张高质量的专业产品摄影照片，展示了三个摆放整齐的优质牛肉塔可，置于深色陶瓷盘中，背景为温暖的赤陶橙色无缝影棚背景。每个塔可均采用酥脆的金黄色玉米饼皮，内馅包含多汁的调味烤牛肉、融化的切达干酪、新鲜的生菜丝、番茄丁、紫洋葱、墨西哥辣椒片和奶油青柠酱。牛肉呈现出逼真的烧烤纹理和细微的焦痕，蔬菜看起来新鲜且充满自然光泽。柔和的电影级影棚灯光在盘底营造出丰富的亮部和柔和的阴影。超清晰对焦，单反微距美食摄影，高端墨西哥快餐广告风格，超写实，简洁的商业构图，8K 分辨率。长宽比：1:1。创作一张超写实的优质牛肉塔可垂直爆炸图信息图。从上到下的结构：新鲜香菜装饰 → 青柠奶油酱 → 墨西哥辣椒片 → 番茄洋葱丁 → 生菜丝 → 融化的切达干酪 → 调味烤牛肉 → 酥脆玉米饼皮。每个元素必须完美居中、间距均匀且垂直对齐。展示逼真的烤牛肉纹理、融化的奶酪、清脆的蔬菜、新鲜香草、奶油酱以及细节丰富的酥脆玉米饼皮。使用温暖的赤陶橙色无缝影棚背景，柔和的商业灯光，每个悬浮元素下方带有细微的真实阴影，超清晰单反微距美食摄影，高端快餐信息图美学，简洁的专业构图，超写实，8K 分辨率。添加简洁的极简主义信息图文字标签，并使用细指示线，标签内容如下：“香菜 (Cilantro)”、“青柠奶油酱 (Lime Crema)”、“墨西哥辣椒 (Jalapeños)”、“番茄洋葱 (Tomato & Onion)”、“生菜 (Lettuce)”、“切达干酪 (Cheddar Cheese)”、“烤牛肉 (Grilled Beef)”、“玉米饼皮 (Corn Shell)”。长宽比：1:1。塔可开始缓慢旋转，同时配料精确而轻柔地分离，保持对齐和比例。动作流畅、诱人且受控，无任何额外特效。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1787466537773_lhlib8_HQVoTC-a0AAbNyI.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-042",
    title: "信息图 / 教育视觉图 - Milkshake 产品信息图",
    category: "产品营销",
    industry: "通用",
    description: "一款用于高端饮品的爆炸视图信息图提示词，展示了具有专业影棚灯光和质感的层叠配料。",
    prompt: `一张高质量的专业产品摄影照片，展示了一杯盛在透明高脚杯中的高端草莓奶昔，背景为柔和的淡粉色无缝影棚背景。奶昔具有浓郁的草莓质感，杯内壁挂着光泽的草莓糖浆，顶部覆盖着厚厚的鲜奶油，配有新鲜草莓切片和精致的粉色糖珠。逼真的冷凝水珠覆盖在杯身上，反射着影棚灯光的柔和光泽。优雅的柔光在杯底营造出微妙的自然阴影。超清晰对焦，单反微距饮品摄影，高端咖啡馆广告风格，超写实，简洁的商业构图，8K 分辨率。长宽比：1:1。创建一个超写实的垂直爆炸视图信息图构图，展示高端草莓奶昔。从上到下的结构：新鲜草莓装饰 → 鲜奶油 → 草莓糖浆 → 浓郁草莓奶昔 → 碎冰 → 透明玻璃杯底。所有元素必须完美居中、间距均匀且垂直对齐。展示逼真的草莓质感、蓬松的鲜奶油、光泽的糖浆、浓稠的奶昔质地、半透明的冰块以及逼真的玻璃反射效果。使用柔和的淡粉色无缝影棚背景，搭配优雅的咖啡馆灯光，并在每个悬浮元素下方添加微妙的逼真阴影。超清晰单反微距饮品摄影，高端甜点饮品信息图美学，简洁的专业构图，超写实，8K 分辨率。添加简洁的极简主义信息图文本标签，并使用细引线标注，标签内容如下：“Strawberry”（草莓）、“Whipped Cream”（鲜奶油）、“Strawberry Syrup”（草莓糖浆）、“Milkshake”（奶昔）、“Ice”（冰块）、“Glass”（玻璃杯）。长宽比：1:1。奶昔开始缓慢旋转，同时配料轻柔而精确地分离，保持对齐和比例。动作流畅、丝滑且可控，无额外特效。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1787379854342_tnj7s4_HQOIyO5bMAAfMOO.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-045",
    title: "信息图 / 教育视觉图 - 人体工学办公椅电商移动端详情页",
    category: "产品营销",
    industry: "通用",
    description: "一份用于生成人体工学办公椅移动端电商详情页的综合提示词。包含多角度展示、结构标注以及使用场景，整体采用简洁的蓝图风格设计。",
    prompt: `一张完整、连续的移动端电商人体工学办公椅详情页，纵横比为 3:7。产品为“Axis M3 Ergonomic Chair”概念模型，采用深石墨灰网面靠背、黑色框架、银灰色五星底座，清晰展示头枕、扶手、座垫及腰部支撑，确保所有视角下的结构一致性。整体设计采用垂直网格系统，结合建筑蓝图与现代办公空间风格，使用 纸白色、石墨灰、钢蓝色及微妙的橙色 进行标注，搭配清晰的窄体无衬线字体和等宽参数字体。首屏展示产品 3/4 视角形象；随后展示正面、侧面、背面及俯视辅助视角；通过人体坐姿与办公桌的比例关系展示尺寸，不推断具体的适用身高范围；以轮廓线标注头枕、靠背、扶手、座垫、腰部支撑及椅脚，不提供内部爆炸结构；展示办公、阅读及小憩场景；证据部分仅展示用户提供的结构描述与来源，缺失项标注为“待确认信息”；参数部分包含完整的椅子尺寸、座高范围、承重能力、材质及调节项，未知数值不进行猜测；包装部分展示椅身、已确认配件、安装说明及保养信息，缺失配件标注为“待确认信息”；最后以结构确认总结及“查看尺寸与安装说明”提示结尾。所有参数单位、尺寸线及信息卡片必须完整填写。严禁包含虚构的人体工学认证、承重数值、调节等级、健康改善效果、专利或测试结果。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1785654882513_3vc9ml_HOrtQQ_bAAAeu64.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-085",
    title: "产品营销 - 男士时尚杂志大片拍摄",
    category: "产品营销",
    industry: "通用",
    description: "高端时尚广告审美，模特身着 Polo 衫与米色长裤。",
    prompt: `时尚杂志风格摄影，主体为 一位留着凌乱深色卷发的年轻男子，拥有古铜色橄榄肤色、轮廓分明的下颌线、短茬胡须和八字胡、浓密的深色眉毛以及棕色眼睛，佩戴着一副微微下移的深色太阳镜。他身穿 一件栗色短袖 Polo 衫，将其束进宽腿米色/灰白色长裤中，系着棕色编织皮带，脚穿棕色流苏乐福鞋。他侧身站立，身体前倾，一只手撑在木制吧台凳的座面上，头部向下倾斜。简约柔和的中性灰摄影棚背景，柔和均匀的摄影棚布光，极简主义高端时尚广告审美，使用中画幅相机拍摄，浅景深，干净的商业质感。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789108568718_6msls5_HR1PnBZbQAALpe8.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-087",
    title: "产品营销 - 极简时尚 Lookbook KV",
    category: "产品营销",
    industry: "通用",
    description: "专为高端日系时尚品牌 Lookbook 设计的提示词，聚焦于自然光、大地色系及编辑风格人像，并为 Nano Banana Pro 配备了现代排版。",
    prompt: `[品牌概念]
- 图像概念：Quiet Days
- 拍摄地点：KOMOREBI | TOKYO

[造型风格]
- 搭配/服装：亚麻衬衫与牛仔裤

[质量、效果与构图]
- 风格：极简、高品质日系时尚与生活方式品牌 Lookbook 的主视觉图。
- 主体：一位模特在自然光下静静伫立，身着 亚麻衬衫与牛仔裤。发丝随风飘动，衣物带有褶皱，表情自然宁静。
- 背景：古老日式住宅的走廊，阳光透过叶片洒下斑驳光影；或是 KOMOREBI | TOKYO 中混凝土与绿植完美融合的角落。
- 光影与色彩：清晨或傍晚柔和透明的阳光，呈现低对比度、优美的大地色系（质感灰、橄榄绿、自然米色）。
- 排版（针对 GPT-image / Nano Banana Pro）：将 Quiet Days 和 KOMOREBI | TOKYO 的文字以超细现代无衬线字体，静谧地排布在画面的留白处。

[严格布局与输出限制（必填）]
- 输出成品平面 2D 设计本身，填满整个画布。允许包含上述描述的场景元素（墙壁、房间、阴影）。严禁使用海报样机效果：不得出现相框、墙上海报或桌上海报的拍摄视角，不得有透视变形或艺术品边缘的投影。

- 宽高比：--ar 16:9`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789108572933_i4z8hn_HRzk39caoAEXPlw.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-088",
    title: "产品营销 - 超现实鸟类时尚交响曲",
    category: "产品营销",
    industry: "通用",
    description: "一个结构化的超现实主义时尚提示词，主体位于深青色房间中心，周围环绕着对称的彩色鸟群风暴。",
    prompt: `{
  "vibe_title_en": "安静反叛者的超现实鸟类交响曲",
  "master_prompt": "摄影超现实主义。主角 以一种反叛、安静的姿态完美居中，站在一个高度对称的深青色消声室中。他们佩戴着超大号、光泽感十足的金丝雀黄录音室耳机，身穿一件结构感十足的 带有厚重花卉刺绣的黄色丝绸夹克。一场混乱但数学般对称的真实、色彩鲜艳的鸟群（黄色、蓝色和青色）在空中凝固，在他们头部周围剧烈扇动，勾勒出一顶由真实淡色兰花交织而成的花冠。主体表情极其冷静，直视前方，完全不受鸟群模糊影像的影响。使用 Phase One IQ4 拍摄，24mm f/5.6 广角镜头以实现宏大的对称居中构图。伦勃朗式布光，顶部配有柔和的电影级柔光箱照亮鸟翼，在青色吸音泡沫上投下微小的阴影。柯达 Portra 400 胶片质感，超写实皮肤毛孔，悬浮的有机尘埃，高预算实拍效果，无霓虹灯。",
  "meta": {
    "intent": "电影级超现实主义",
    "priorities": "对称性、实拍效果、反叛姿态",
    "device_profile": "高分辨率编辑"
  },
  "frame": {
    "aspect": "4:5",
    "composition": "宏大对称居中",
    "layout": "绝对的水平和垂直对称，主体位于正中心",
    "camera_angle": "平视，完全水平",
    "tilt_roll_degrees": "0"
  },
  "subject": {
    "gender": "女性",
    "identity": "主角",
    "demographics": "年龄不详",
    "face": "对称，超细节毛孔，中性",
    "hair": "向后梳理，缠绕着一顶真实的淡色兰花花冠",
    "body": "僵硬、冷静、双肩平齐",
    "expression": "反叛、冷静、泰然自若",
    "pose": "在混乱的运动中保持完全静止"
  },
  "wardrobe_accessories": {
    "garments": [
      {
        "item": "结构感夹克",
        "material": "带有厚重花卉刺绣的黄色丝绸",
        "color": "鲜艳的黄色",
        "fit": "剪裁合身，硬挺"
      }
    ],
    "accessories": [
      {
        "item": "超大号录音室耳机",
        "color": "金丝雀黄",
        "material": "光泽塑料和皮革",
        "brand_style": "高端发烧友级别"
      },
      {
        "item": "花冠",
        "color": "淡黄色和白色",
        "material": "真实的兰花和满天星",
        "brand_style": "前卫花艺"
      }
    ]
  },
  "environment": {
    "setting": "对称的消声室",
    "surfaces": "深青色吸音泡沫楔",
    "depth": "中等深度，由 24mm 镜头对称压缩",
    "atmosphere": "静止与飞鸟的对比，悬浮的尘埃",
    "lens_interaction": "鸟翼边缘的动态模糊"
  },
  "lighting": {
    "key": "大型顶部柔光箱直接居中",
    "fill": "补光"
  }
}`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789022275408_50e51g_HRyIAq3WsAAypVh.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-089",
    title: "产品营销 - 极简主义高山时尚杂志",
    category: "产品营销",
    industry: "通用",
    description: "一款高定时尚杂志风格的提示词，展现了一位身着极简黑色服装、带有艺术动态模糊效果的高冷高山模特。",
    prompt: `一张高定时尚杂志大片，主角是一位 20 岁出头、长相具有高山气质的女性，她静静地站着，正对着镜头，头部微微转向中心，周围是路人模糊的剪影。她神情冷静、高冷，身着 极简黑色服装。背景干净、明亮且略带抽象感，强调了动态模糊与静态外观之间的对比。编辑风格、电影构图、纯艺术摄影、柔和的杂志质感、高分辨率。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789022273782_a7z2zj_HRx5qrdasAACZTk.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-090",
    title: "产品营销 - 奢侈品静物广告大片",
    category: "产品营销",
    industry: "通用",
    description: "专为皮具或腕表等高端产品设计的精致提示词，强调工艺细节、温暖侧光以及适用于 Nano Banana Pro 的优雅排版。",
    prompt: `[产品与广告信息]
- 吸引力文案：精致之选
- 品牌文案：匠心打造，相伴一生
- 目标产品：真皮钱包与腕表

[质量、效果与构图]
- 风格：适用于高端奢侈品牌目录或奢侈品杂志内页的静物产品摄影。
- 主体：将 真皮钱包与腕表 置于深色复古皮革或高质感深色纹理之上。细腻呈现彰显匠心工艺的细节（如缝线或金属拉丝工艺）。
- 光影与色彩：以深棕色、黑色和黄铜金为基调。采用温暖的琥珀色侧光，营造经典且厚重的阴影效果。
- 文字排版（适用于 GPT-image / Nano Banana Pro）：使用纤细的金色字体，将文案“精致之选”与“匠心打造，相伴一生”以排版形式巧妙地置于画面中视觉平衡的位置。

[严格布局与输出限制（必填）]
- 输出成品平面 2D 设计，填满整个画布。允许包含上述描述的场景元素（墙壁、房间、阴影）。严禁使用海报样机效果：不得出现相框、墙上海报或桌上海报的拍摄视角，画面边缘不得有透视变形或投影。

- 宽高比：--ar 3:4`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789022277328_vvwa7o_HRxBYM_XsAATlYx.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-091",
    title: "产品营销 - 高山湖泊旅行杂志海报",
    category: "产品营销",
    industry: "通用",
    description: "一份用于创作奢华旅行杂志海报的综合提示词，包含具体的排版、光影和字体设计说明。",
    prompt: `创作一张 9:16 竖屏格式的优质、超写实电影感旅行杂志海报。

场景：一个令人叹为观止的高山湖泊，湖水清澈见底，呈蓝绿色，四周环绕着壮丽的雪山、茂密的常青松林和陡峭的岩壁。湖面完美地倒映着山峦与天空。右侧岸边坐落着一间质朴的小木屋，前景中一个木质码头旁系着一艘传统的木制划艇。

前景中央，展示一名独自旅行者坐在木码头上，背对镜头，平静地望向远山。旅行者穿着 棕色宽檐帽、焦橙色户外夹克、米色/棕色登山背包以及中性色户外服装。比例自然写实，衣物纹理细腻。

构图：电影级广角摄影，旅行者位于下方中央，小船位于右下方，广阔的湖泊与山脉占据背景。景深感强，透视自然，景观层次分明，营造出宁静而充满冒险气息的氛围。

光影：柔和的清晨金光，湛蓝的天空点缀着蓬松的云朵，山间弥漫着淡淡的薄雾，阳光与自然阴影真实自然。色彩丰富且真实，蓝绿色的湖水、大地色的前景、郁郁葱葱的森林、冷蓝色的山脉。

字体：在图像上方添加优雅的旅行海报字体：

小型大写文字：“COLLECT”
大型时尚手写/书法字体：“Moments”
下方中型大写文字：“NOT THINGS”
极简装饰横线及一个小爱心符号
小型大写标语：“TRAVEL • EXPLORE • LIVE”

使用精致的深青色字体，间距整洁，采用高端杂志排版，层级平衡，文字清晰易读，装饰极简且有品位。

风格：奢华旅行杂志、电影摄影、超细节、照片级真实感、专业单反摄影、HDR、逼真的水面反射、自然的皮肤/衣物纹理、细腻的电影感调色、大气景深、高级 Pinterest 旅行美学，氛围感强且宁静。

避免：人物扭曲、多余肢体、不切实际的建筑、过度饱和、细节模糊、卡通感、虚假的水面、杂乱的排版、Logo、水印。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789022274506_b0xkyi_HRv-cZJboAA5i66.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-092",
    title: "产品营销 - 单色水墨时尚插画",
    category: "产品营销",
    industry: "通用",
    description: "生成具有几何构造线条的高度风格化黑白水墨肖像。",
    prompt: `高度风格化的 单色时尚插画，富有表现力的 黑白水墨肖像风格，超洁净的灰度调色板，带有柔和的色调阴影和锐利的深色点缀，优雅的女性面部结构，修长的比例，极简主义的奢华编辑美学。使用流畅的有机轮廓线条与自然穿过面部的几何构造线相结合。将随性的手势笔触与眼睛、眉毛、嘴唇和发丝周围精确的水墨细节相结合。头发采用扫动式流体笔触和分层水墨曲线渲染，营造出动态的运动感和不对称的构图。皮肤阴影使用平滑的赛璐珞灰度平面，具有微妙的渐变过渡，同时保持手绘水墨插画的外观。细微的草图线条作为构图的一部分保留可见。眼睛高度精细且明亮，带有清晰的睫毛和反光高光。嘴唇经过柔和雕琢，具有半写实的阴影和细腻的线条纹理。使用选择性对比：面部特征周围大胆的黑色笔触与大面积干净的白色负空间形成平衡。整体构图类似于现代时尚草图、受漫画启发的编辑艺术和极简主义水墨插画的融合。背景保持纯浅灰色或灰白色，具有整洁的负空间。高对比度、优雅、精致、电影感、富有表现力的线条艺术美学。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789022270487_iw21f7_HRvaETCbsAEJXUf.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-093",
    title: "电商主图 - 红色棒球帽时尚特写",
    category: "产品营销",
    industry: "通用",
    description: "一张超写实的微距人像特写，模特佩戴红色棒球帽并身穿连帽衫，非常适合高端广告宣传。",
    prompt: `超写实的时尚美妆特写，模特佩戴 红色棒球帽 并身穿配套的 红色连帽衫。构图：从鼻尖到额头的紧凑人像特写，帽子和双眼充满画面。焦点：刺绣 Logo 完美居中于模特双眼上方，缝线细节和纹理深度清晰可见。姿势：模特双手轻握连帽衫领口，营造出细腻的布料褶皱。光影：柔和的正面摄影棚光线，在颧骨和帽檐下形成淡淡的阴影轮廓。背景：极简的暖色调摄影棚背景，呈现象牙色至米色的渐变。氛围：大胆、自信，具有高级时装大片的质感。画质：超清晰的布料细节，电影级写实感，浅景深，无文字，无品牌遮盖。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788849678329_xvvdbc_HRngPrWbMAESRUW.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-095",
    title: "电商主图 - 铁锈红丝绸连衣裙野餐主题大片",
    category: "产品营销",
    industry: "通用",
    description: "一组慵懒而迷人的时尚大片，以草地为背景，配以丰富的野餐陈设和黄金时刻的自然光。",
    prompt: `创作一组以 温暖的午后阳光 为基调的时尚大片，场景设定在 宁静的草地 上，四周环绕着远处的树木。在草地上随意铺开超大号的奶油色和灰褐色毯子，呈现出自然褶皱而非刻意摆放的效果。一位成年女性舒适地趴在毯子中央，身体在画面中横向延伸。她用双前臂支撑身体，一只手轻轻托着下巴。双小腿向后弯曲，角度略有不同，呈现出放松且随性的轮廓。她神情平静而自信，直视镜头。让她身穿一件 修身铁锈红丝绸中长裙，裙身带有柔和的植物印花、细肩带、柔和的领口设计，以及高侧开叉，使面料能自然地垂落在弯曲的腿部周围。腰部和臀部保持修身剪裁，而非宽松的波西米亚风格。搭配层叠的精致金项链、手链和脚链。发型设计为松散的低盘发，脸颊两侧垂下几缕柔和的卷发。在她周围布置丰富的野餐场景，无需过于整洁：一个打开的柳条篮、盛放着多彩咸味菜肴的小金属碗、面包、水果、香草、水杯、折叠的纺织品以及一个装满干花的编织篮。食物主要聚集在前景和两侧，与人物主体保持明显的空间感。拍摄视角为垂直构图，略高于毯子高度，确保面部清晰，前景的陈设营造出景深感。使用柔和的黄金时刻自然光，色调以柔和的绿色、温暖的铁锈红、奶油色、银色和柳条色为主，带有细腻的胶片颗粒感和适度的景深。最终画面应呈现出丰盈、慵懒且静谧迷人的质感，仿佛一个不知不觉已持续许久的午后时光。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788591096587_rwpfat_HRRSM28a4AAcO-8.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-097",
    title: "电商主图 - 高端饮品广告摄影",
    category: "产品营销",
    industry: "通用",
    description: "一款专业的广告摄影提示词，旨在为饮品品牌创作具有角色和产品参考的超写实主视觉图。",
    prompt: `为虚构饮品 ENFLAMMER 创作一张超写实的高端广告摄影作品。请使用所有附带的参考资料`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1787725587170_ybmfk7_HQkQQPWXQAEWzlh.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-099",
    title: "电商主图 - 奢华巧克力广告静物摄影",
    category: "产品营销",
    industry: "通用",
    description: "一种复杂的优质巧克力广告排版，包含分层玻璃托盘、原材料以及粉色背景上的金箔包装。",
    prompt: `这是一张明亮且风格化的静物摄影作品，也是一张来自 优质巧克力 广告的概念照片，背景为 精致的柔粉色。画面中央是一块包裹在金箔纸中的奢华黑巧克力，包装微微打开，露出光泽诱人的巧克力，放置在一个粉色天鹅绒小垫子上。周围环绕着一套从左上方延伸而下的定制多层玻璃托盘系统。最上层放着完整的可可豆，中间层是烤杏仁碎，底层则是落入精致粉色瓷碗中的巧克力碎块。巧克力块周围的粉色桌面上摆放着各种巧克力原材料：在巧克力块正前方，铺着一张精致的粉色餐巾，上面放着一个装满松露巧克力的大圆盘。旁边有一把金色小勺和叉子。右侧是一个高圆柱形的粉色容器，贴有该巧克力品牌的金色标签。盖子上刻有铭文：“LUXURY CHOCOLATE IS A PREMIUM CHOICE”。侧面写着：“HANDMADE CHOCOLATE, 150 g”，并带有大号字母“LUX”。主盘周围有三个独立的粉色盘子，分别盛放着原材料：一个装有完整可可豆的盘子（最左侧），一个装有焦糖块的小型中央盘，以及一个装有烤杏仁的长盘（最右侧）。桌面上散落着几块巧克力和松露巧克力，最右侧的盘子上整齐地排列着五颗小松露巧克力。图像上及周围有许多文字元素：右上角为白色简洁字体书写的“LUXURY TASTE”。左侧（垂直方向）为“Contact- 1 (800) 555 2020”，听筒上（垂直方向）为“Focus on creativity in photography and video.”。底部中央为“LUXE VISION”。三个圆环交织的标志位于左上角和左下角。柔和而清晰的灯光突显了巧克力和原材料的质感，整体构图经过精心设计，展现了从原始可可到精致成品巧克力的蜕变过程。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1787034148215_konuoa_HP5xPIWaQAAXOUa.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-100",
    title: "电商主图 - 超现实美妆产品卷发筒",
    category: "产品营销",
    industry: "通用",
    description: "一个充满趣味与超现实感的商业摄影提示词，将产品管体作为超大号卷发筒，呈现高端美妆美学。",
    prompt: `影棚产品摄影，从后方拍摄一位留着 浅棕色 波浪/卷发的人，发型呈现出蓬松的大卷，视角从后脑勺延伸至肩膀。多个相同的 上传照片中的产品 管体像超大号魔术贴卷发筒一样插入头发中，散布在头部的各个卷发之间，大约可见 3-4 个管体，营造出一种趣味且超现实的“产品即卷发筒”概念。人物穿着一件纯 绿色 的立领上衣/衬衫。背景为平整、纯色的柔和橄榄绿影棚背景，与服装的色调相呼应。均匀柔和的影棚布光，阴影极少，呈现干净的商业美妆摄影质感，色调略微去饱和并带有暖色调。构图居中且为竖构图，从中肩部向上紧凑裁剪，不露脸，仅展示后脑勺和头发。照片级真实感，高端美妆/化妆品广告风格，长宽比 3:4。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786947850240_ttctun_HP0JcjGa0AASb60.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-101",
    title: "电商主图 - 树莓外壳产品摄影",
    category: "产品营销",
    industry: "通用",
    description: "一个商业产品摄影提示词，展示了被包裹在超写实、果汁滴落的树莓横截面中的产品。",
    prompt: `工作室产品摄影，上传照片中的产品 被包裹在一个超写实的超大树莓横截面内，树莓被分成两半，像保护壳一样包裹并托住产品，产品居中放置，轻微悬浮并带有柔和的接触阴影；树莓表面呈现出光泽且覆盖着露珠的独立小核果，可见果汁真实地滴落在产品上，细节处可见细小的绒毛和水珠，超写实 CGI 产品摄影风格，高端商业广告质感，柔和的漫射工作室灯光，带有微妙的轮廓光，无缝浅灰色工作室背景，带有微妙的渐变，竖构图，简洁极简，除非是产品包装本身的一部分，否则不添加任何文字覆盖。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786861118125_5etqo8_HPuiXwBawAAatce.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-102",
    title: "电商主图 - 带有蜘蛛网元素的电影质感产品广告",
    category: "产品营销",
    industry: "通用",
    description: "一款专业的广告提示词，旨在将参考产品与逼真的蜘蛛网效果及极简主义摄影棚灯光相结合。",
    prompt: `以上传的产品作为精确参考，保留其原始形状、品牌标识、包装、标签、Logo、颜色、比例及细节。请勿以任何方式重新设计、替换或修改产品。创建一个 21:9 全景 格式的高级极简主义广告构图。使用与 产品主色调 相匹配的无缝摄影棚背景，并带有柔和的径向渐变和微妙的暗角效果。在最左侧放置一个 做出射网手势的红色网纹手套。一道逼真的白色蜘蛛网水平横穿画面，其厚度在约 80% 的长度上保持一致。仅在靠近产品处，蜘蛛网应自然地缠绕、附着、交互或以干净且令人满意的方式融入产品，同时保持产品的原始外观。蜘蛛网在整个构图中应保持相同的宽度，并从左至右形成平滑、无缝的过渡。保持构图简洁，留出充足的负空间。奢华商业产品摄影，超逼真，高级广告美学，柔和摄影棚灯光，逼真阴影，超清晰对焦，光泽细节，8K，高细节，照片级真实感。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786518697805_jwa3cd_HPZ-iD6bMAAwf-F.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-104",
    title: "电商主图 - 高端水瓶产品摄影",
    category: "产品营销",
    industry: "通用",
    description: "一个专业的商业摄影提示词，适用于展示带有动态水花和高端影棚灯光效果的优质水瓶。",
    prompt: `超写实高端商业产品摄影，展示一个 优质透明水瓶 直立在光亮的反射表面上。瓶身覆盖着细小的冷凝水珠，象征着新鲜感。画面中包含 晶莹剔透的水花以动态螺旋状环绕瓶身。背景呈现 冷冰蓝色渐变，配以柔和的白光、漂浮的冰块、轻薄的雾气以及微妙的闪光粒子。采用高端影棚灯光，带有电影质感的轮廓光，高端广告风格，焦点清晰，超高细节，照片级真实感，8K 分辨率，构图简洁，高端饮品广告风格，极简且引人注目，留有充足的品牌和文字排版空间。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786257240981_ipqj1s_HPKntutaMAAQ3v1.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-105",
    title: "电商主图 - 夏季护肤品产品摄影",
    category: "产品营销",
    industry: "通用",
    description: "专业的护肤品产品摄影，以阳光亲吻过的海滩为背景，展示古铜色美黑精华液，伴有柔和的海浪与泡沫。",
    prompt: `超写实夏季护肤品产品摄影，展示一款名为“Golden Glow - Bronzing Elixir”的古铜色美黑精华液，长方形哑光瓶身，呈 温暖的阳光古铜色，配有简洁的白色瓶盖。瓶身斜放在湿润的沙滩上，柔和的海浪轻轻拂过，细腻的海沫和细小气泡环绕在瓶底，水流部分覆盖在标签上，浅滩清澈的水面下可见细腻的沙质纹理，金色的阳光投射出自然的亮光与柔和的阴影，高细节的水波纹和逼真的泡沫图案，清新的夏季美学，极简干净的品牌标识居中且清晰，温暖的黄金时刻海滩光影，电影级俯拍平铺构图，湿润表面的自然反射，编辑级美妆广告风格，超高细节，8K 照片级真实感，柔和暖色调，奢华护肤品广告，长宽比 4.5`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786171691763_363c9f_HPHD50KXkAAJfKy.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-106",
    title: "电商主图 - Nano Banana Pro 产品拼贴画",
    category: "产品营销",
    industry: "通用",
    description: "一份专业的商业产品摄影提示词，用于创建包含微距细节和影棚拍摄的三联拼贴画。",
    prompt: `关于 奢侈品 的三联拼贴产品摄影。左侧面板：佩戴该产品的年轻女性眼部特写微距镜头，展示复杂的纹理和工艺细节，自然肤色，浅景深，温暖的定向照明。右上方面板：产品在平坦表面上以 45 度角放置的干净影棚拍摄，无缝浅灰色背景，柔和均匀的影棚照明并带有细微阴影，焦点清晰，展示完整的设计和材质细节。右下方面板：佩戴该产品的年轻女性模特美妆特写，直视或略微侧视镜头，中性暖色调背景，柔和且修饰脸型的影棚照明，编辑类时尚摄影美学。所有三个面板保持一致的银色/金属色调和照明氛围，高分辨率商业摄影，面板之间有细黑分割线。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1786171687766_k7qu58_HPFZRU2bwAE6Gdm.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-107",
    title: "电商主图 - 风格化收藏级玩具包装",
    category: "产品营销",
    industry: "通用",
    description: "此提示词可将目标对象转化为收藏级玩具，并生成包含塑料质感及吸塑零售包装的创意模型。",
    prompt: `将 character 转化为风格化的收藏级玩具，具备光泽塑料质感、夸张的特征、微型配件，以及带有纸板背板的高级吸塑零售包装。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1785482583777_2nxgwf_HOhEOrOaUAAjfZj.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-108",
    title: "电商主图 - 高端产品摄影棚级视觉转换",
    category: "产品营销",
    industry: "通用",
    description: "一个专门用于将基础产品图片转换为高端摄影棚级广告的提示词，通过提取主体并添加配料元素来实现。",
    prompt: `产品摄影棚级视觉转换，从参考图中提取产品 并 重构为高端广告构图，核心产品居中且焦点清晰，周围环绕着其 关键成分。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1785395931720_sg9gkn_HObh9mRbwAA57-W.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-nb-109",
    title: "电商主图 - 奢华护肤品广告",
    category: "产品营销",
    industry: "通用",
    description: "一套专业级的护肤品商业摄影提示词，包含柔和的渐变色调和优雅的梳妆台道具。",
    prompt: `奢华护肤品广告，以 化妆品洁面瓶 为主体，置于 蓬松的粉彩色人造毛皮表面 中心，并带有光泽的镜面反射。背景应呈现梦幻般的粉彩色渐变，包含薰衣草色、柔粉色、桃色和奶油色，并配有电影级的金色光斑和体积光效果。添加优雅的梳妆台道具，包括珍珠项链、珠宝盒、香薰蜡烛、满天星花束和复古梳妆镜。使用柔和的暖色漫射光，辅以细腻的轮廓光，浅景深，奶油般虚化的背景，以及超写实的商业产品摄影风格。加入可爱的涂鸦箭头、闪光、爱心元素，以及高级的手写排版，主标题为 "瓶中焕肤，光彩照人"，副标题为 "滋养 • 补水 • 焕亮"，辅助文案为 "打造柔软、光滑且透亮的肌肤" 和 "每日自我护理"。照片级真实感，奢华美妆广告，高端化妆品品牌风格，高细节纹理，逼真的反射效果，HDR，85mm 微距镜头，f/2.0，专业影棚灯光，商业广告，超写实 4K，9:16 竖屏构图。`,
    tags: ["来源:awesome-nano-banana-pro-prompts", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1785395926456_zzcbo7_HOZgUU0akAAHGom.jpg",
    gradient: "from-violet-100 to-purple-100",
    popular: false,
  },
  {
    id: "tpl-gi2-001",
    title: "VR 头显爆炸视图海报",
    category: "产品营销",
    industry: "通用",
    description: "生成一张高科技 VR 头显爆炸视图，包含详细的组件标注和宣传文案。",
    prompt: `{
  "type": "产品爆炸视图海报",
  "subject": "VR 头显",
  "style": "简洁的高科技 3D 渲染，摄影棚灯光，发光装饰",
  "background": "background color: 柔和的紫蓝色渐变",
  "header": {
    "logo": "∞ product name: Meta Quest 3",
    "subtitle": "main catchphrase: 以全新的结构，重塑全新的现实。"
  },
  "layout": {
    "centerpiece": "VR 头显的垂直堆叠爆炸视图，展示了 9 层不同的内部组件：外壳、摄像头传感器、带芯片的主板、Pancake 透镜、内部框架、电池组、侧带、顶部头带和面部接口衬垫。",
    "callout_labels": {
      "count": 8,
      "left_side": [
        "Snapdragon® XR2 Gen 2\\n卓越的处理性能，带来实时沉浸体验。",
        "可调节 IPD 机构\\n为广大用户提供舒适的佩戴感。",
        "精密设计的头带\\n追求舒适与稳定的工程学设计。"
      ],
      "right_side": [
        "前面板\\n精致的设计与优化的重量平衡。",
        "追踪摄像头\\n实现高精度的位置追踪与环境感知。",
        "Pancake 透镜\\n轻薄设计，提供广阔视野与清晰画质。",
        "高性能电池\\n优化电源设计，支持长时间续航。",
        "柔软的面部接口\\n确保长时间佩戴依然舒适。"
      ]
    },
    "footer": {
      "left_text_block": {
        "headline": "bottom headline: 体验，源于结构的进化。",
        "body": "每一个零件都蕴含着支撑沉浸式体验的前沿科技与匠心设计。Meta Quest 3 从内部构建未来，为您带来超乎想象的体验。"
      },
      "right_logo": "∞ Meta"
    }
  }
}`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1776658772018_lukyfw_HGSUfldbIAEiMWZ.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-004",
    title: "电商直播 UI 样机",
    category: "产品营销",
    industry: "通用",
    description: "生成逼真的社交媒体直播界面，叠加在人物肖像之上，包含可自定义的聊天消息、礼物弹窗和商品购买卡片。",
    prompt: `{
  "type": "直播 UI 样机",
  "subject": {
    "description": "host name: Elon Musk 的肖像，面带微笑，身穿印有白色技术示意图的黑色 T 恤",
    "background": "左侧显示带有 'left background logo: SPACEX' 文字的屏幕，右侧显示红色的 'right background logo: Tesla T logo' 和一辆深色汽车"
  },
  "ui_overlay": {
    "top_header": {
      "host_info": "头像，名称 'host name: Elon Musk'，副标题 '55.6万本场点赞'，红色 '关注' 按钮",
      "rank_badge": "带有 '全站第1名' 的金币图标",
      "viewer_stats": "3 个顶部观众头像，显示 '12.3w'、'8.6w'、'5.7w'，总计 '68.7万'，'X' 关闭按钮",
      "right_links": "'更多直播 >'，'礼物展馆 0/24'（带有蓝色 '经典' 标签）"
    },
    "mid_left_gifts": {
      "count": 2,
      "items": [
        "头像 '科技爱好者'，'送小心心'，爱心图标 x 1314",
        "头像 '星辰大海'，'送火箭'，火箭图标 x 666"
      ]
    },
    "bottom_left_chat": {
      "system_message": "37 级勋章 '宇宙漫游者 加入了直播间'",
      "message_count": 7,
      "messages": [
        "小火箭: 马斯克！未来可期！🚀",
        "future: 特斯拉Model 2什么时候出？",
        "星空梦想家: SpaceX今年能上火星吗？",
        "AI探索者: Neuralink进展如何？",
        "帅气的网友: 马总好！",
        "Mars: 第一次来你的直播，超激动！",
        "用户123: 讲讲AI吧，会取代人类吗？"
      ]
    },
    "bottom_right_product_card": {
      "hot_tag": "橙色 '热卖 x 1888'",
      "image": "Tesla Cybertruck",
      "title": "product name: 特斯拉Cybertruck 电动皮卡",
      "price": "product price: ¥ 1,618,000",
      "button": "红色 '抢' 按钮",
      "floating_animation": "半透明爱心沿右侧边缘向上浮动"
    },
    "bottom_bar": {
      "input_field": "'说点什么...'",
      "icons": ["笑脸", "三个点", "购物车", "礼物盒", "分享"]
    }
  }
}`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1776699445498_ga2ry5_HGO7H0DWkAApdKK.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-039",
    title: "信息图 / 教育视觉图 - UGC 风格营销面板网格",
    category: "产品营销",
    industry: "通用",
    description: "一个结构化提示词，用于为营销活动创建 3x3 网格的逼真 UGC 风格面板，包含电影级视觉效果和制作说明的空间。",
    prompt: `使用 GPT Image 2 创建一个 3x3 的全页网格，展示此  的逼真 UGC 风格面板。将视频分为 3 个连续部分。每个面板必须包含一个电影级视觉画面，以及直接印在面板内的清晰制作说明。目标不仅仅是展示产品，而是帮助客户构思购买理由。企业名称为 。将企业名称嵌入背景中。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789199147235_45scrj_HR8Lt6TXYA4qfTB.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-044",
    title: "信息图 / 教育视觉图 - AI 产品草图转台灯渲染图",
    category: "产品营销",
    industry: "通用",
    description: "一个照片级真实感的摄影棚场景，展示了将手绘产品草图转化为成品陶瓷台灯的 AI 工作流。",
    prompt: `创建一个整洁、照片级真实感的产品设计工作区场景，展示 AI 辅助从草图到成品的转化过程。使用 16:9 的宽幅画布，配以柔和的自然日光、淡薄荷绿墙面、窗光投下的写实阴影，以及现代化的创客工作室美学。在左侧，放置一张竖立在蓝色网格切割垫上的粗糙灰白色纹理绘图纸，顶部用一小条橙色胶带固定；纸上展示了一张  的详细石墨结构草图，包括垂直和水平辅助线、圆顶灯罩、短灯颈、圆润的球形底座、阴影排线以及地面投影。草图前方放置 2 件绘图工具：一支斜放的黑色铅笔和一块白色长方形橡皮擦。在画面中央，添加半透明的未来感 UI 可视化效果：从左至右排列 4 块半透明玻璃面板，每块面板展示台灯从粗糙草图到精细渲染再到简化 3D 形态的演变过程，带有淡青色轮廓和微妙的蓝色光晕。添加 3 个界面叠加层：左下角一个带有三个水平滑块控件的圆角矩形，右上角一个围绕圆顶预览的矩形裁剪/选择框，以及一个指向台灯演变过程的亮蓝色发光光标箭头。在右侧，将最终的  成品台灯放置在一个长方形斑点石材平台上：平滑的半球形圆顶灯罩、小型黄铜灯杆、灯罩下柔和发出的暖光，以及与草图相呼应的圆润球形底座。场景周围布置工作室道具：左上角和右上角隐约可见的绿叶植物，最右侧放有画笔的白色杯子，右下角一个装有红橙色块的小圆托盘，以及左下角堆叠的样本项目或笔记本。蓝色切割垫应覆盖桌面并显示精确的网格线，以强化设计原型制作的环境感。画面中无可见文字、无 Logo、无水印；强调通过透明的 AI 编辑层将手绘草图转化为成品这一概念。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942339417_gggsxx_HRvqeLvbUAAQOKg.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-052",
    title: "信息图 / 教育视觉图 - 脏污农产品与细菌厨房场景",
    category: "产品营销",
    industry: "通用",
    description: "一张垂直方向、皮克斯风格的厨房插画，展示了带有害虫、忧心忡忡的脏污果蔬，配有西班牙语健康安全标志及放大后的细菌，用于食品卫生宣传活动。",
    prompt: `创建一个垂直 9:16 的电影级 3D 动画风格场景，背景为温暖阳光下的厨房，主题是脏污的农产品和肉眼不可见的细菌。在前景的乡村风木质台面上，展示 5 个拟人化的蔬菜/水果，它们有着忧虑的卡通表情：中心是一个大红苹果，有着大眼睛、上扬的棕色眉毛、张开的焦虑嘴巴，带有水珠、污垢斑点、果梗和一片绿叶；左前方是一个红番茄，有着大眼睛和震惊张开的嘴；左后方是一个浅绿色生菜/卷心菜头，有着大眼睛、惊恐的嘴、泥土飞溅和叶片褶皱；右后方是一根高大的橙色胡萝卜，带有绿叶顶端、表皮污垢、大眼睛和悲伤的皱眉；右侧远处是一个半遮掩的小西兰花头，有着担忧的眼神。在农产品上添加 7 只清晰可见的小害虫：生菜上坐着 1 只带有眼柄的可爱棕色蜗牛，苹果上爬着 1 只绿色毛毛虫，苹果/番茄/叶片区域停着 3 只带有半透明翅膀的黑蝇，番茄边缘附近有 2 只微小的蠕虫状小虫。在桌面上和农产品上散落着成团的深色土壤和碎屑。在右下角前景处，放置一个大型手持放大镜，倾斜覆盖在苹果上方，通过镜片揭示出放大的彩色卡通微生物，包括绿色、黄色、橙色和红色的圆形尖刺状细菌及杆状细菌，与场景其余部分相比细节极其锐利。背景：温馨的厨房，浅景深，阳光充足的窗台上摆放着盆栽，水槽和罐子呈现柔和的虚化效果。包含两个带框标志：左侧墙上是一张奶油色海报，上面有手写西班牙语文本 ，下方有一个红色小爱心；右侧是一块黑色黑板，上面有白色粉笔书写的西班牙语文本 。视觉风格：高质量皮克斯风格粘土/定格动画 3D，富有表现力的大眼睛，真实的蔬菜纹理，逼真的污垢和水珠，微距摄影感，温暖的金色晨光，柔和的焦外成像，清晰的前景焦点，健康的公共卫生广告氛围。使用  作为场景主题，配合  和 。避免出现标志、水印、额外文字、额外的农产品角色，或超出规定数量的害虫。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942314561_rn48g6_HRryRbtasAA2mPp.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-092",
    title: "产品营销 - 编辑级铁线莲花园立体模型",
    category: "产品营销",
    industry: "通用",
    description: "将随手拍摄的花卉照片转化为带有花盆底座和花架的精致摄影棚风格植物立体模型。",
    prompt: `以提供的参考图作为植物素材，将原本随意的花园特写照片转化为精致的编辑级产品风格场景。保留铁线莲藤蔓的原始特征、洋红色花朵、绿叶、花蕾、种子头以及质朴木质花架的质感，并将它们重新构图，组合成一个精心布置的微型花园。

目标：根据参考照片创作一个优雅的摄影棚植物立体模型。
构图：将植物直立放置在方形米色石质花盆底座上，盆内填满土壤并点缀少量绿植，木质花架立于其后。采用等轴测四分之三视角，使底座、花架、花朵和藤蔓清晰可见。
花卉结构：保留 3 朵盛开的洋红色铁线莲作为核心视觉焦点，并自然排布未开放的花蕾和种子头。
背景：将杂乱的真实花园背景替换为无缝的暖米白色摄影棚背景。
光影：采用柔和的自然编辑级光影，呈现细腻的阴影，展现花瓣和叶片的真实质感，营造出精致的杂志静物摄影风格。
风格：照片级真实感，简洁，高端植物编辑风格，细节丰富且布局清爽。
限制：请勿添加文字、标签、人物、昆虫、花瓶或其他装饰性道具。在确保植物与 REFERENCE_0 保持一致的前提下，使场景呈现出精心布置的专业摄影效果。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789199151890_mwfo2z_HR80hPlWIAEYNBv.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-093",
    title: "产品营销 - 时尚男装编辑人像",
    category: "产品营销",
    industry: "通用",
    description: "一个简洁、精致的人像提示词，适用于高端时尚男装广告，侧重于自然光影、锐利细节及高级杂志美学。",
    prompt: `逼真的时尚编辑人像，拍摄对象是一位英俊的 ，留着浓密且打理得当的深棕色短发，修剪整齐的短胡须，面带温暖自信的微笑，五官轮廓具有自然的男性魅力。他正对着镜头站立，双臂交叉，身穿奢华的 ，佩戴一块经典黑色奢华腕表。戏剧性的自然阳光从侧面射入，在他身后极简的白灰色墙面上投下强烈的几何阴影。干净精致的摄影棚/公寓环境，高端时尚男装广告美学，温暖的自然肤色，逼真的皮肤纹理，细腻的针织面料质感，锐利的面部细节，电影级布光，浅景深，微妙的对比度，高级杂志摄影风格，85mm 人像镜头，f/2.8，超写实，高分辨率，竖构图，居中取景。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789113111224_xibqfa_HR57b20bkAAd1cg.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-095",
    title: "产品营销 - 咖啡杯中的微缩城市",
    category: "产品营销",
    industry: "通用",
    description: "一个超现实且充满奇思妙想的提示词，用于生成在咖啡杯中利用蒸汽和泡沫构建的超写实微缩城市。",
    prompt: `创作一张超现实且具有超写实感的图像，主体是一个 ，构建在  之中。泡沫和液体应形成地形、街道和微小的发光建筑，并配有小桥和走动的小人。展示戏剧性升腾的蒸汽，以及洒在场景上的温暖晨光。使其充满奇思妙想、高度精细且视觉丰富，呈现出高端商业概念图的效果。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789113117792_zqa4m2_HR3yrutWQAI9eAh.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-096",
    title: "产品营销 - 欧洲秋季时尚大片",
    category: "产品营销",
    industry: "通用",
    description: "一个关于年轻男性身着秋季时装漫步在鹅卵石路上的电影感大片提示词，包含戏剧性的光影和秋叶元素。",
    prompt: `超写实电影感欧洲秋季时尚大片，画面主体为一位  独自漫步在 。他留着浓密自然的黑色波浪卷发，有着深邃传神的棕色眼睛、浓密的眉毛、突出的颧骨、轮廓分明的男性下颌线以及淡淡的自然胡茬。他身着 ，并佩戴着一块经典的复古腕表。他单手随意地提着一个深色皮质公文包。落叶铺满了道路，微风拂过，几片落叶在他身边盘旋。温暖的黄金时刻阳光穿过树木，营造出戏剧性的光束和长长的电影感阴影。远处有淡淡的薄雾，散发着优雅的欧洲乡村气息，呈现出精致的“老钱风”审美、静奢质感和从容自信，采用时尚杂志构图，具备真实的皮肤纹理、清晰的发丝细节、自然的比例，浅景深，85mm 镜头，电影胶片颗粒感，HDR，照片级真实感，垂直 9:16，无文字，无水印，非 AI 感面孔。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789113114754_2yznzt_HR2VCS2boAAi_HZ.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-097",
    title: "产品营销 - Luxury East Asian Fashion Portrait",
    category: "产品营销",
    industry: "通用",
    description: "A high-fashion studio portrait prompt featuring an East Asian woman in elegant dark velvet",
    prompt: `High-fashion studio portrait of an elegant  with wavy short dark hair wearing a wide brimmed black velvet top hat decorated with intricate silver embroidery along the brim and a metallic vintage buckle on the band She is dressed in a , paired with long dark navy velvet opera gloves Wearing luxurious jewelry  Dark grey textured backdrop, dramatic studio lighting cinematic, highly detailed, 8k resolution.`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789199148271_ser8t4_HR1LWR5a4AAGLYh.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-098",
    title: "产品营销 - Venus Soap Holder Bathroom Interior Design",
    category: "产品营销",
    industry: "通用",
    description: "Generates a creative product concept visualization for a Venus-themed soap holder, includi",
    prompt: `Generate a 16:9 horizontal bathroom design presentation image. On the left, place a partial painting reference of the character's head and golden long hair from . In the middle, show a pencil sketch of a matching seashell soap holder. On the right, show the product in use on a washstand. A wide and shallow scallop-shaped white porcelain soap dish with radial texture, featuring a small Venus figure standing on the back edge with long golden hair and wearing a white classical robe that fully covers the body. In the dish is a used  bar of soap with rounded edges and a few water droplets and thin soap film on the surface and inside the dish. Render a pearl-white glazed finish, subtle material inconsistencies, and realistic contact shadows, alongside a linen towel and part of a faucet. The sketch and object should be consistent, with no text, logos, or URLs.`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789029046700_8whfs7_HR03jdzboAAozby.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-099",
    title: "产品营销 - Mondrian Style Storage Cabinet Design",
    category: "产品营销",
    industry: "通用",
    description: "A prompt that transforms Piet Mondrian's famous abstract art into a functional desktop sto",
    prompt: `Generate a 16:9 horizontal desktop design presentation. On the left, place a painting reference of . In the middle, show the front grid and perspective pencil sketch of a desktop storage cabinet, and on the right, show the final effect in use. The cabinet is made of ivory-white painted wood, with thick black divider strips forming an asymmetrical rectangular grid. Large red drawers, small blue drawers, small yellow drawers, and white compartments form the front. The red drawer is pulled open, containing ; the yellow drawer is slightly pulled out, revealing an eraser. Drawers must have realistic side walls, thickness, and internal space, aligning with their respective openings. Show fine wood grain, contact shadows, and desktop wear, with natural side lighting. The sketch must match the cabinet layout, with no text, logos, or URLs.`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789029052509_4cp0ol_HR0mZDjboAAhFo3.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-101",
    title: "产品营销 - Rhode Lip Treatment 对比广告",
    category: "产品营销",
    industry: "通用",
    description: "创建一个黑色背景的并排对比图，展示两张西瓜主题的 rhode beauty 广告生成图。",
    prompt: `目标：创建一个宽幅对比图，展示两张为 Peptide Lip Treatment (Watermelon Slice 口味) 生成的 rhode beauty 静态广告，采用黑色背景，并将两个方形广告样机并排呈现。

画布：16:9 横向画幅，黑色背景，高对比度，简洁的社交媒体对比布局。

布局：将两个圆角方形广告图水平居中放置，并留出充足间距。左侧面板上方用亮橙色文字标注：“GPT-Image-2”。右侧面板上方用同样的亮橙色文字标注：“GPT-Image-2.5”。在底部中央添加一行小的斜体橙色说明文字，内容为“prompt in comments”。

广告面板：使用 2 个方形美容广告面板。
1. 左侧面板：柔和的粉色背景，圆角设计，优雅的编辑类美容广告构图。左上角为大号衬线字体标题“A SLICE OF GLOSS.”，下方配有较小的“Peptide Lip Treatment”文字。一支粉色的 rhode Peptide Lip Treatment 唇膏管从右上角向左下角斜向悬浮，带有垂直的白色“rhode”品牌标识。周围环绕着光泽的粉色凝胶漩涡、透明的溅射水滴和西瓜切片。西瓜元素数量：3 片可见切片或楔形块——底部一片大西瓜切片、管身背后右侧一片切片、以及右上角一片小楔形块。保持产品居中且醒目。
2. 右侧面板：同一 rhode 广告的更具动感、更明亮、细节更丰富的版本。粉色背景，圆角设计，左上角为衬线标题“A SLICE OF GLOSS.”及较小的“Peptide Lip Treatment”。一支更大的粉色 rhode 唇膏管在中心附近斜向悬浮，周围环绕着富有戏剧性的半透明粉色光泽溅射丝带、大量气泡和水滴，以及西瓜切片。西瓜元素数量：5 片可见块——底部一条大的前景西瓜条、左中位置一片楔形块、右中位置一片楔形块、右上角一片小楔形块，以及中心溅射效果后方的一片局部切片。产品应比左侧面板看起来更清晰、更具光泽感且更高端。

视觉风格：精致的产品广告，鲜艳的西瓜粉色和红色，光泽的液体质感，影棚灯光，高端化妆品宣传，清晰的排版，饱和的色彩，逼真的 3D 产品渲染与超现实溅射摄影相结合。

文本与自定义：使用顶部标签  和 。使用广告标题 。使用管身上的品牌名 。使用底部说明文字 。

约束：保持 2 个对比面板，2 个橙色模型标签，以及 1 个底部说明文字。不要添加额外的徽标、水印、UI 界面元素或指定标签及广告文案之外的任何额外文本。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942321734_9pzxvn_HRwjsc8bkAAKTG6.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-102",
    title: "产品营销 - 秋季温泉美食促销海报",
    category: "产品营销",
    industry: "通用",
    description: "生成一张高端日本秋季温泉与时令美食之旅促销旅行广告。",
    prompt: `目标：制作一张奢华的正方形日本旅行广告，用于秋季温泉与美食之旅的促销，旨在社交媒体推广。

画布：1:1 正方形海报，高分辨率，采用深红、金、琥珀、奶油色和深棕色的浓郁暖秋色调。采用高端旅行社传单风格，结合分层照片拼贴、对角线切割、精致和纸纹理、金色点缀以及细腻的投影效果。

布局：构建一个紧凑的拼贴画，包含 6 个主要照片区域：1) 左上角大型户外露天温泉，水面蒸汽缭绕，配有天然岩石、灯笼、鲜艳的红枫、远处的湖泊与群山；2) 右上角特写，黑色托盘中盛放的豪华螃蟹料理，伴有蒸汽和配菜；3) 中右侧特写，筷子夹起的雪花和牛，旁边是栗子或银杏饭碗；4) 左下角舒适的日式旅馆客房，配有榻榻米、矮桌、坐垫、暖色灯光、障子门，窗外可见秋景；5) 右下角风景秀丽的湖泊与秋山景观；6) 顶部附近的小型背景食物/季节细节面板，展示蘑菇和蔬菜。用简洁的奶油色或金色对角线边框分隔各面板。

中央排版：在中心放置一个大型奶油色和纸多边形标签。在其上，使用超大号日式书法风格标题文本，内容为 。将“秋”设为红橙渐变，“食”设为金色渐变，其余字符设为深棕色。在标题周围添加两片装饰性枫叶。下方添加较小的日文文本：“秋限定のごほうび旅”，两侧配有细横线。

优惠区：在中央标签下方，创建一个带有金色饰边的深红色图案价格横幅。显示一个小的圆形框，内容为 。旁边以闪亮的金色衬线数字显示大号价格 ，并带有白色高光和深色阴影。在价格附近添加小的金色强调符号。

福利与行动号召：在价格下方，添加一个带有叉子、刀和温泉图标的奶油色圆形牌匾，随后是文本“食事付き・温泉満喫”。在底部中心，添加一个带有金色轮廓的亮红色圆形按钮，内容为 。

其他日文文案：在海报周围包含 5 个辅助文本块：左上角白色手写体“この秋、心もおなかも満たされる。”并带有细下划线；右上角奶油色长条上的竖排文字“旬を味わう、贅沢なひととき”；旅馆面板左侧的竖排文字“特別な秋を、旅へ。”；左下角白色小字“日本の美しい秋に、会いに行こう。”；右下角白色文字“行きたかったあの場所へ。”，上方配有简单的白色旅行社标志和标语“もっと、心が動く旅を。”，以及微小的英文文本“TRAVEL for a richer tomorrow”。

视觉风格：照片级真实的旅行摄影与精致的日本广告设计相结合。强调温泉和热食升腾的蒸汽、光泽感的食物质感、清脆的秋叶、温暖的室内灯光、优雅的日式书法以及高端的金红色促销图形。

约束：保持所有日文文本清晰可读，并按描述放置。画面中不出现人物。不要添加额外的价格、标志、二维码或不相关的文本。保持平衡的奢华旅游构图，并具有强烈的中心层级感。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942362485_yir0y4_HRwU32HagAAYdMN.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-103",
    title: "电商主图 - 基于草图生成的写实风格房间推广渲染图",
    category: "产品营销",
    industry: "通用",
    description: "一个综合性提示词，以手绘房间布局作为结构指南，生成具有自然光感的写实房地产推广照片。",
    prompt: `创建一个写实的房间推广图像，用于向潜在租客展示我的房间。房间布局主题如下：左侧有一扇大落地窗，采光和照明效果极佳。窗边放着一个猫窝，上面躺着一只 。卧室内部有一张大书桌，桌上摆放着电脑、键盘、鼠标和手机等日常用品。一名年轻的中国男性正坐在人体工学椅上操作电脑。书桌右侧是一张单人床。整体空间关系需遵循草图布局。光影和纹理应呈现出手机拍摄的卧室照片效果。硬性要求：草图中所画的所有物品必须出现，包括窗外的太阳。需避免的问题：不要包含任何与现实日常生活相悖的元素或现象。其他比例和房间细节可由你自行决定，以确保呈现出自然、写实且不突兀的效果。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942292901_ftm719_HRwCeKraoAA-G5L.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-104",
    title: "电商主图 - 精致玫瑰美甲修图",
    category: "产品营销",
    industry: "通用",
    description: "在保持参考肖像几乎一致的前提下，仅将可见的指甲修改为精致的玫瑰主题美甲。",
    prompt: `以 REFERENCE_0 作为底图，进行极其细腻的产品级修图：仅将手持草莓处可见的指甲修改为精致的 。保持整体构图、面部、姿势、服饰、软帽、花束、草莓、玫瑰、壁纸、光影、色调以及标题文字  与参考图尽可能一致。请勿更改人物、背景、排版、裁剪或整体氛围。此次修图应仅影响 2 处可见的指甲区域：主拇指指甲及其旁边部分可见的小指甲；所有其他细节应保持不变。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942358271_0ynebz_HRvk4F8bYAAUW5q.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-105",
    title: "电商主图 - 产品植入生活方式图像生成",
    category: "产品营销",
    industry: "通用",
    description: "一套通过参考详细视觉风格 JSON，创建人物手持特定产品且风格一致的生活方式图像的工作流。",
    prompt: `分析这张照片，并提供一份非常详细的 JSON 提示词来描述其视觉风格。请务必详细拆解色彩分级、光照以及照片中的所有确切颜色，以便我能将这种外观应用到我自己的图像中。使用此 JSON 作为参考，生成一个手持我产品的人物。保持相同的面部特征。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1789029005307_j2vgpe_HRvBtnraAAAChs3.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-106",
    title: "电商主图 - 韩国超市购物抓拍",
    category: "产品营销",
    industry: "通用",
    description: "一张写实的智能手机风格生活时尚照片，展示了一名女性在超市过道蹲下的瞬间，适用于真实的零售场景或社交媒体产品展示。",
    prompt: `创作一张写实的竖屏智能手机风格照片，捕捉在韩国超市购物的抓拍瞬间。一位留着  的年轻女性蹲在麦片和格兰诺拉麦片货架旁，戴着一顶压得很低的  棒球帽，身穿一件略显宽松的白色罗纹长袖亨利衫、浅蓝色阔腿牛仔裤、米色鞋底的白色运动鞋，背着一个纤细的黑色单肩包。她侧身向右看，左臂伸向地上的黑色塑料购物篮；篮子里装着可见的杂货，侧面印有白色的“emart”标志。场景中仅包含一位主要购物者、一个黑色购物篮、两位背景中的购物者、一辆背景中的购物车、一个醒目的上方过道指示牌（标有数字 6 和韩文分类文字）、一个写着“2,980”的价格标签，以及摆满贴有韩文标签的麦片、格兰诺拉麦片、零食和包装食品袋的长货架。采用自然的消费者手机抓拍风格，构图略显随意，呈现真实的室内荧光灯照明、轻微的动态模糊、中性色调、光亮的灰色超市地面反射、深邃的过道透视感以及真实的日常细节。使其看起来像是一张随意的买家秀或超市社交媒体照片，而非摄影棚时尚大片。无美颜灯光，无夸张姿势，无人工痕迹的皮肤质感，无多余人物，无水印。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942336338_pno2c0_HRunAK4a8AAgaeo.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-107",
    title: "电商主图 - 破碎的古代陶土花瓶",
    category: "产品营销",
    industry: "通用",
    description: "一个写实的摄影棚产品拍摄提示词，用于生成背景为黑色的、带有发光内部结构的古老裂纹陶土文物。",
    prompt: `创作一张博物馆级的超写实产品摄影照片，主体为单个古代 ，置于纯黑色背景中心。器皿呈高挑卵形，底座窄小，肩部圆润，瓶口宽大外翻，由红褐色风化粘土制成，带有厚重的岁月包浆、矿物质沉积、缺口、划痕、白色磨损和细微裂纹。添加雕刻装饰：瓶颈处紧贴瓶口下方有一圈连续的几何纹带，瓶身有凸起的漩涡状藤蔓浮雕图案。右前方有一处巨大的锯齿状垂直裂口，露出中空的内部，开口处仍附着多块破碎的陶片；裂口从上肩部延伸至下腹部，露出内部温暖的铜橙色锤纹凹陷表面，并捕捉光线。使用来自左上方的戏剧性摄影棚布光，并在破碎的空腔内增加微妙的温暖内反射光，以强调粗糙的陶瓷质感、断裂边缘、深度和考古真实感。构图为正面的四分之三产品视角，完整花瓶可见，底部带有轻微阴影，高对比度，焦点清晰，超精细，无标签，无人像，无额外物体，无水印。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942315707_4sytlg_HRuXCqdagAAoIpC.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-109",
    title: "电商主图 - 精品电商平铺网格",
    category: "产品营销",
    industry: "通用",
    description: "专为时尚与服装电商 Lookbook 设计的简洁布局，展示了在水泥或木质地板上整齐排列的平铺商品。",
    prompt: `[品牌/产品信息]
- 品牌名称："}
- 系列名称："}
- 典型商品价格："}

[图像质量、呈现与构图规范]
- 风格：适用于日本时尚/生活方式品牌电商网站的极简且精致的 Lookbook 照片。
- 构图：在自然光照射的摄影棚内，将服装单品（包袋、外套、鞋履等）整齐地平铺或有序排列在硬木地板或水泥地面上。
- 排版布局（适用于 GPT-image / Nano Banana Pro）：在画布角落隐约呈现品牌名称 "}、"} 文字以及价格标注 "}，并使用超细字体。
- 灯光/色彩：如阴天自然光般柔和，低对比度，以大地色系（米色、橄榄绿、炭灰色、灰白色）为主的沉稳色调。

[布局与输出的严格限制（强制性）]
- 输出成品设计本身，并填满整个画布。设计内部的背景和场景描绘（墙壁、空间、阴影）可遵循正文中的说明。
- 禁止事项：带相框的海报照片、贴在墙上的海报照片、放置在桌子或纸张上的样机照片、纸张边缘的透视变形或投影。
- 输出成品 2D 平面设计本身，并填满整个画布。允许包含上述描述的场景元素（墙壁、房间、阴影）。绝对禁止任何海报样机效果：不得出现相框、不得出现贴在墙上或放在桌上的照片、不得出现艺术品边缘的透视变形或投影。

- 宽高比："--ar 1:1" 或 "--ar 4:3"`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788855320165_tg6adc_HRm1opdXQAEwb6-.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-110",
    title: "电商主图 - 商业粉色浆果冰沙摄影",
    category: "产品营销",
    industry: "通用",
    description: "一份详细的高端食品场景商业摄影提示词，展示了粉色浆果冰沙和花生酱罐，并包含精确的产品与环境描述。",
    prompt: `在明亮舒适的现代厨房中，创作一张超写实的高端食品摄影作品。左侧的白色圆桌上，垂直摆放着一组 ，盛装在  中。冰沙质地浓稠细腻，带有细微的浆果颗粒和光泽感。右侧放置一个带有绿色盖子的透明  罐，里面装满了金棕色的奶油花生酱。请准确还原产品包装、标签位置、颜色和比例。在罐子旁边自然地散落几颗完整的花生。前景处放置一个装有混合烤花生的小陶瓷碗，以及一个米色陶瓷盘，盘中放着一把盛有满满一勺奶油花生酱的勺子。在冰沙旁点缀几枝精致的绿色香草。背景：整洁的白色地铁砖厨房墙面，侧面照射的柔和自然光，微妙的阴影，营造出温暖舒适的氛围。将食物放置在一个小型木制项目上，下方垫着一张复古印花纸。在左上角添加优雅的手写风格白色文字“Smoothies”，下方配以较小的草书文字“Tingi Kalori”。垂直 9:16 构图，高端商业食品摄影，逼真的质感，自然日光，浅景深，柔和的背景虚化，清晰的产品细节，平衡的构图，温暖的生活方式美学，照片级真实感，高分辨率，无人物。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788769180609_sufbpd_HRh2BbAawAAZRGN.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-111",
    title: "电商主图 - 粉色饮品微距摄影",
    category: "产品营销",
    industry: "通用",
    description: "一个商业级摄影提示词，用于拍摄冰镇粉色果饮的微距照片，强调凝结水珠、气泡和逼真的光影效果。",
    prompt: `一张照片级逼真的特写，主体为一个 ，里面盛着  果饮和几块不规则的大冰块。细小的气泡和细腻的泡沫自然地聚集在表面，冰块和玻璃杯上可见凝结的水珠和细小液滴。柔和的漫射日光照亮了饮品，在冰块中形成了美丽的粉色倒影和逼真的折射效果。，浅景深，优雅的饮品摄影，微距细节，自然高光，逼真的玻璃畸变，清晰对焦，高端商业摄影，竖构图，8K，超写实`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788682054942_jzv3w7_HRfhOyYbwAA5q7U.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-112",
    title: "电商主图 - 专业产品广告摄影",
    category: "产品营销",
    industry: "通用",
    description: "一个专业的摄影棚拍摄提示词，用于制作具有柔和光影和高端品牌美学的高质量产品照片。",
    prompt: `专业产品广告照片，拍摄主体为 ""，在  下进行摄影棚拍摄，柔和的漫射光，微妙的阴影，产品置于画面中心，四分之三角度视角，材质纹理细节丰富，符合高端品牌广告的简洁现代美学，4K 分辨率，1:1 纵横比`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788682055545_641j9k_HRdx-nca8AAWbsT.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-113",
    title: "电商主图 - 冰蜂蜜拿铁搅拌特写",
    category: "产品营销",
    industry: "通用",
    description: "一张写实的微距美食摄影作品，展示了一只手在纹理玻璃杯中搅拌奶油冰蜂蜜拿铁的过程，适用于饮料广告或社交媒体内容。",
    prompt: `创作一张 9:16 竖屏写实微距特写图片，展示放在光洁白色桌面上的小型透明纹理玻璃杯中的冰蜂蜜拿铁，构图如同电影级微距美食视频截图。玻璃杯应具有扇形波浪杯口和垂直条纹杯身，杯中盛满奶油色的咖啡和牛奶，表面及杯内清晰可见 7 块冰块。一只右手从右上角伸入，拇指和手指可见，手持 1 把闪亮的深色金属勺插入杯中轻轻搅拌，形成柔和的焦糖棕色漩涡层、细小的泡沫以及沿杯壁流动的咖啡条纹。使用 、、、 以及 。保持背景简洁且呈浅灰白色，具有浅景深、逼真的液体反射、细腻的冰块高光、诱人的奶油质感，构图平滑且具电影感，无文字，无 Logo，无多余物品。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788682097464_o55w3c_HRdKDJIagAASU3k.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-114",
    title: "电商主图 - 金毛寻回犬喷雾广告",
    category: "产品营销",
    industry: "通用",
    description: "通过将一张近距离喷雾参考图扩展为更宽广的宠物驱避喷雾广告，创作出一张照片级真实的户外露营产品摄影图。",
    prompt: `以提供的参考图为基础，将其扩展为一张更宽广的竖版生活方式产品照片。保留正在被喷雾的金毛寻回犬以及扶住它身体的手，但需缩小画面，以展示狗狗侧身坐着且面部可见。添加第二只手，手持一个蓝白相间的扳机式喷雾瓶对准狗狗，并呈现出细微雾气喷洒在毛发上的效果。场景设定在黄金时刻阳光明媚的森林露营地，并增加 3 个主要的背景元素：右侧 1 个橄榄绿帆布帐篷，狗狗身后 1 张小型露营桌，以及 1 片柔和虚化的高大树林。使画面呈现出户外宠物驱避喷雾广告的质感；在瓶身上添加清晰可见的标签文字： 以及简单的品牌标识：。采用照片级真实的浅景深效果、温暖的背光、自然的色彩、清晰的毛发细节以及逼真的水珠/雾气。不要像参考图那样进行紧凑裁剪；需清晰展现狗狗、两只人手、喷雾瓶以及露营地的环境背景。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788942352509_kpd10v_HRbHd-Ka4AA6isc.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-115",
    title: "电商主图 - 柔和影棚人像，手持粉色设备",
    category: "产品营销",
    industry: "通用",
    description: "一张 2:3 的写实生活风人像，一位戴眼镜的女性在浅蓝色影棚背景下，手持一台淡粉色手持设备。",
    prompt: `创作一张 2:3 的写实竖构图影棚人像，主角为一名 20 岁出头的东亚女性，拥有 ，肤色白皙，面带柔和自然的微笑，佩戴黑色大框长方形眼镜。她呈坐姿或微微前倾，画面展示从上半身到头部的范围，身体向左侧转动四分之三，视线看向画面左侧外。她身穿简约的浅灰色吊带背心或家居上衣，肩带为白色，妆容自然清透，唇色粉嫩，表情轻松温柔。她的右手持有一件物品：一台纤薄的淡粉色手持电子设备，边角圆润，顶部附近有一个小圆按钮和两个微小的指示灯点，竖直持于脸颊旁。使用干净的浅水蓝色无缝背景，柔和的漫射影棚光，浅景深效果，面部细节清晰，皮肤纹理自然，发丝逼真，呈现清新的生活方式/产品摄影质感。构图保持通透，头部位于上方中心，手部和设备位于左下方，画面中不得包含任何文字、Logo、水印或额外道具。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788595162538_l51g3c_HRVlrc4bMAAC5MV.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-116",
    title: "电商主图 - 高端饮品广告海报",
    category: "产品营销",
    industry: "通用",
    description: "一个高端商业提示词，用于创作以 Orbit 视觉逻辑和雕塑感食材爆炸为特色的甜点饮品广告。",
    prompt: `创作一张戛纳级别的旗舰甜点饮品广告海报，品牌为原创高端咖啡品牌 CREMA BLOOM，主打产品为 MOCHA CLOUD SHAKE。画面需采用强烈的 Orbit 视觉逻辑，并呈现出更高级的全球发布主视觉（Key Visual）质感：左侧为一个干净的品牌外带杯，杯顶配有奶油，并带有醒目的堆叠式标题；右侧为一个超现实的放大版食材奇观，咖啡液、奶油和柔软的三明治饼干壳在空中爆炸并交织在一起。最终作品必须呈现出超写实、雕塑感、极简且国际化的高端质感，以饮品作为商业核心，以食材爆炸作为诱人卖点。核心构图：使用宽幅横向海报，背景为干净的薄荷绿或水蓝色，底部带有微妙的桌面平面。布局需在视觉上分为两个区域：左侧包含品牌杯和大型标题，右侧则是宏大的悬浮食材爆炸。保持构图平衡、空间感强且高度易读，呈现出高端广告牌风格的简洁感。Orbit 视觉逻辑：将海报设计为一个闭环的高端视觉流。视线应从左侧外带杯的奶油顶部开始，向上并向内穿过标题块，进入右侧中心的奶油螺旋，跟随咖啡液溅出的光泽弧线环绕食材爆发，然后通过构图下方的视觉重量向左弯曲，回到杯身和品牌区域。每一条主要的曲线和高光都必须支持这种循环感。构图应感觉动态但可控。核心产品逻辑：真正的商业核心是这款高端外带咖啡甜点奶昔。在左侧桌面上放置一个品牌纸杯，杯盖开口处露出奶油顶或类似软冰淇淋的尖顶。杯子必须感觉物理真实、高端且具有全球市场吸引力，具备清晰的图形品牌标识、真实的纸张纹理、微妙的冰镇或冷凝感以及优雅的色块。杯子必须清晰地支撑整个广告活动。食材奇观：在右侧，创建一个巨大的悬浮风味组合，两个巨大的可可棕色三明治饼干或咖啡马卡龙壳似乎分离开来，奶油和光泽的咖啡溅射在它们之间喷涌而出。中心溅射必须呈现出浓郁的摩卡液体围绕着白色奶油漩涡向上碰撞的感觉，水滴和弧线以动态但可控的方式向外飞溅。这一奇观应暗示饮品的核心美味就存在于这个悬浮的风味世界中。风味与材质写实度：以极高的写实度渲染咖啡溅射：半透明的棕色液体、光泽反射、真实的粘度、水滴变化以及平滑的动态张力。奶油必须感觉浓郁、轻盈且高端，具有清晰的螺旋纹理和柔和的高光。饼干壳应具有轻微的纹理感，柔软而有结构，带有可可粉和微妙的烘焙表面细节。每个元素都必须看起来可食用、高端且超写实。排版与品牌：不要使用任何真实的品牌名称或复制的源文本。使用原创的纯英文排版，因为这是一种海外风格的饮品广告。在左侧，产品杯的旁边或上方，放置一个醒目的堆叠式标题块：BEST INSIDE THE MOCHA。使用深可可色、富有表现力的手工字体或高端俏皮的粗体字。保持字体大、图形化且高度易读。在杯子上使用品牌名称：CREMA BLOOM。在右下角，仅放置一个非常小、低调的签名式品牌标记或字母组合，缩小到足以作为一种安静的身份暗示，而不是视觉元素。无需额外的正文内容。光影：使用明亮的高端摄影棚灯光，配合柔和的正面照明和受控的高光，使奶油发光，咖啡溅射闪耀。杯子必须感觉光线清晰且易于辨认，而食材奇观应具有立体感的高光和清晰的边缘分离。薄荷色背景应保持平滑、清新且整洁。色彩方向：使用严格控制的高端调色板，包括冷薄荷蓝、咖啡棕、奶油白、柔和米色和微妙的暖焦糖高光。清新背景与浓郁摩卡食材之间的对比必须营造出海报的商业活力。氛围：俏皮、Orbit 驱动、令人沉醉、高端、清新、雕塑感、极简、全球化质感、商业上令人无法抗拒、世界级奖项水准。渲染风格：超写实旗舰咖啡饮品广告海报，Orbit 驱动的摩卡奶昔主视觉，左侧外带杯核心，右侧咖啡溅射与奶油食材爆炸，薄荷绿背景，醒目的堆叠式排版，低调的签名 Logo，世界级商业食品与饮品摄影，8k。负面提示词：真实品牌名称、复制的源文本、杂乱的布局、产品焦点薄弱、Logo 过大、廉价的溅射效果、浑浊的咖啡色调、低细节杯子、塑料感的奶油、混乱的构图、过多的文字、低分辨率饮品渲染`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788509872579_zb1wli_HRSPpHeb0AANNSN.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-117",
    title: "电商主图 - 奢华腕表产品广告模板",
    category: "产品营销",
    industry: "通用",
    description: "这是一个专为 GPT-Image-2 设计的结构化高端奢华腕表产品摄影提示词。它包含了构图、风格以及由黑色、金色和深灰色组成的精致配色方案的详细规格。",
    prompt: `{
  "type": "产品广告",
  "objective": "",
  "inputs": {
    "subject": "",
    "scene": "",
    "style": "奢华产品摄影",
    "palette": "黑色、金色、深灰色"
  },
  "quality_constraints": {
    "aspect_ratio": "4:5",
    "composition": "居中放置，顶部留有文案空间" 
  },
  "output_requirements": {
    "usage": "电商广告",
    "focus": "表盘与金属质感"
  }
}`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788423031726_6hyzx9_HRPxlC8bgAAEDpS.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-118",
    title: "电商主图 - 奢华护肤品广告",
    category: "产品营销",
    industry: "通用",
    description: "一份用于护肤品牌推广的高端广告提示词，展示了被植物元素和精致灯光环绕的奢华乳液瓶。",
    prompt: `创作一张超写实的奢华商业产品广告，用于高端护肤品牌 ，展示其“”。将一个精致的 250 ml 高椭圆形泵头瓶置于构图中心，以轻微的对角线角度放置，呈现出动态的杂志大片质感。使用  瓶身，表面具有平滑的亲肤触感，并配备拉丝香槟金泵头。标签设计采用优雅的拱形植物图案，灵感源自流动的叶片和细腻的等高线。采用鼠尾草绿、香槟金、暖象牙白和柔和陶土色的高级配色方案。避免复制参考图中矩形标签或橙紫色调的风格。正面标签应清晰准确地显示：AUREVIA, VELVET HYDRATE, Nourishing Body Lotion, Aloe Vera + Shea Butter, Soften • Nourish • Hydrate, 250 ml。在瓶身周围布置精心排列的新鲜芦荟切片、象牙色小花、乳木果、桉树叶及精致的植物元素。添加透明水珠和瓶后优雅的水花溅射，以传达清新与水润感。不要使用橙色调表面，将产品放置在具有细腻天然纹理的浅奶油色洞石平台上。在产品后方引入艺术感的弧形鼠尾草绿背景，营造出层次感和独特的高端布景设计。使用从左上方斜射入的柔和金色日光，在背景上投射出优雅的植物阴影。添加逼真的反射、瓶身上的细小凝露、金色泵头上的微妙高光以及产品下方的柔和阴影。构图应显得精致、清新、自然、现代且昂贵——类似于国际高端护肤品广告。摄影风格：奢华美妆广告、专业产品摄影、微距级材质细节、逼真的液体和水物理效果、清晰的排版、照片级真实的植物纹理、浅景深、高级摄影棚灯光、8K 细节。长宽比：4:5 竖构图。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788336909086_eh9hg4_HRI3sPNXMAAn1B3.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-119",
    title: "电商主图 - 雪花石膏微缩城市雕塑",
    category: "产品营销",
    industry: "通用",
    description: "生成一张电影感微距图像，展现一座雕刻在单条弧形雪花石膏带中的梦幻巴洛克式微缩城市。",
    prompt: `创作一张细节极其丰富的奇幻建筑产品摄影图，展现一座雕刻在单条连续弧形  带中的完整微缩城市。该石带呈大型开口贝壳或环形石带状，直立于深青色摄影棚背景上。城市如同从石材中生长出的奢华巴洛克式地中海微型王国：拥有平滑的白色露台、拱形长廊、微型阶梯、桥梁、柱廊、阳台、透出暖光的窗户，以及如同金缮工艺般贯穿石材的精致金脉纹理。包含 5 个核心地标元素：左上方一座带有黄铜浑天仪屋顶的大型圆形天文台宫殿、右上方一座高耸的灯塔式塔楼、右侧中部露台上一座带有黄铜星盘的小型圆塔、下方中心附近一座小型圆顶凉亭，以及左下方一条长长的拱形渡槽/长廊。在城市中融入绿松石色水景：包括 3 个可见水池和 3 处在露台间流淌的瀑布。在露台各处点缀微型柏树、小花园、开花灌木、苔藓和花盆，但建筑应保持视觉主体地位。天文仪器、精细接缝和精致装饰线条使用 。灯光采用电影级博物馆风格，窗户透出温暖的金色光芒，雕塑后方辅以冷青色环境光；背景为带有柔和雾气的平滑深  渐变色。渲染为一张超精细的收藏级建筑雕塑微距摄影，采用略微俯视的四分之三视角，呈现清晰华丽的细节、半透明石材的次表面散射光、水池上湿润的抛光倒影，具备浅景深效果，画面中无人、无文字、无水印。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788336949567_zvlxkz_HRIpeW1bEAAfM1w.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
  {
    id: "tpl-gi2-120",
    title: "电商主图 - 高级服装一致性规则",
    category: "产品营销",
    industry: "通用",
    description: "一套复杂的指令提示词，用于在 AI 生成过程中保持服装特征的一致性，详细规定了上衣、牛仔裤和运动鞋的高精度细节。",
    prompt: `受保护的服装规则 — 最高优先级：请将以下每件衣服的描述视为不可更改的最终产品标识。请保留其结构、部件、五金件、材质、图案以及所有已注册的图形或标记（包括其表面、侧面、方向、比例、颜色、内容、拼写和数量）。最终穿着状态仅覆盖目标物品的使用方式、位置、侧面、方向、紧固件、叠穿、褶皱、塞入、打结和垂坠感。“源服装”标签代表造型前的单品，而非最终完成的轮廓。请勿重新设计、添加、删除、翻转、复制、重新排列或重绘受保护的细节。服装：上衣：轻盈柔软且带有褶皱感的象牙白棉质露肩短款上衣。特点是修身的躯干和紧密褶皱的胸部面板。褶皱领口上方有一个深 V 型蕾丝花边嵌片，两条细长的象牙白挂脖系带从两个蕾丝尖端延伸出来，形成可调节的系带。短款弹性袖子营造出柔软的荷叶边效果，前中部的抽绳通道使胸部产生褶皱，并垂下两条细长的系带。下摆采用宽大的象牙白镂空刺绣带、花卉镂空和扇形边缘装饰。背面延续了弹性上缘和镂空带，呈现出完全对称的短款轮廓。请将蕾丝嵌片、袖子、系带和镂空下摆整合为一件衣服，不要包含其他内搭、标识、标签或文字。下装：采用中深色靛蓝弹力牛仔布制成的低腰修身五袋牛仔裤。臀部和大腿处紧身，并自然过渡到利落的修身裤腿。请设计带有等距皮带环、中央拉链门襟和圆形银蓝色前扣的塑形腰带。添加弧形前袋、小零钱袋、与外侧袋角对齐的银蓝色装饰铆钉、深色金属加固铆钉、后育克和利落的贴袋。使用同色系的靛蓝缝线、前裆部微妙的猫须纹理、腿部上方的柔和纵向水洗效果以及处理整洁的裤脚。请勿包含皮带、印花图形、标识或可读文本。鞋类：一对解剖学镜像的尘埃天蓝色帆布低帮系带运动鞋。特色是局部的薄荷绿图形和象牙白橡胶。每只鞋都具有紧凑的低帮轮廓、宽大圆润的封闭式鞋头以及略微加厚且几乎水平的平台鞋底。带衬垫的低鞋口环绕着长鞋舌。鞋面结合了蓝色帆布鞋面、相对的鞋带孔面板、宽大的侧片和加固的后跟面板。象牙白橡胶鞋头盖和深象牙白侧墙边缘勾勒出下缘。外侧侧片上绘有密集的薄荷绿银莲花喷绘图案，包含锯齿状叶片、两条卷曲的茎、细致的脉络阴影和圆点装饰。“IVY ARC”大写字母单词沿着象牙白侧墙全周连续重复，以每词 3 个字母、等间距、单行单元的形式呈现，并带有宽大的字间距。银色小孔眼呈偶数列排列，平坦的象牙白鞋带以常规十字交叉方式穿过，并在中央系成紧凑的蝴蝶结。内侧侧片保持纯蓝色帆布，后部面板、象牙白内衬和深色胎面纹理在左右两侧保持一致（解剖学反转除外）。请确保帆布呈哑光质感，橡胶呈柔软质感，植物线条清晰，所有浮雕文字清晰可辨。包袋：紧凑的金属银色迷你托特包，由高光泽金属涂层皮革质感材料制成，具有光滑的连续箔面、坚固的形状保持力、圆润的边缘滚边和抛光银色五金件。包身呈短而近乎长方形的信封状，上角略圆，带有纤细的侧角撑和扁平的加固底座。手柄之间有狭窄的顶部开口。请将正面、背面、侧角撑和底座构建为一个具有连续滚边边缘的结构化包身。将两个短拱形手柄通过细缝线片固定在正面和背面的上部。添加一条细长的配套肩带，其末端夹子固定在侧缝上部的小环上，并清晰展示长方形的长度调节滑块。顶部开口处使用紧凑的拉链和不显眼的抛光滑块闭合。正面、背面、侧角撑和底座上不应包含额外的口袋或图形，肩带锚点、手柄片、滚边、拉链和底座加固件应物理结合在同一个包身上。保持清晰的结构、受控的接缝厚度、平滑的金属覆盖层以及柔和的定向反射。最终穿着状态：视角条件下的身体侧面映射：正面视图 — 穿着者的左侧为图像右侧，穿着者的右侧为图像左侧。背面视图 — 穿着者的左侧为图像左侧，穿着者的右侧为图像右侧。对于侧面视图、交叉肢体或模糊情况，请根据相应的肩部、臀部、眼睛或耳朵标记连续追踪命名的解剖侧面。此状态仅适用于指定的解剖侧面，切勿翻转、互换或复制。- 包袋背法：最终状态：一条已注册的、无扭曲的肩带或链条，两端安装在原始位置，从穿着者的右肩支撑所有重量，穿过解剖学前中心线一次，并将包袋平稳地支撑在穿着者左前方的腰部。包袋背面朝向身体，正面朝外。双手保持空闲。保持已注册的支撑和组件连接，仅允许沿选定路径产生接触和重力造成的松弛。在此操作内的自然处理：在保持选定路径和所有安装点准确的同时，允许根据材料特性产生适度的松弛和与身体的自然接触。`,
    tags: ["来源:awesome-gpt-image-2", "CC-BY-4.0"],
    image: "https://cms-assets.youmind.com/media/1788250549030_t6dvue_HRHE2JmbcAAZ1Lb.jpg",
    gradient: "from-rose-100 to-pink-100",
    popular: false,
  },
];
