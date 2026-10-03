import assert from "node:assert/strict";
import { createBillingFixture } from "./billing-fixture";
async function main() {
    process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
    const f = await createBillingFixture();
    try {
        const email = await f.user(100), { signUserSession } = await import("../src/lib/native-auth"), { resolveBillingFacts } = await import("../src/lib/billing/server"), { getOpenAISettings } = await import("../src/lib/settings"), { quote } = await import("../src/lib/billing/quote"), { fixtureConfig } = await import("./billing-unit-fixture");
        const request = new Request("http://localhost/api/billing/quote", { headers: { cookie: `nv_user=${signUserSession(email, Date.now())}` } });
        const facts = await resolveBillingFacts(request, { feature: "tool.retouch", quantity: 1 });
        assert.equal(facts.modelId, (await getOpenAISettings()).model, "Default model must match the execution route");
        assert.equal(facts.providerId, "openai-images");
        process.env.VIDEO_API_BASE_URL = "http://localhost:39999/v1";
        process.env.VIDEO_API_KEY = "fixture";
        process.env.VIDEO_API_MODEL = "sora-2";
        const video = await resolveBillingFacts(request, { feature: "video.generate", quantity: 1, resolution: "720p" });
        assert.equal(video.providerId, "openai-videos");
        assert.equal(video.modelId, "sora-2");
        assert.equal(quote({ version: 1, config: fixtureConfig() }, video).facts.resolution, "720p", "Video resolution tiers retain their actual identifiers");
        console.log("PASS public quotes derive execution defaults and video provider facts");
    }
    finally {
        await f.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
