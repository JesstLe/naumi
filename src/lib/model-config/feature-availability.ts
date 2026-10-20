type ExecutionCatalog = {
  managed: boolean;
  supported?: boolean;
  available?: boolean;
  models: readonly { id: string }[];
};

export type FeatureExecutionBlock = "loading" | "failed" | "unavailable";

/** A configured processor can be ready without exposing a selectable model. */
export function featureExecutionBlock(catalog: ExecutionCatalog | null, error?: string | null): FeatureExecutionBlock | null {
  if (error) return "failed";
  if (!catalog) return "loading";
  if (!catalog.managed) return null;
  if (catalog.available === false) return "unavailable";
  if (catalog.available === true || catalog.supported === false) return null;
  return catalog.models.length ? null : "unavailable";
}

export function featureExecutionMessage(block: FeatureExecutionBlock, locale: string): string {
  const messages = {
    loading: ["正在加载处理配置", "Loading processing configuration"],
    failed: ["处理配置加载失败，请重试", "Processing configuration failed to load. Please retry."],
    unavailable: ["当前功能暂不可用，请联系管理员配置", "This tool is unavailable. Please contact an administrator."],
  };
  return messages[block][locale === "en" ? 1 : 0];
}
