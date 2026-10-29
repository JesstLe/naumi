import "server-only";
import { z } from "zod";
import type { TeamActor } from "@/lib/teams/grants";
import { TeamError } from "@/lib/teams/errors";
import { parseBiQuery, biCsvCell, type BiQuery, type BiResponse } from "@/lib/bi/contracts";
import { ARTWORK_COLUMNS, artworkValue } from "@/lib/bi/artwork-view";
import {queryBi} from "@/lib/bi/repository";
import {ensureBiSchema} from "@/lib/bi/schema";

import { enterpriseRead } from "./server";

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
export async function enterpriseArtworks(actor: TeamActor, enterpriseId: string, query: BiQuery): Promise<BiResponse> {
  if (query.section !== "artworks") throw new TeamError("仅支持图片与操作内容", 400);
  await ensureBiSchema();
  return enterpriseRead(actor, enterpriseId, async (client, scope) => {
    // Owners see their enterprise's employees, not the site's users or other owners.
    const allowedEmails = [...scope.visible];
    if (query.email && !scope.visible.has(query.email)) throw new TeamError("没有该成员内容的查看权限");
    return queryBi(query, { client, allowedEmails });
  });
}
export function enterpriseArtworkCsv(data: BiResponse) {
  return "\uFEFF" + [ARTWORK_COLUMNS.map(c => biCsvCell(c.label)).join(","), ...data.rows.map(row => ARTWORK_COLUMNS.map(c => biCsvCell(artworkValue(row[c.key], c.key === "created_at"))).join(","))].join("\r\n");
}
