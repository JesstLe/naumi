import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import sharp from "sharp";
import { biCsvCell, parseBiQuery, BI_SECTIONS } from "../src/lib/bi/contracts";

async function main() {
  if (
    process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" ||
    new URL(process.env.DATABASE_URL || "http://invalid").hostname !==
      "127.0.0.1"
  )
    throw new Error("Requires isolated local PostgreSQL");
  process.env.SETTINGS_SECRET =
    "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  process.env.NAUMI_MULTI_USER = "1";
  const db = await import("../src/lib/db");
  const bi = await import("../src/lib/bi/repository");
  const native = await import("../src/lib/native-auth");
  const api = await import("../src/app/api/admin/bi/route");
  const profiles = await import("../src/app/api/admin/bi/profile/route");
  const media = await import("../src/app/api/admin/bi/media/route");
  const trace = await import("../src/app/api/admin/bi/trace/route");
  const conversation = await import(
    "../src/app/api/admin/bi/conversation/route"
  );
  const observer = await import("../src/lib/bi/model-observer");
  const sql = db.getPool();
  const { sameSiteBiMutation } = await import("../src/lib/bi/access");
  assert.ok(
    sameSiteBiMutation(
      new Request("http://localhost:3000/api/admin/bi/profile", {
        headers: {
          host: "bi.example.test",
          origin: "https://bi.example.test",
          "x-forwarded-proto": "https",
        },
      }),
    ),
    "Proxy host/protocol preserve legitimate same-site updates",
  );
  assert.ok(
    !sameSiteBiMutation(
      new Request("http://localhost:3000/api/admin/bi/profile", {
        headers: {
          host: "bi.example.test",
          origin: "https://evil.test",
          "x-forwarded-host": "evil.test",
          "x-forwarded-proto": "https",
        },
      }),
    ),
    "Forwarded host cannot authorize an attacker origin",
  );
  await bi.ensureBiSchema();
  await db.setSetting("multi_user_enabled", "1");
  const prefix = `bi-${randomUUID()}`;
  const personal = `${prefix}-personal@example.test`,
    enterprise = `${prefix}-enterprise@example.test`,
    admin = `${prefix}-admin@example.test`;
  const request = (
    suffix: string,
    cookie = "",
    method = "GET",
    body?: unknown,
  ) =>
    new Request(`http://fixture.test/api/admin/bi${suffix}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const cookie = (email: string) =>
    `nv_user=${native.signUserSession(email, Date.now())}`;
  const params = new URLSearchParams({
    from: "2026-10-01",
    to: "2026-10-03",
    q: prefix,
  });
  const query = (section: string, extra: Record<string, string> = {}) =>
    parseBiQuery(
      new URLSearchParams({ ...Object.fromEntries(params), section, ...extra }),
    );
  const job = `${prefix}-job`;
  const artwork = `${prefix}-image`;
  const operation = `${job}:image:0`;
  const gateway = createServer((req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(
      req.headers.authorization,
      "Bearer fixture-router-only-secret",
    );
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        state: "succeeded",
        request_hash: "PRIVATE_FINGERPRINT",
        attempts: [
          {
            state: "succeeded",
            identity: "PRIVATE_IDENTITY",
            key: "PRIVATE_ATTEMPT_KEY",
            duration_ms: 1234,
            route: {
              provider: "mock-provider",
              upstream_model: "actual-supplier-image",
              id: "actual-route",
              api_key: "PRIVATE_PROVIDER_KEY",
            },
            receipt: { TaskID: "PRIVATE_TASK" },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  process.env.NAUMI_BI_ROUTER_URL = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  process.env.NAUMI_BI_ROUTER_TOKEN = "fixture-router-only-secret";
  try {
    for (const email of [personal, enterprise, admin])
      await db.getOrCreateUser(
        email,
        email === enterprise ? "Example Enterprise" : "Example User",
      );
    await db.setUserRole(admin, "admin");
    await sql.query(
      "DELETE FROM app_credit_batches WHERE email IN ($1,$2,$3)",
      [personal, enterprise, admin],
    );
    await sql.query("DELETE FROM app_ledger WHERE email IN ($1,$2,$3)", [
      personal,
      enterprise,
      admin,
    ]);
    await sql.query(
      "UPDATE app_users SET credits_used=20,password_hash='PRIVATE_PASSWORD_HASH' WHERE email=$1",
      [personal],
    );
    await sql.query(
      "INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES($1,$2,300,250,'admin',now()+interval '20 days'),($3,$4,500,500,'admin',now()+interval '60 days'),($5,$2,100,100,'grant',now()-interval '1 day')",
      [
        `${prefix}-batch1`,
        personal,
        `${prefix}-batch2`,
        enterprise,
        `${prefix}-expired`,
      ],
    );
    await bi.updateBiProfile(
      personal,
      {
        accountType: "personal",
        company: "",
        agreedPayPercent: null,
        note: "personal note",
      },
      admin,
    );
    await bi.updateBiProfile(
      enterprise,
      {
        accountType: "enterprise",
        company: "Example Company",
        agreedPayPercent: 80,
        note: "contract note",
      },
      admin,
    );
    await sql.query(
      "INSERT INTO app_ledger(id,email,delta,kind,reason,created_at) VALUES($1,$2,-16,'consume','生图','2026-09-30T16:00:00Z'),($3,$2,3,'refund','退款','2026-10-01T06:00:00Z'),($4,$2,-5,'consume','管理员调整积分','2026-10-01T08:00:00Z'),($5,$2,-2,'','历史记录','2026-10-01T09:00:00Z'),($6,$7,-12,'consume','精修','2026-10-02T15:59:59Z'),($8,$2,-50,'consume','before','2026-09-30T15:59:59Z'),($9,$2,-50,'consume','after','2026-10-03T16:00:00Z')",
      [
        `led-image-${job}`,
        personal,
        `${prefix}-refund`,
        `${prefix}-adminadjust`,
        `${prefix}-legacy`,
        `${prefix}-enterpriseconsume`,
        enterprise,
        `${prefix}-before`,
        `${prefix}-after`,
      ],
    );
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#2163cf" },
    })
      .png()
      .toBuffer();
    for (const [id, email, deleted] of [
      [artwork, personal, false],
      [`${prefix}-second`, personal, false],
      [`${prefix}-third`, enterprise, false],
      [`${prefix}-deleted`, enterprise, true],
    ] as const) {
      await sql.query(
        "INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,resolution,created_at,deleted_at) VALUES($1,$2,'Example Product','generate','=HYPERLINK(test)', $3,'fixture','4K','2026-10-01T06:00:00Z',$4)",
        [
          id,
          email,
          `data:image/png;base64,${png.toString("base64")}`,
          deleted ? new Date() : null,
        ],
      );
    }
    await sql.query(
      "INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,reserved_cost,metered,billing_settled,created_at) VALUES($1,$2,'generate',$3,$4,20,20,true,true,'2026-10-01T00:00:00Z'),($5,$6,'suite',$7,'{}',12,12,true,false,'2026-10-02T00:00:00Z')",
      [
        job,
        personal,
        JSON.stringify({
          status: "done",
          quality: { requested: "xhigh" },
          paidOperations: {
            [operation]: {
              model: "naumi-image-auto",
              state: "done",
              replayable: true,
              gatewayIdentity: "PRIVATE_GATEWAY_IDENTITY",
              result: {
                apiKey: "PRIVATE_API_KEY",
                images: [{ url: "PRIVATE_CACHE_IMAGE" }],
              },
            },
          },
        }),
        JSON.stringify({
          p: {
            model: "naumi-image-auto",
            resolution: "4K",
            userPrompt: "Example Product",
            apiKey: "PRIVATE_API_KEY",
            image: { b64: "PRIVATE_B64" },
          },
        }),
        `${prefix}-pending`,
        enterprise,
        JSON.stringify({
          status: "pending",
          stage: "checking",
          error: "需要核查",
        }),
      ],
    );
    await db.recordImageCostAudit({
      jobId: job,
      email: personal,
      imageId: artwork,
      requestedQuality: "xhigh",
      executedQuality: "medium",
      upstream: "default:naumi-image-auto",
      images: 1,
      billedCredits: 16,
      costCredits: 12,
      marginCredits: 4,
      reason: "upstream-unsupported",
    });
    await sql.query(
      "UPDATE app_image_cost_audit SET created_at='2026-10-01T05:00:00Z' WHERE email=$1",
      [personal],
    );
    await sql.query(
      "INSERT INTO app_image_cost_audit(id,email,requested_quality,executed_quality,upstream,images,created_at) VALUES($1,$2,'','medium','default:legacy',1,'2026-10-01T06:00:00Z')",
      [`${prefix}-legacy-audit`, personal],
    );
    await sql.query(
      "INSERT INTO app_orders(id,email,kind,item_id,credits,amount,status,provider,created_at,paid_at) VALUES($1,$2,'pack','fixture',200,10000,'paid','alipay','2026-10-01T00:00:00Z','2026-10-01T01:00:00Z'),($3,$2,'pack','fixture',300,99900,'paid','mock','2026-10-01T00:00:00Z','2026-10-01T01:00:00Z')",
      [`${prefix}-paid`, enterprise, `${prefix}-mock`],
    );
    const overview = (await bi.queryBi(query("overview"))).overview!;
    assert.equal(overview.accounts, 3);
    assert.equal(overview.enterprises, 1);
    assert.equal(overview.consumed, 28);
    assert.equal(overview.refunded, 3);
    assert.equal(overview.available, 730);
    assert.equal(overview.reserved, 20);
    assert.equal(overview.artworks, 3);
    assert.equal(overview.deletedArtworks, 1);
    assert.equal(overview.tasks, 2);
    assert.equal(overview.review, 1);
    assert.equal(overview.receivedCents, 10000);
    assert.equal(overview.mockCents, 99900);
    assert.equal(overview.downgradedImages, 1);
    assert.equal(overview.daily.length, 3);
    assert.equal(
      overview.daily.reduce((sum, d) => sum + d.consumed, 0),
      28,
    );
    const users = await bi.queryBi(
      query("users", { accountType: "enterprise" }),
    );
    assert.equal(users.total, 1);
    assert.equal(users.rows[0].email, enterprise);
    assert.equal(Number(users.rows[0].agreed_pay_percent), 80);
    assert.equal(Number(users.rows[0].available), 500);
    const operations = await bi.queryBi(
      query("operations", { email: personal }),
    );
    assert.equal(operations.rows[0].requested_model, "naumi-image-auto");
    assert.equal(Number(operations.rows[0].billed_credits), 16);
    assert.equal(Number(operations.rows[0].reserved_credits), 0);
    const models = await bi.queryBi(query("models", { status: "fallback" }));
    assert.equal(models.total, 1);
    assert.equal(models.rows[0].artwork_id, artwork);
    for (const section of BI_SECTIONS) {
      const response = await bi.queryBi(
        query(section, { size: "1", page: "999" }),
      );
      assert.equal(response.rows.length, 0);
      assert.ok(!JSON.stringify(response).includes("PRIVATE_"));
    }
    const ledger = await bi.queryBi(query("ledger"));
    assert.equal(ledger.total, 5);
    assert.equal(
      (await bi.queryBi(query("ledger", { q: "%' OR 1=1 --" }))).total,
      0,
    );
    assert.equal(
      (await bi.queryBi(query("artworks", { status: "deleted" }))).total,
      1,
    );
    for (const headers of ["", cookie(personal), "nv_user=forged"]) {
      for (const route of [api.GET, media.GET, trace.GET])
        assert.equal(
          (
            await route(
              request(`?${params}&id=${artwork}&email=${personal}`, headers),
            )
          ).status,
          404,
        );
      assert.equal(
        (
          await profiles.PUT(
            request("/profile", headers, "PUT", {
              email: personal,
              accountType: "enterprise",
              company: "Forbidden",
              agreedPayPercent: 1,
              note: "",
            }),
          )
        ).status,
        404,
      );
    }
    const allowed = await api.GET(request(`?${params}`, cookie(admin)));
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get("cache-control") || "", /no-store/);
    assert.equal(
      (await api.GET(request("?from=2026-02-31", cookie(admin)))).status,
      400,
    );
    assert.equal(
      (await api.GET(request("?size=1000000", cookie(admin)))).status,
      400,
    );
    const allowedImage = await media.GET(
      request(`/media?id=${artwork}`, cookie(admin)),
    );
    assert.equal(allowedImage.status, 200);
    assert.equal(allowedImage.headers.get("content-type"), "image/webp");
    assert.equal(
      (await sharp(Buffer.from(await allowedImage.arrayBuffer())).metadata())
        .width,
      16,
    );
    const svg = `${prefix}-svg`;
    await sql.query(
      "INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'unsafe','upload','','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','fixture')",
      [svg, personal],
    );
    assert.equal(
      (await media.GET(request(`/media?id=${svg}`, cookie(admin)))).status,
      422,
    );
    const payload = {
      email: enterprise,
      accountType: "enterprise",
      company: "Updated Company",
      agreedPayPercent: 75,
      note: "updated",
    };
    const crossSite = new Request("http://fixture.test/api/admin/bi/profile", {
      method: "PUT",
      headers: {
        cookie: cookie(admin),
        origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal((await profiles.PUT(crossSite)).status, 403);
    assert.equal(
      (
        await profiles.PUT(
          request("/profile", cookie(admin), "PUT", {
            ...payload,
            agreedPayPercent: 0,
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (await profiles.PUT(request("/profile", cookie(admin), "PUT", payload)))
        .status,
      200,
    );
    assert.equal(
      Number(
        (await bi.queryBi(query("users", { email: enterprise }))).rows[0]
          .agreed_pay_percent,
      ),
      75,
    );
    assert.equal(
      (
        await sql.query("SELECT delta FROM app_ledger WHERE id=$1", [
          `led-image-${job}`,
        ])
      ).rows[0].delta,
      -16,
      "CRM discount never changes billing",
    );
    const execution = await trace.GET(
      request(`/trace?id=${job}&email=${personal}`, cookie(admin)),
    );
    assert.equal(execution.status, 200);
    const traceText = await execution.text();
    assert.ok(traceText.includes("actual-supplier-image"));
    assert.ok(!traceText.includes("PRIVATE_"));
    assert.ok(!traceText.includes("fixture-router-only-secret"));
    await sql.query(
      "INSERT INTO app_agent_sessions(email,id,title,messages,updated_at) VALUES($1,$2,'Agent fixture',$3::jsonb,'2026-10-01T06:00:00Z')",
      [
        personal,
        job,
        JSON.stringify([
          { role: "system", content: "PRIVATE_SYSTEM" },
          {
            role: "user",
            content: [
              { type: "text", text: "Improve product image" },
              { type: "image", data: "PRIVATE_IMAGE" },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Completed image" }],
          },
          { role: "toolResult", content: "PRIVATE_TOOL" },
        ]),
      ],
    );
    await sql.query(
      "INSERT INTO app_genchat_sessions(email,id,title,turns,updated_at) VALUES($1,$2,'Genchat fixture',$3::jsonb,'2026-10-01T06:00:00Z')",
      [
        enterprise,
        job + "-chat",
        JSON.stringify([
          { you: "Draw product", line: "Completed", imageUrl: "PRIVATE_IMAGE" },
        ]),
      ],
    );
    assert.equal((await bi.queryBi(query("conversations"))).total, 2);
    assert.equal(
      (
        await conversation.GET(
          request(`/conversation?email=${personal}&id=${job}&kind=agent`),
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await conversation.GET(
          request(
            `/conversation?email=${personal}&id=${job}&kind=agent`,
            cookie(personal),
          ),
        )
      ).status,
      404,
    );
    const chat = await conversation.GET(
      request(
        `/conversation?email=${personal}&id=${job}&kind=agent`,
        cookie(admin),
      ),
    );
    assert.equal(chat.status, 200);
    const chatText = await chat.text();
    assert.ok(chatText.includes("Improve product image"));
    assert.ok(!chatText.includes("PRIVATE_"));
    const gen = await bi.biConversation(
      job + "-chat",
      enterprise,
      "genchat",
      1,
    );
    assert.equal(gen.total, 2);
    assert.equal(gen.messages[0].role, "user");
    assert.equal(gen.messages[1].text, "Completed");
    assert.equal(
      (await bi.biConversation(job, enterprise, "agent", 1)).total,
      0,
      "Conversation IDs retain owner scope",
    );
    await observer.recordBiModelCompletion({
      email: personal,
      operation: "agent",
      operationId: job,
      model: "agent-wire",
      responseModel: "agent-actual",
      state: "agent-completed",
      durationMs: 45,
      inputTokens: 23,
      outputTokens: 7,
    });
    let attempts = 0;
    const reply = await observer.withBiModelContext(
      personal,
      "fixture-call",
      operation,
      () =>
        observer.observeModelCall("wire-model", async () => {
          attempts++;
          return {
            model: "response-model",
            usage: { prompt_tokens: 12, completion_tokens: 8 },
            apiKey: "PRIVATE_NOT_PERSISTED",
            raw: { Authorization: "PRIVATE_NOT_PERSISTED" },
          };
        }),
    );
    assert.equal(reply.model, "response-model");
    assert.equal(attempts, 1);
    const uncertain = Object.assign(new Error("PRIVATE_ERROR_SECRET"), {
      status: 504,
    });
    await assert.rejects(
      observer.withBiModelContext(personal, "fixture-call", operation, () =>
        observer.observeModelCall("wire-model", async () => {
          attempts++;
          throw uncertain;
        }),
      ),
      (error) => error === uncertain,
    );
    assert.equal(attempts, 2, "Telemetry never retries uncertain paid calls");
    await sql.query(
      "UPDATE app_bi_model_calls SET created_at='2026-10-01T06:00:00Z' WHERE email=$1",
      [personal],
    );
    const calls = await bi.queryBi(query("calls"));
    assert.equal(calls.total, 3);
    assert.ok(
      calls.rows.some(
        (r) => r.response_model === "agent-actual" && r.input_tokens === 23,
      ),
    );
    assert.ok(
      calls.rows.some(
        (r) => r.response_model === "response-model" && r.input_tokens === 12,
      ),
    );
    assert.ok(calls.rows.some((r) => r.state === "unknown-result"));
    assert.ok(!JSON.stringify(calls).includes("PRIVATE_"));
    await sql.query(
      "ALTER TABLE app_bi_model_calls RENAME TO app_bi_model_calls_fixture_unavailable",
    );
    try {
      assert.equal(
        await observer.withBiModelContext(
          personal,
          "fixture-call",
          operation,
          () =>
            observer.observeModelCall("wire-model", async () => "paid-success"),
        ),
        "paid-success",
        "Audit failure preserves a successful paid result",
      );
    } finally {
      await sql.query(
        "ALTER TABLE app_bi_model_calls_fixture_unavailable RENAME TO app_bi_model_calls",
      );
    }
    assert.ok(biCsvCell("=HYPERLINK(test)").startsWith("\"'"));
    assert.ok(biCsvCell("\t=SUM(1)").startsWith("\"'"));
    assert.throws(() =>
      parseBiQuery(
        new URLSearchParams({ from: "2026-10-03", to: "2026-10-01" }),
      ),
    );
    assert.throws(() =>
      parseBiQuery(new URLSearchParams({ section: "secrets" })),
    );
    console.log(
      "PRIVATE_BI=PASS: admin boundaries, all data views, independent aggregates, date boundaries, live balances/reservations, real/mock payments, model trace redaction, profile isolation, media and safe CSV",
    );
  } finally {
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    for (const table of [
      "app_bi_access_log",
      "app_bi_model_calls",
      "app_agent_sessions",
      "app_genchat_sessions",
      "app_image_cost_audit",
      "app_image_jobs",
      "app_ledger",
      "app_artworks",
      "app_orders",
      "app_credit_batches",
    ]) {
      const col = table === "app_bi_access_log" ? "actor" : "email";
      await sql.query(`DELETE FROM ${table} WHERE ${col} IN ($1,$2,$3)`, [
        personal,
        enterprise,
        admin,
      ]);
    }
    await sql.query("DELETE FROM app_users WHERE email IN ($1,$2,$3)", [
      personal,
      enterprise,
      admin,
    ]);
    await sql.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
