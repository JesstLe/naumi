/** Source taxonomy only: executable permissions are enforced by the shared dispatcher. */
export const IMAGEGEN_SOURCE = { sha256:"3d1570ccef9e757dfaf19f3ecbfa2b32157827d51106a535beecd7a29c50931d", license:"Apache-2.0", revision:"2026-10-12" } as const;
export const IMAGEGEN_USE_CASES = [
  {id:"photorealistic-natural",label:"写实摄影",mode:"generate",category:"创作",tool:"generate_image",existingSkillIds:[],instructions:"确认主体、场景、构图和光线。生成自然纹理与真实材质，保持用户指定细节；不擅加人物、品牌或故事。"},
  {id:"product-mockup",label:"商品与包装样机",mode:"generate",category:"电商",tool:"generate_image",existingSkillIds:["product-white","product-scene","product-suite","packaging"],instructions:"使用真实商品参考与逐字文案，保留形状、商标和材质；输出视觉样机，不冒充生产工程图。"},
  {id:"ui-mockup",label:"界面视觉样机",mode:"generate",category:"创作",tool:"generate_image",existingSkillIds:[],instructions:"确认页面用途、信息层级与逐字界面文字，生成清晰的位图视觉样机；不声称交付可运行代码。"},
  {id:"infographic-diagram",label:"信息图与图解",mode:"generate",category:"图解",tool:"generate_image",existingSkillIds:[],instructions:"确认用户提供的内容、关系和标签，按阅读顺序生成图解，复核标签准确和关系方向。"},
  {id:"scientific-educational",label:"科学教育图解",mode:"generate",category:"图解",tool:"generate_image",existingSkillIds:[],instructions:"使用用户给出的知识依据和逐字标签，生成教育图解并复核；不编造数据或把未经核实的内容当事实。"},
  {id:"ads-marketing",label:"广告营销",mode:"generate",category:"营销",tool:"generate_image",existingSkillIds:["campaign-poster","ad-creative","social-cover","social-series"],instructions:"确认受众、品牌、真实卖点与逐字文案，生成有层级的广告视觉，不添加虚假背书或价格。"},
  {id:"productivity-visual",label:"演示与业务视觉",mode:"generate",category:"图解",tool:"generate_image",existingSkillIds:[],instructions:"按用户提供的数据和标签组织演示视觉，保持阅读顺序和可读性；位图不冒充可编辑图表。"},
  {id:"logo-brand",label:"品牌与Logo探索",mode:"generate",category:"品牌",tool:"generate_image",existingSkillIds:["brand-visual"],instructions:"保留用户已有品牌标识和配色，生成明确用途的品牌视觉；如实说明位图格式，不声称矢量源文件。"},
  {id:"illustration-story",label:"故事插画与漫画",mode:"generate",category:"创作",tool:"generate_image",existingSkillIds:[],instructions:"确认角色、场景及每格要求，保持角色一致；不同分镜用独立提示词子任务，不把多张变体当分镜。"},
  {id:"stylized-concept",label:"风格概念图",mode:"generate",category:"创作",tool:"generate_image",existingSkillIds:[],instructions:"按明确的媒介、材质和风格线索生成概念图，保留用户主体和构图要求。"},
  {id:"historical-scene",label:"历史场景",mode:"generate",category:"创作",tool:"generate_image",existingSkillIds:[],instructions:"确认时代、地点和服装器物依据，按用户要求生成场景，避免擅加未经确认的历史细节。"},
  {id:"text-localization",label:"图片文字本地化",mode:"edit",category:"编辑",tool:"edit_image_text",existingSkillIds:[],instructions:"确认编辑目标与逐字替换文字，保持原布局、字重层级及未指定内容，复核实际文字。"},
  {id:"identity-preserve",label:"身份保持与试穿",mode:"edit",category:"编辑",tool:"generate_image",existingSkillIds:[],instructions:"确认目标和需保留的身份、姿态与身体特征，只修改明确指定区域；参考图角色不能混淆。"},
  {id:"precise-object-edit",label:"精确物体编辑",mode:"edit",category:"编辑",tool:"generate_image",existingSkillIds:["product-retouch","product-angle","product-color"],instructions:"确认目标、修改对象和不变量；有用户蒙版时使用蒙版局部编辑，未指定区域保持不变。"},
  {id:"lighting-weather",label:"光照与天气",mode:"edit",category:"编辑",tool:"generate_image",existingSkillIds:[],instructions:"只调整指定光照或天气，保留主体、几何结构、构图和已有文案。"},
  {id:"background-extraction",label:"透明背景与抠图",mode:"edit",category:"编辑",tool:"cutout_image",existingSkillIds:[],instructions:"对明确编辑目标移除背景，保留主体、文字、颜色和细节，直接使用当前生图模型输出真实alpha透明图；不要绘制棋盘格或模拟透明底板。"},
  {id:"style-transfer",label:"风格迁移",mode:"edit",category:"编辑",tool:"apply_style",existingSkillIds:[],instructions:"分别确认编辑目标和风格参考，只迁移要求的风格，保留目标主体与结构。"},
  {id:"compositing",label:"多图合成",mode:"edit",category:"编辑",tool:"fuse_images",existingSkillIds:[],instructions:"给每张图分配目标、插入或参考角色，确认位置、比例、透视和光线，再合成并复核。"},
  {id:"sketch-to-render",label:"草图转渲染",mode:"edit",category:"编辑",tool:"generate_image",existingSkillIds:[],instructions:"使用草图作为明确目标或结构参考，保留布局、比例和透视，按要求生成真实材质与光线。"},
] as const;
export type ImagegenUseCase = typeof IMAGEGEN_USE_CASES[number]["id"];
export function imagegenUseCase(id:string|undefined){return IMAGEGEN_USE_CASES.find(item=>item.id===id);}
