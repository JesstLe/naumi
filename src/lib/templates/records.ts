
// --- Templates ------------------------------------------------------------

export type TemplateRow = {
  id: string;
  title: string;
  category: string;
  industry: string;
  description: string;
  prompt: string;
  tags: string[];
  image: string;
  gradient: string;
  popular: boolean;
  homepageFeatured?: boolean;
  sourceImage?: string; // 白底原图(作品转模板带进来的);爬来的库模板为空
};

// SQL 列名 → JS key (DB 用 snake_case, JS 用 camelCase 透出去)
export type TemplateRowRaw = Omit<TemplateRow, "homepageFeatured" | "sourceImage"> & {
  homepage_featured?: boolean;
  source_image?: string;
};

export function rowToTemplate(r: TemplateRowRaw): TemplateRow {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    industry: r.industry,
    description: r.description,
    prompt: r.prompt,
    tags: r.tags ?? [],
    image: r.image,
    gradient: r.gradient,
    popular: r.popular === true,
    homepageFeatured: r.homepage_featured === true,
    sourceImage: r.source_image ?? "",
  };
}
