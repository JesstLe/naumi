"use client";
import Link from "next/link";
import {LayoutGrid,Home,Image as ImageIcon,Trash2,Plus,Pencil,ChevronDown} from "lucide-react";
import type {Dispatch,SetStateAction} from "react";
import {CachedImage} from "@/components/cached-image";
import {BRAND,BRAND_CANVAS_LOGO} from "@/lib/brand";
import {cn} from "@/lib/utils";
import type {CanvasProject} from "@/lib/canvas/project-catalog";
import type {CanvasProjectCatalog} from "./use-canvas-project-catalog";
import {CanvasProjectNameInput} from "./project-name-input";
type TitleProps={active:CanvasProject|null;catalog:CanvasProjectCatalog;readOnly:boolean;open:boolean;setOpen:Dispatch<SetStateAction<boolean>>;t:(key:string)=>string;desktopAppearance?:boolean};
type MenuProps=TitleProps&{lightCanvas:boolean;onBrowse:()=>void;onTrash:()=>void;onNew:()=>void;onDelete:(project:CanvasProject)=>void};

export function CanvasProjectMenu({active,catalog,readOnly,open,setOpen,t,lightCanvas,onBrowse,onTrash,onNew,onDelete}:MenuProps){return <>
        {/* 左上项目下拉:点击外部关闭 */}
        {open && (
          <div
            className="absolute inset-0 z-30"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          className={cn(
            "canvas-ui-surface absolute left-3 top-[108px] z-40 flex max-h-[min(72vh,540px)] w-[min(200px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border transition-all duration-150 md:top-[60px]",
            lightCanvas ? "canvas-ui-light" : "canvas-ui-dark",
            open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          )}
        >
          {/* 项目菜单(对齐原型图3:回到主页/全部项目/创建新项目/重命名/删除项目) */}
          <div className="flex-none border-b border-border p-1.5">
            {/* 全部项目 = 画布的项目网格(不是作品库) */}
            <button
              type="button"
              onClick={onBrowse}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              {t("canvas.allProjects")}
            </button>
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Home className="h-4 w-4 text-muted-foreground" />
              {t("canvas.home")}
            </Link>
            {/* 作品库 = 所有生成作品的画廊(/dashboard),与画布项目区分开 */}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              {t("nav.dashboard")}
            </Link>
            {/* 回收站:已删除的作品(保留 180 天,可恢复) */}
            {!readOnly && (
              <button
                type="button"
                onClick={onTrash}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                {t("canvas.trash")}
              </button>
            )}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onNew}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              {t("canvas.newProject")}
            </button>
            {active && !readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    // 关掉下拉,改名统一在左上 pill 内联完成(避免双输入抢焦点)
                    setOpen(false);
                    catalog.begin(active);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  {t("canvas.rename")}
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(active)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("canvas.deleteProjectShort")}
                </button>
              </>
            )}
          </div>
        </aside>

</>;}

export function CanvasProjectTitle({active,catalog,readOnly,open,setOpen,t,desktopAppearance=false}:TitleProps){return <>
              {/* 左上:logo(点开项目菜单) + 项目名(点进入内联编辑,失焦/回车确定) */}
              <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-1.5rem)]">
                <div
                  data-testid="canvas-project-chrome"
                  className={cn(
                    "canvas-ui-surface flex max-w-full items-center gap-0.5 overflow-hidden rounded-xl border px-1.5 py-1.5 backdrop-blur transition-colors",
                    open && "!border-[var(--canvas-ui-border-strong)]"
                  )}
                >
                  {/* logo:点击展开「项目/重命名/删除…」菜单 */}
                  <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    title={BRAND}
                    className="flex flex-none items-center gap-1 rounded-lg px-1 pr-0.5 transition-colors hover:bg-white/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {desktopAppearance ? <LayoutGrid className="h-5 w-5 text-muted-foreground" /> : <CachedImage
                      src={BRAND_CANVAS_LOGO}
                      alt={BRAND}
                      className="h-7 w-auto max-w-[108px] flex-none rounded-lg object-contain sm:max-w-[140px]"
                    />}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 flex-none text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  {/* 项目名:只读时纯展示;否则点击进入内联编辑 */}
                  {catalog.edit?.key === active?.key && active && !readOnly ? (
                    <CanvasProjectNameInput projectKey={active.key} names={catalog} className="ml-0.5 w-[35vw] max-w-[180px] rounded-lg border border-primary/60 bg-background px-2 py-1 text-sm font-bold text-foreground outline-none" placeholder={t("canvas.renamePlaceholder")}/>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (readOnly || !active) {
                          setOpen((v) => !v);
                          return;
                        }
                        catalog.begin(active);
                      }}
                      title={
                        readOnly ? undefined : t("canvas.rename")
                      }
                      className="ml-0.5 max-w-[35vw] truncate rounded-lg px-2 py-1 text-left text-sm font-bold text-foreground transition-colors hover:bg-white/5 sm:max-w-[200px]"
                    >
                      {active ? active.name : t("canvas.newProject")}
                    </button>
                  )}
                  {readOnly && (
                    <span className="flex-none rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                      只读
                    </span>
                  )}
                </div>
              </div>

</>;}
