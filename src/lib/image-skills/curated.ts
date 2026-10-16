/** Curated/adapted public e-commerce workflows; evidence and MIT attribution ship with the preview assets. */
export const CURATED_ECOMMERCE_SKILLS = [
  {
    "id": "official:curated-scene-relight",
    "revision": 1,
    "name": "场景融合与布光",
    "description": "把商品放入指定场景，统一透视、材质与光线",
    "category": "电商",
    "instructions": "先把场景作为构图目标、商品作为主体参考，并分别记录角色。分析承接平面、透视、主光方向和商品材质。商品按等比缩放放入场景，保留瓶身、盖子、Logo及既有文字；对玻璃、金属、哑光分别匹配高光、反射与接触阴影，避免简单叠色、白雾和抹平质感。使用fuse_images或当前可用generate_image，沿用目标场景画幅；复核商品一致性和放置接触后交付。",
    "source": "official",
    "useCase": "compositing",
    "inputs": "场景图、商品图各一张",
    "preview": {
      "src": "/image-skills/previews/product_scene_relight.webp",
      "alt": "场景融合与布光 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-product_scene_relight",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-product_scene_relight.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "ee585bfe1944cc78e4b0c8cb6be432f27b4d0cd4514e071b47be0665bb8b2ee3",
      "imageSha256": "23ec37d0fc7d9f84a33c6ca1825845698b9cbc4533562ea4515f2359fcfc8607"
    }
  },
  {
    "id": "official:curated-layout-recreation",
    "revision": 1,
    "name": "参考版式同款主图",
    "description": "保留参考版式，用自己的商品替换主体",
    "category": "营销",
    "instructions": "分别指定版式参考与商品主体图。提取参考构图、透视、主体位置、留白、配色与字体层级；仅借鉴设计结构，不照抄他牌标识或未授权文字。用用户商品替换原主体，按参考画幅等比排版，匹配光影与接触阴影。参考没有广告文案时不擅自加字，有文案时只使用用户确认的逐字文字，不发明价格或功效。调用generate_image或fuse_images，复核商品Logo和文字，再交付实际结果。",
    "source": "official",
    "useCase": "ads-marketing",
    "inputs": "版式参考、商品图、确认后的文案",
    "preview": {
      "src": "/image-skills/previews/product_ad-v2.0.webp",
      "alt": "参考版式同款主图 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-product_ad-v2.0",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-product_ad-v2.0.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "6a0cd63334b4e365d27b24f0e1cd2b579987ba9fe0f332968457343e4730f3a7",
      "imageSha256": "5c110520f3ca5c0009fdb57f65003eb69b0cb24ccf3745ce7c44d305a33921a4"
    }
  },
  {
    "id": "official:curated-hero-poster",
    "revision": 1,
    "name": "质感商品海报",
    "description": "商品、光影与留白统一的商业海报",
    "category": "营销",
    "instructions": "读取商品参考、品牌色、用途与用户确认的标题。先分主体、承接面、环境层、文字层，给出清晰视觉焦点与文字留白，主光方向和材质高光保持一致。环境物件不得挡住商品轮廓，保留真实Logo、包装结构和用户逐字文案，不猜品牌、价格、功效或背书。使用generate_image完成海报，文字不准确时用edit_image_text修正用户确认的文字。交付前复核清晰度、文案与产品比例。",
    "source": "official",
    "useCase": "ads-marketing",
    "inputs": "商品图、品牌配色、标题与画幅",
    "preview": {
      "src": "/image-skills/previews/poster_product_integration.webp",
      "alt": "质感商品海报 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-poster_product_integration",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-poster_product_integration.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "d6658e0f188822e6354ab96e904bacf9a04cb6cafa9904a191c2245477912e68",
      "imageSha256": "8db5cb128ebe2f264a8e1abef45437c169cbbce865fea2e439e32d3e6c0c474b"
    }
  },
  {
    "id": "official:curated-fashion-tryon",
    "revision": 1,
    "name": "服装上身四视图",
    "description": "同款衣服、同一模特的四张展示图",
    "category": "电商",
    "instructions": "分别指定模特身份参考和衣服/配饰参考，确认许可、姿态、画幅与四个视图。保持模特身份、身形和衣服款式、版型、颜色、纽扣、纹理及配饰一致；不要把未展示的背面细节当真实商品结构。按正面、侧面和两种明确姿态拆为四个独立图片子任务，使用当前允许的generate_image参数与同一风格，不用一张拼接图冒充四张高清成品。每张保持衣服完整，复核面料和姿态后逐张交付。",
    "source": "official",
    "useCase": "identity-preserve",
    "inputs": "模特参考、服装正面、需要的姿态",
    "preview": {
      "src": "/image-skills/previews/fashion_shoot_vton.webp",
      "alt": "服装上身四视图 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-fashion_shoot_vton",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-fashion_shoot_vton.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "136b5a9c04793b8690845dbdc8061d5e54c4198e4676c09f79fb9480ed261ae0",
      "imageSha256": "de891b11482505fab6b9aad09ad5eb949e8ca3f002826f535a4f89472e72879d"
    }
  },
  {
    "id": "official:curated-person-holding",
    "revision": 1,
    "name": "人物持物场景",
    "description": "让人物自然拿起用户商品，保留真实包装",
    "category": "电商",
    "instructions": "给人物图和商品图分配明确角色，确认人物形象、手持位置与输出画幅。只增加指定商品，保持人物身份、姿态与身体比例；调整手指遮挡和握持角度，让商品重量与接触关系自然。保持商品等比、包装颜色、Logo和文字，不添加未经用户确认的代言或功效。使用fuse_images或generate_image，复核手指数量、握持接触、商品朝向和光线后交付。",
    "source": "official",
    "useCase": "compositing",
    "inputs": "人物照片、商品图",
    "preview": {
      "src": "/image-skills/previews/subject_holding_product.webp",
      "alt": "人物持物场景 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-subject_holding_product.app",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-subject_holding_product.app.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "f690d88af21e676b3943e453d814211031293f7e22743dd4e30fd9a60f287eee",
      "imageSha256": "9f287ca2db1f40251a347a65bd68113d8ed919903bbe8e06c6d164087276717b"
    }
  },
  {
    "id": "official:curated-held-product-swap",
    "revision": 1,
    "name": "持物同款商品替换",
    "description": "只替换手中的商品，保留人物与原场景",
    "category": "电商",
    "instructions": "人物原图是编辑目标，商品图是替换主体。明确原商品所在区域，仅替换商品并调整必要手指遮挡；保持人物脸、头发、服饰、姿态、背景、画幅和其他文案不变。新商品按真实比例融入握持空间，保持Logo、颜色、材质和完整结构，匹配环境光影。使用generate_image局部编辑，有用户蒙版时保留蒙版约束；核对人物未改变、商品非拉伸和接触自然后交付。",
    "source": "official",
    "useCase": "precise-object-edit",
    "inputs": "人物持物原图、替换商品图",
    "preview": {
      "src": "/image-skills/previews/subject_product_swap.webp",
      "alt": "持物同款商品替换 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-subject_product_swap.app",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-subject_product_swap.app.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "589fe4d34753fe3f73afb4e90d537444ab20b48372f0beef751b9278b3702226",
      "imageSha256": "c41ccef0118401c8dddc40d5c79e991981b46397c58fc75c4d64fc4d921c9f4b"
    }
  },
  {
    "id": "official:curated-product-detail",
    "revision": 1,
    "name": "商品高清精修",
    "description": "增强真实纹理、边缘和材质，不改变商品",
    "category": "编辑",
    "instructions": "确认输入商品和需要改善的模糊、杂色、光影或边缘区域。优先retouch_product，保持画幅、布局、产品比例、Logo和所有已有文字；只增强真实可见纹理与材质，不编造细字、结构和不存在的细节。使用模型目录实际支持的质量与分辨率，不能把放大插值或不存在的超分工具称为真实新增细节，也不承诺某个固定倍率。放大检查标签、轮廓、反光与白雾，交付实际像素尺寸和精修结果。",
    "source": "official",
    "useCase": "precise-object-edit",
    "inputs": "待精修商品图、需要改善的部位",
    "preview": {
      "src": "/image-skills/previews/utility_nanobanana_pro_product_upscale.webp",
      "alt": "商品高清精修 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · utility_nanobanana_pro_product_upscale",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/utility_nanobanana_pro_product_upscale.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "b90421c7326550d40229d78fa358572a626a58ce7394a74ac68661b5d9967736",
      "imageSha256": "c0cdca91525909943a7fc13cca85a37e9582bd450f38a2dd1cb22cedf22c0a96"
    }
  },
  {
    "id": "official:curated-product-suite",
    "revision": 1,
    "name": "同主题商品套图",
    "description": "统一商品、人物与场景，分别交付四张成品图",
    "category": "电商",
    "instructions": "分别标记商品主体、人物身份和环境参考，确认四张图片的用途与画幅。统一商品外观、配色、材质和光线，规划主图、使用场景、材质细节和人物持物四种明确构图；已有generate_suite参数满足需求时优先使用，否则按四个独立generate_image子任务生成，不能用一张拼图冒充四张成品。缺少真实结构信息时先确认，不创造Logo、文字或卖点；逐张复核商品一致性，保留已完成结果，只对明确失败项按用户确认处理。",
    "source": "official",
    "useCase": "product-mockup",
    "inputs": "商品图、可选人物和场景参考、四个画面用途",
    "preview": {
      "src": "/image-skills/previews/product_suite_grid.webp",
      "alt": "同主题商品套图 · 公开工作流效果参考",
      "kind": "upstream-example"
    },
    "reference": {
      "title": "Comfy Org · templates-2x2_grid-character_bg_product",
      "url": "https://github.com/Comfy-Org/workflow_templates/blob/3e89967349dd95fa68ce3b36966f41d642af8ea7/templates/templates-2x2_grid-character_bg_product.json",
      "license": "MIT",
      "commit": "3e89967349dd95fa68ce3b36966f41d642af8ea7",
      "workflowSha256": "80095f7d4f1bb7e19d5e3d2089c92f0c68ae8a93ab4442ef08c424935190764b",
      "imageSha256": "3e7e33ad3c595321d2e265986787ec67c7be5fbfe772d33a162c6288568cfc23"
    }
  }
] as const;
