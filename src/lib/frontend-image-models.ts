type FrontendImageModel = { id: string; label?: string };

/** Presentation-only retirement. Admin inventories and frozen execution stay intact. */
export function isFrontendImageModelVisible(model: FrontendImageModel): boolean {
  const imagen4 = /(?:^|[/:\s·])imagen[-_ ]?4(?=$|[.\s_:/-])/i;
  return !imagen4.test(model.id) && !imagen4.test(model.label || "");
}

export function frontendImageModels<T extends FrontendImageModel>(models: T[]): T[] {
  return models.filter(isFrontendImageModelVisible);
}

type FrontendImageCatalog = {
  models: FrontendImageModel[];
  defaultModelId?: string;
  bindings?: Record<string, string>;
  bindingCapabilities?: Record<string, unknown>;
  available?: boolean;
};

/** Retired defaults/bindings must not reintroduce a model into a selector. */
export function frontendImageCatalog<T extends FrontendImageCatalog>(catalog: T): T {
  const models = frontendImageModels(catalog.models);
  const visible = new Set(models.map(model => model.id));
  const retired = new Set(catalog.models.filter(model => !isFrontendImageModelVisible(model)).map(model => model.id));
  const bindings = catalog.bindings && Object.fromEntries(
    Object.entries(catalog.bindings).filter(([, id]) => !retired.has(id) && isFrontendImageModelVisible({ id })),
  );
  const removedBindings = new Set(Object.keys(catalog.bindings || {}).filter(binding => !(binding in (bindings || {}))));
  return {
    ...catalog,
    models,
    defaultModelId: visible.has(catalog.defaultModelId || "") ? catalog.defaultModelId : models[0]?.id,
    ...(catalog.available === undefined || retired.size === 0 ? {} : { available: catalog.available && models.length > 0 }),
    ...(bindings ? { bindings } : {}),
    ...(catalog.bindingCapabilities && bindings ? { bindingCapabilities: Object.fromEntries(
      Object.entries(catalog.bindingCapabilities).filter(([binding]) => !removedBindings.has(binding)),
    ) } : {}),
  };
}
