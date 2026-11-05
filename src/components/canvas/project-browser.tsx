"use client";
import {Image as ImageIcon,GalleryVerticalEnd,Rotate3d,Type,Plus,MoreHorizontal,Pencil,Trash2,type LucideIcon} from "lucide-react";
import {ProjectBrowserSurface,ProjectCover} from "./project-browser-surface";
import {cn,formatDate} from "@/lib/utils";
import type {CanvasProject,CanvasWorkflowKey,canvasProjectMonths} from "@/lib/canvas/project-catalog";
import type {CanvasProjectCatalog} from "./use-canvas-project-catalog";
import {CanvasProjectNameInput} from "./project-name-input";

const CANVAS_WORKFLOWS: Array<{
  key: CanvasWorkflowKey;
  icon: LucideIcon;
  titleKey: string;
}> = [
  { key: "hero", icon: ImageIcon, titleKey: "canvas.workflowHero" },
  { key: "detail", icon: GalleryVerticalEnd, titleKey: "canvas.workflowDetail" },
  { key: "views", icon: Rotate3d, titleKey: "canvas.workflowViews" },
  { key: "copy", icon: Type, titleKey: "canvas.workflowCopy" },
];

type Props={visible?:boolean;months:ReturnType<typeof canvasProjectMonths>;catalog:CanvasProjectCatalog;readOnly:boolean;t:(key:string)=>string;
 onNew:()=>void;onWorkflow:(key:CanvasWorkflowKey)=>void;onOpen:(key:string)=>void;onDelete:(project:CanvasProject)=>void};
