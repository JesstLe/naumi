import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { facts, fixtureConfig } from "./billing-unit-fixture";
import { quote } from "../src/lib/billing/quote";
async function main() {
    const { createBillingFixture } = await import("./billing-fixture");
    const f = await createBillingFixture(), db = await import("../src/lib/db");
    try {
        const email = await f.user(100), videoId = `billing-video-${randomUUID()}`, canvasId = `billing-canvas-${randomUUID()}`, cfg = fixtureConfig();
        const videoQuote = quote({ version: 1, config: cfg }, facts({ feature: "video.generate" })), canvasQuote = quote({ version: 1, config: cfg }, facts({ feature: "canvas.image", quality: "high" }));
        await db.createVideoTaskWithReservation({ id: videoId, email, model: "fixture", prompt: "fixture", size: "1280x720", seconds: "4", cost: 20, requestBody: "{}", idempotencyKey: videoId, billingQuote: videoQuote } as any);
        await db.createCanvasImageTaskWithReservation({ id: canvasId, email, sourceArtworkId: "fixture", parameters: { qualityAudit: { requested: "high", executed: "medium" } }, cost: 10, metered: true, billingQuote: canvasQuote } as any);
        assert.equal((await db.getVideoTask(email, videoId) as any)?.billingQuote?.configVersion, 1, "Video must persist quote");
        await assert.rejects(() => db.createVideoTaskWithReservation({ id: `different-${videoId}`, email, model: "fixture", prompt: "changed", size: "1280x720", seconds: "4", cost: 20, requestBody: "{}", idempotencyKey: videoId, billingQuote: videoQuote }));
        await assert.rejects(() => db.createCanvasImageTaskWithReservation({ id: canvasId, email, sourceArtworkId: "changed", parameters: {}, cost: 10, metered: true, billingQuote: canvasQuote }));
        const { getBillingRuntime } = await import("../src/lib/billing/server");
        const config = (await getBillingRuntime()).config, initial = await config.current(), next = structuredClone(initial.config);
        next.switches.metering = "off";
        const changed = await config.publish({ id: randomUUID(), expectedVersion: initial.version, config: next, actor: "fixture", reason: "async task switch" });
        try {
            await db.markVideoTaskCreated({ email, id: videoId, upstreamId: `up-${videoId}` });
            await db.stageVideoTaskResult({ email, id: videoId, videoUrl: "/media/fixture.mp4", resultStorageKey: "fixture.mp4" });
            await db.completeVideoTask({ email, id: videoId, artworkId: `art-${videoId}`, videoUrl: "/media/fixture.mp4", resultStorageKey: "fixture.mp4" });
            await db.completeCanvasImageTask({ email, id: canvasId, resultArtworkId: `art-${canvasId}` });
            assert.equal(await db.getCanvasImageTaskChargedCredits(canvasId), 10);
            assert.equal(Number((await f.pool.query("SELECT -delta AS n FROM app_ledger WHERE id=$1", [`led-video-${videoId}`])).rows[0].n), 20);
            await db.completeCanvasImageTask({ email, id: canvasId, resultArtworkId: `art-${canvasId}` });
            assert.equal((await db.getUser(email))?.creditsTotal, 70);
        }
        finally {
            await config.publish({ id: randomUUID(), expectedVersion: changed.version, config: initial.config, actor: "fixture", reason: "fixture restore" });
        }
        const expiredEmail = await f.user(40), expiredVideo = `billing-video-${randomUUID()}`;
        await db.createVideoTaskWithReservation({ id: expiredVideo, email: expiredEmail, model: "fixture", prompt: "fixture", size: "1280x720", seconds: "4", cost: 20, requestBody: "{}", idempotencyKey: expiredVideo, billingQuote: videoQuote });
        await db.markVideoTaskCreated({ email: expiredEmail, id: expiredVideo, upstreamId: `up-${expiredVideo}` });
        await db.stageVideoTaskResult({ email: expiredEmail, id: expiredVideo, videoUrl: "/media/retained.mp4", resultStorageKey: "retained.mp4" });
        await f.pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 second' WHERE email=$1", [expiredEmail]);
        await assert.rejects(() => db.completeVideoTask({ email: expiredEmail, id: expiredVideo, artworkId: `art-${expiredVideo}`, videoUrl: "/media/retained.mp4", resultStorageKey: "retained.mp4" }));
        assert.equal((await db.getVideoTask(expiredEmail, expiredVideo))?.videoUrl, "/media/retained.mp4");
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE id=$1", [`led-video-${expiredVideo}`])).rows[0].n), 0);
        await f.pool.query("UPDATE app_gen_reservations SET created_at='2000-01-01' WHERE job_id=$1", [expiredVideo]);
        await db.sweepStaleReservations(1);
        assert.equal(Number((await f.pool.query("SELECT cost FROM app_gen_reservations WHERE job_id=$1", [expiredVideo])).rows[0].cost), 20);
        const failedId = `billing-canvas-${randomUUID()}`;
        await db.createCanvasImageTaskWithReservation({ id: failedId, email, sourceArtworkId: "fixture", parameters: {}, cost: 10, metered: true, billingQuote: canvasQuote });
        await db.failCanvasImageTask({ id: failedId, email, error: "fixture rejected" });
        await db.failCanvasImageTask({ id: failedId, email, error: "fixture rejected" });
        assert.equal(Number((await f.pool.query("SELECT reserved_credits FROM app_billing_operations WHERE id=$1", [failedId])).rows[0].reserved_credits), 0);
        console.log("PASS video and canvas freeze metering/quotes and settle once");
    }
    finally {
        await f.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
