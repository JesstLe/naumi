/** Public product facts. Pages, JSON-LD, sitemap and llms.txt share this source. */
export const SEO_ORIGIN = "https://naumi.top";
export const SEO_TITLE = "Naumi - AI 设计与电商出图平台";
export const SEO_DESCRIPTION = "Naumi 是一站式 AI 设计平台，支持 AI 作图、商品场景图、图片编辑与创作画布。上传参考图、描述需求，完成电商主图、营销海报与视觉方案创作。";
export const SEO_IMAGE = `${SEO_ORIGIN}/brand/naumi/social-card.png`;
export const NO_INDEX = { index: false, follow: false } as const;

export function isPublicSeoHost(host: string | null, enterprise = false, fleet = false): boolean {
  if (enterprise || fleet || !host || /[\s/@\\?#]/.test(host)) return false;
  return /^(www\.)?naumi\.top(?::\d+)?$/i.test(host);
}

export type Guide = {
  slug: string; title: string; description: string; tool: string; toolLabel: string;
  modified: string; sections: { title: string; body: string[] }[];
  questions: { question: string; answer: string }[];
};

export const guides: readonly Guide[] = [
  {
    slug: "ai-product-images", title: "如何用 AI 制作电商商品图", tool: "/generate", toolLabel: "开始作图",
    description: "从商品参考图、场景描述到结果检查，了解如何用 Naumi 制作电商主图、场景图与营销海报。",
    modified: "2026-11-11",
    sections: [
      { title: "先确定图片用途", body: [
        "电商主图优先表达商品本身；场景图需要说明商品如何被使用；营销海报还要预留文案区域。开始生成前，先确定投放位置、画面比例和需要展示的卖点，而不是把多种目标塞进同一张图。",
        "Naumi 的创作首页可以输入需求并添加参考图，也可以从 AI 作图工具开始。实际生成需要登录，并以账号当前开放的功能、可用额度和模型选项为准。"
      ] },
      { title: "准备清晰的商品参考图", body: [
        "优先选择主体完整、对焦清楚、没有遮挡的商品照片。需要保留的包装文字、接口、材质纹理和配件应在原图中可见；参考图缺失的细节，生成结果可能会自行补全，不能当作真实商品依据。",
        "同一款商品有多个视角时，为当前画面选择最相关的视角。不要把不同款式或不同包装版本同时当作同一商品的外观约束。"
      ] },
      { title: "把需求写成可执行的画面描述", body: [
        "描述依次包含主体、场景、构图、光线和需要保留的细节。例如：以参考图中的白色保温杯为主体，放在浅灰色桌面上，背景为简洁的厨房，柔和侧光，杯身完整入镜，保留杯盖结构，右侧留出文案区域。",
        "将必须保持的事实与可自由变化的视觉元素分开。商品颜色、形状和标识属于事实；背景、道具和光线属于可调整元素。实际尺寸和质量选项以工具中提供的设置为准。"
      ] },
      { title: "检查后再用于商品发布", body: [
        "逐项核对商品外形、颜色、材质、文字和配件数量，并检查边缘、反射与阴影。小字和标识尤其需要放大核对；画面美观不代表商品信息准确。",
        "需要多个方案时，可以在创作画布中整理参考图与输出结果，逐个比较。保留适用的结果后，再按实际投放平台检查图片比例、文字范围和商品展示要求。"
      ] }
    ],
    questions: [
      { question: "AI 商品图能保证和实物完全一致吗？", answer: "生成结果可能改变商品细节。发布前应对照实物或原始照片，检查形状、颜色、包装文字与配件，不能只以视觉效果判断准确性。" },
      { question: "没有参考图也可以开始吗？", answer: "可以先用文字描述探索构图和场景；用于展示具体在售商品时，建议提供真实商品参考图，并在生成后核对商品信息。" }
    ]
  },
  {
    slug: "product-backgrounds", title: "商品白底图、透明底图与场景图怎么选", tool: "/cutout", toolLabel: "打开抠图工具",
    description: "区分商品白底图、透明底素材和场景图，掌握抠图、背景替换、边缘检查与导出核对的方法。",
    modified: "2026-11-11",
    sections: [
      { title: "三类图片服务不同目标", body: [
        "白底图把商品放在白色背景上，适合清楚展示主体。透明底图将主体与背景分离，方便后续排版和合成。场景图则把商品置于使用环境中，表达尺寸感、用途和氛围。白色背景不是透明背景，文件扩展名也不能证明图片具有透明通道。",
        "先按发布用途选择结果类型，再决定是否抠图或生成场景。如果投放平台要求特定背景与边距，应以该平台的实际规则为准。"
      ] },
      { title: "从原始图片分离主体", body: [
        "在 Naumi 的抠图工具中上传清晰原图，按工具提供的选项处理。主体与背景反差明显、轮廓完整的照片更便于检查；玻璃、毛发、网孔、反光金属和半透明包装需要重点复核。",
        "检查商品内部的孔洞是否被保留，以及白色商品边缘是否被误删。原图中与背景接近的区域，不能仅凭缩略图判断处理效果。"
      ] },
      { title: "替换背景时匹配透视和光线", body: [
        "场景需求应说明承托平面、相机视角、主光方向和主体占比。先让商品与场景的尺度、透视和接触阴影协调，再添加装饰。道具不应遮挡关键卖点，也不应让用户误以为未包含的配件随商品出售。",
        "可以把参考图、背景方案与生成结果放入创作画布进行比较。需要改变背景时，清楚写出保持不变的商品特征，并再次检查结果是否改动了标签或结构。"
      ] },
      { title: "检查导出文件，而不只看预览", body: [
        "需要透明背景时，下载后在支持透明通道的编辑器中检查，并分别放到深色和浅色底上查看边缘。透明图应选择支持 alpha 通道的格式；JPEG 不保留透明度。",
        "检查输出分辨率、裁切范围和压缩后的细节。若结果出现白边、残留背景或错误阴影，回到原图与处理步骤修正，不把预览中的棋盘格当作文件透明度的证明。"
      ] }
    ],
    questions: [
      { question: "白底图和透明底图有什么区别？", answer: "白底图包含实际的白色背景像素；透明底图通过 alpha 通道表示透明区域，方便叠加到其他背景。两者不能直接互相替代。" },
      { question: "下载 PNG 就一定是透明图片吗？", answer: "PNG 支持透明度，但 PNG 文件也可能完全不透明。需要检查实际文件的 alpha 通道与边缘，而不是只看扩展名。" }
    ]
  },
  {
    slug: "creative-canvas", title: "用创作画布整理参考图与 AI 设计方案", tool: "/canvas", toolLabel: "打开创作画布",
    description: "了解 Naumi 创作画布中的参考图、文字节点、图片连接和方案比较，建立清晰的视觉创作流程。",
    modified: "2026-11-11",
    sections: [
      { title: "用画布承载一个明确的创作任务", body: [
        "Naumi 的创作画布用于组织参考素材、文字与生成结果。与单次输入相比，画布更适合需要并列比较、保留不同方案和继续修改的任务，例如同一商品的多种场景图或一组视觉风格方案。",
        "先按项目目标整理素材，将真实商品图与风格参考分开放置。真实商品图约束商品外观；风格参考表达构图、色调或氛围，不应混淆两者的用途。"
      ] },
      { title: "把需求写在文字节点中", body: [
        "文字节点可以记录画面要求和需要保留的事实。普通输入用于编辑和保存内容，不会因为打字就自动调用 AI；润色或生成需要显式操作。将关键要求保留在画布里，比依赖临时聊天记忆更方便后续核对。",
        "每个方案使用能够独立理解的描述，写明主体、场景和变化范围。不要把一条不完整的补充说明当作全部生成需求，否则后续修改时容易丢失约束。"
      ] },
      { title: "连接实际需要使用的输入", body: [
        "画布中的连线用于把相关节点作为下游创作的输入。连接前先确认哪些图片是商品参考、哪些文字是本次提示要求，并检查目标节点当前使用的输入和参数。视觉上靠得近，不等于已经作为生成输入。",
        "只连接当前任务需要的素材，避免不相关的参考图互相干扰。模型、功能与参数以账号可用的实际选项为准；连线本身不代表任务已经提交或产生结果。"
      ] },
      { title: "比较方案并保留修改依据", body: [
        "把不同方案并排查看，对照相同标准检查商品准确性、构图、边缘、光线与文案空间。每次修改尽量围绕一个明确目标，例如只调整背景或主体占比，方便判断改动是否有效。",
        "继续编辑或重新生成前，确认所选图片版本与本次输入。新的生成属于新的执行动作，不等同于保存文字。最终交付前下载并检查实际文件，同时保留适用的参考图与需求说明。"
      ] }
    ],
    questions: [
      { question: "在文字节点里打字会自动生成图片吗？", answer: "普通文字输入用于编辑和保存，不会自动触发图片生成。需要使用相应的生成操作，润色也由用户显式触发。" },
      { question: "图片放在一起就会成为参考输入吗？", answer: "不会。应确认节点之间的实际连接及目标节点的输入设置；画布上的位置关系不能替代输入连接。" }
    ]
  }
];

export const publicPages = [
  { path: "/", title: SEO_TITLE, description: SEO_DESCRIPTION },
  { path: "/about", title: "关于 Naumi", description: "了解 Naumi 的 AI 设计、图片编辑与电商视觉创作能力。" },
  { path: "/contact", title: "联系 Naumi", description: "通过 Naumi 联系页面获取客户支持与商务合作渠道。" },
  { path: "/privacy", title: "隐私政策", description: "了解 Naumi 如何处理账号、创作素材与使用数据。" },
  { path: "/terms", title: "服务条款", description: "了解 Naumi 服务的使用条款与用户责任。" },
  { path: "/guides", title: "AI 设计使用指南", description: "Naumi 使用指南：电商商品图、背景处理与创作画布的实际操作方法和常见问题。" },
  ...guides.map(g => ({ path: `/guides/${g.slug}`, title: g.title, description: g.description }))
] as const;

export function publicPage(path: string) { return publicPages.find(p => p.path === path); }
export function canonicalUrl(path: string) {
  if (!publicPage(path)) throw new Error(`Not a public SEO page: ${path}`);
  return `${SEO_ORIGIN}${path === "/" ? "/" : path}`;
}
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
export function publicRobots(enabled: boolean) {
  return enabled ? {
    rules: { userAgent: "*", allow: [...publicPages.map(p => `${p.path}$`), "/llms.txt$", "/sitemap.xml$", "/robots.txt$", "/_next/", "/brand/"], disallow: "/" },
    sitemap: `${SEO_ORIGIN}/sitemap.xml`, host: SEO_ORIGIN,
  } : { rules: { userAgent: "*", disallow: "/" } };
}
export function llmsText() {
  return ["# Naumi", "", `> ${SEO_DESCRIPTION}`, "", `Official website: ${SEO_ORIGIN}/`, "Primary language: Simplified Chinese (zh-CN).", "",
    "## Product", "", "Naumi provides AI image creation, image editing and a creative canvas. Product-image workflows include reference images, scene descriptions and result comparison. Generation requires login and depends on the account's enabled features and available credits.", "",
    "## Public pages", "", ...publicPages.map(p => `- [${p.title}](${canonicalUrl(p.path)}): ${p.description}`), "",
    "## Accuracy", "", "The public guides are the source for workflow details. Do not infer prices, model availability, user counts, guarantees or commercial usage rights from this file. Check the current product interface and service terms. Account data, private creations, prompts, API responses and admin pages are not public reference material.", "",
  ].join("\n");
}
export function homeJsonLd() {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${SEO_ORIGIN}/#organization`, name: "Naumi", url: `${SEO_ORIGIN}/`, logo: `${SEO_ORIGIN}/brand/naumi/app-dark.png` },
    { "@type": "WebSite", "@id": `${SEO_ORIGIN}/#website`, name: "Naumi", url: `${SEO_ORIGIN}/`, inLanguage: "zh-CN", publisher: { "@id": `${SEO_ORIGIN}/#organization` } },
    { "@type": "WebPage", "@id": `${SEO_ORIGIN}/#webpage`, url: `${SEO_ORIGIN}/`, name: SEO_TITLE, description: SEO_DESCRIPTION, isPartOf: { "@id": `${SEO_ORIGIN}/#website` }, about: { "@id": `${SEO_ORIGIN}/#application` } },
    { "@type": "SoftwareApplication", "@id": `${SEO_ORIGIN}/#application`, name: "Naumi", url: `${SEO_ORIGIN}/`, applicationCategory: "DesignApplication", operatingSystem: "Web", description: SEO_DESCRIPTION, publisher: { "@id": `${SEO_ORIGIN}/#organization` } },
  ] };
}
export function guideJsonLd(guide: Guide) {
  const path = `/guides/${guide.slug}`, url = canonicalUrl(path);
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": `${url}#article`, headline: guide.title, description: guide.description, url, mainEntityOfPage: url, inLanguage: "zh-CN", dateModified: guide.modified, author: { "@type": "Organization", name: "Naumi", url: `${SEO_ORIGIN}/` }, image: SEO_IMAGE },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Naumi", item: `${SEO_ORIGIN}/` }, { "@type": "ListItem", position: 2, name: "使用指南", item: canonicalUrl("/guides") }, { "@type": "ListItem", position: 3, name: guide.title, item: url } ] },
    { "@type": "FAQPage", "@id": `${url}#questions`, mainEntity: guide.questions.map(q => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })) },
  ] };
}