export function CanvasProjectBrowser({visible=true,months,catalog,readOnly,t,onNew,onWorkflow,onOpen,onDelete}:Props){return (
<ProjectBrowserSurface visible={visible}>
              <div className="mx-auto w-full max-w-[1680px]">
                <div className="mb-7 flex items-end justify-between border-b border-[#dfe3e8]">
                  <div className="flex items-center gap-7">
                    <button
                      type="button"
                      onClick={() => catalog.setTab("all")}
                      className={cn(
                        "border-b-2 pb-3 text-[15px] font-semibold transition-colors",
                        catalog.tab === "all"
                          ? "border-[#20242c] text-[#20242c]"
                          : "border-transparent text-[#7a8492] hover:text-[#20242c]"
                      )}
                    >
                      {t("canvas.allProjects")}
                    </button>
                    <button
                      type="button"
                      onClick={() => catalog.setTab("workflows")}
                      className={cn(
                        "border-b-2 pb-3 text-[15px] font-semibold transition-colors",
                        catalog.tab === "workflows"
                          ? "border-[#20242c] text-[#20242c]"
                          : "border-transparent text-[#7a8492] hover:text-[#20242c]"
                      )}
                    >
                      {t("canvas.commonWorkflows")}
                    </button>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={onNew}
                      className="mb-2.5 flex h-9 items-center gap-2 bg-[#20242c] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#343a43]"
                    >
                      <Plus className="h-4 w-4" />
                      {t("canvas.newProject")}
                    </button>
                  )}
                </div>

                {catalog.menuKey && (
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => catalog.closeMenu()}
                  />
                )}

                <section className="mb-10">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#20242c]">
                      {t("canvas.commonWorkflows")}
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {CANVAS_WORKFLOWS.map((workflow) => {
                      const WorkflowIcon = workflow.icon;
                      return (
                        <button
                          key={workflow.key}
                          type="button"
                          onClick={() => onWorkflow(workflow.key)}
                          disabled={readOnly}
                          className="group flex min-h-[108px] items-start gap-4 border border-[#dfe3e8] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#aeb7c4] hover:shadow-[0_8px_22px_rgba(16,24,40,0.08)] disabled:cursor-default disabled:opacity-60"
                        >
                          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#dfe3e8] bg-[#f4f6f8] text-[#46505e] group-hover:border-[#b9c4d2] group-hover:bg-[#edf2f6]">
                            <WorkflowIcon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#20242c]">
                              {t(workflow.titleKey)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {catalog.tab === "all" && (
                  <section>
                    <h2 className="mb-4 text-base font-semibold text-[#20242c]">
                      {t("canvas.personalProjects")}
                    </h2>

                    {months.length === 0 && (
                      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={onNew}
                            className="group flex flex-col gap-2 text-left"
                          >
                            <span className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed border-[#bfc7d2] bg-white text-[#697482] transition-colors group-hover:border-[#7f8b9a] group-hover:text-[#20242c]">
                              <Plus className="h-7 w-7" strokeWidth={1.5} />
                              <span className="text-sm font-medium">{t("canvas.startCreate")}</span>
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {months.map((section, sectionIndex) => (
                      <div key={section.key} className="mb-9">
                        <div className="mb-3 flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-[#596473]">
                            {section.label}
                          </h3>
                          <span className="h-px flex-1 bg-[#e3e6ea]" />
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 min-[1920px]:grid-cols-6">
                          {sectionIndex === 0 && !readOnly && (
                            <button
                              type="button"
                              onClick={onNew}
                              className="group flex flex-col gap-2 text-left"
                            >
                              <span className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed border-[#bfc7d2] bg-white text-[#697482] transition-colors group-hover:border-[#7f8b9a] group-hover:text-[#20242c]">
                                <Plus className="h-7 w-7" strokeWidth={1.5} />
                                <span className="text-sm font-medium">{t("canvas.startCreate")}</span>
                              </span>
                            </button>
                          )}

                          {section.projects.map((p) => (
                            <div key={p.key} className="group flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => onOpen(p.key)}
                                title={p.name}
                                className="relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border border-[#d8dde4] bg-white transition-all group-hover:border-[#9da8b6] group-hover:shadow-[0_8px_24px_rgba(16,24,40,0.10)]"
                              >
                                {p.cover ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <ProjectCover source={p.cover} title={p.name} />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-[#f2f4f7] p-5 text-left text-[#525b69]">
                                    <div className="w-full border border-[#dce1e8] bg-white p-3 shadow-sm">
                                      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#7b8491]">
                                        <Type className="h-3.5 w-3.5" /> {t("canvas.textGenerate")}
                                      </div>
                                      <p className="line-clamp-4 whitespace-pre-wrap text-[10px] leading-relaxed">
                                        {p.textNodes[0]?.content || p.textNodes[0]?.prompt || t("canvas.textEmpty")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </button>
                              <div className="flex min-w-0 items-start justify-between gap-2 px-0.5">
                                <div className="min-w-0 flex-1">
                                  {catalog.edit?.key === p.key && !readOnly ? (
                                    <CanvasProjectNameInput projectKey={p.key} names={catalog} className="w-full border border-[#8090a3] bg-white px-1.5 py-0.5 text-sm font-medium text-[#20242c] outline-none"/>
                                  ) : (
                                    <div className="truncate text-sm font-medium text-[#20242c]">
                                      {p.name}
                                    </div>
                                  )}
                                  <div className="truncate text-[11px] text-[#7a8492]">
                                    {formatDate(p.latestAt)}
                                  </div>
                                </div>
                                {!readOnly && (
                                  <div className="relative flex-none">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        catalog.toggleMenu(p.key);
                                      }}
                                      title={t("canvas.more")}
                                      className="-mr-1 flex h-7 w-7 items-center justify-center text-[#7a8492] transition-colors hover:bg-[#e9edf2] hover:text-[#20242c]"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {catalog.menuKey === p.key && (
                                      <div className="menu-pop-down absolute right-0 top-9 z-30 w-32 overflow-hidden border border-[#d8dde4] bg-white p-1 text-[#20242c] shadow-xl">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            catalog.closeMenu();
                                            catalog.begin(p);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-[#f1f3f6]"
                                        >
                                          <Pencil className="h-4 w-4 text-[#7a8492]" />
                                          {t("canvas.rename")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            catalog.closeMenu();
                                            onDelete(p);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm text-[#d24b45] transition-colors hover:bg-[#fff0ef]"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          {t("canvas.deleteProjectShort")}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            </ProjectBrowserSurface>);}
