import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { TeamActor } from "@/lib/teams/grants";
import { TeamError } from "@/lib/teams/errors";
import { parseBiQuery, biCsvCell, type BiQuery, type BiResponse } from "@/lib/bi/contracts";
import { ARTWORK_COLUMNS, artworkValue } from "@/lib/bi/artwork-view";
import {queryBi, readScopedArtworkExport} from "@/lib/bi/repository";
import {ensureBiSchema} from "@/lib/bi/schema";

import { enterpriseReportRead } from "./server";

export function parseEnterpriseArtworks(params: URLSearchParams) {
  const enterpriseId = z.string().uuid().parse(params.get("enterpriseId"));
  const format = z.enum(["json", "csv"]).parse(params.get("format") || "json");
  if (params.has("section") && params.get("section") !== "artworks") throw new Error("仅支持图片与操作内容");
  const query = parseBiQuery(new URLSearchParams({ ...Object.fromEntries(params), section: "artworks" }));
  if(params.get('period')==='all'){
    if(params.get('from')||params.get('to'))throw new Error('全部日期不能同时指定日期范围');
    query.start='-infinity';query.end='infinity';query.from='';query.to='';
  }
  if (!["", "all", "deleted"].includes(query.status)) throw new Error("记录筛选无效");
  return { enterpriseId, format, query };
}
async function readArtworks<T>(actor: TeamActor, enterpriseId: string, query: BiQuery,
  run: (client: PoolClient, allowedEmails: readonly string[]) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (query.section !== "artworks") throw new TeamError("仅支持图片与操作内容", 400);
  signal?.throwIfAborted();
  await ensureBiSchema();
  return enterpriseReportRead(actor, enterpriseId, async (client, scope) => {
    // Owners see their enterprise's employees, not the site's users or other owners.
    const allowedEmails = [...scope.visible];
    if (query.email && !scope.visible.has(query.email)) throw new TeamError("没有该成员内容的查看权限");
    return run(client, allowedEmails);
  }, signal);
}
export function enterpriseArtworks(actor: TeamActor, enterpriseId: string, query: BiQuery, signal?: AbortSignal): Promise<BiResponse> {
  return readArtworks(actor, enterpriseId, query, (client, allowedEmails) => queryBi(query, { client, allowedEmails }), signal);
}
export async function enterpriseArtworkExport(actor: TeamActor, enterpriseId: string, query: BiQuery, signal?: AbortSignal) {
  const rows = await readArtworks(actor, enterpriseId, query, (client, allowedEmails) => readScopedArtworkExport(client, query, allowedEmails), signal);
  signal?.throwIfAborted();
  return enterpriseArtworkCsv({ rows });
}
export function enterpriseArtworkCsv(data: Pick<BiResponse, "rows">) {
  return "\uFEFF" + [ARTWORK_COLUMNS.map(c => biCsvCell(c.label)).join(","), ...data.rows.map(row => ARTWORK_COLUMNS.map(c => biCsvCell(artworkValue(row[c.key], c.key === "created_at"))).join(","))].join("\r\n");
}
