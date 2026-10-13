// Only the parallel desktop surface rewrites these destinations.
export const DESKTOP_PAGES = ["canvas", "suite", "works", "tools", "account", "generate", "aplus", "avatar", "batchshot", "competitors", "cutout", "dewatermark", "dewrinkle", "extract", "fuse", "garment", "garment3d", "inpaint", "ipcheck", "packaging3d", "printfile", "recolor", "replicate", "retouch", "style", "titles", "tryon", "upscale", "variations", "video"] as const;
export function desktopHref(href: string, desktop = true): string {
  if (!desktop || !href.startsWith("/") || href.startsWith("//")) return href;
  const boundary = href.search(/[?#]/);
  const path = boundary < 0 ? href : href.slice(0, boundary);
  const suffix = boundary < 0 ? "" : href.slice(boundary);
  if (path === "/" || path === "/dashboard") return "/desktop" + suffix;
  if (path === "/brain" || path === "/agent") return "/desktop/create" + suffix;
  return DESKTOP_PAGES.some(p => path === `/${p}`) ? "/desktop" + path + suffix : href;
}
