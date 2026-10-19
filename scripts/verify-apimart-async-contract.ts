import assert from "node:assert/strict";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { modelConfigSchema, validateModelConfig } from "../src/lib/model-config/schema";

const config=fixtureModelConfig("https://supplier.fixture.invalid/v1","11111111-1111-4111-8111-111111111111");
config.providers[0].protocol="apimart-images";
// Version-independent probe: the old schema must reject, not silently strip,
// this opt-in. This fixture never contacts the host in the example endpoint.
Object.assign(config.upstreamModels[0].parameterMap,{
  apimartImages:{schemaVersion:1,maxOutputs:1,supportsMask:false,ratios:["1:1"]},
  qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"标准"}]},
  resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1MP","2K":"2K"}},
});
const expected=!process.argv.includes("--expect-disabled");
const available=modelConfigSchema.safeParse(config).success;
assert.equal(available,expected);
if(available) {
  const validated=validateModelConfig(config);
  assert.ok(validated.upstreamModels[0].parameterMap.apimartImages);
  const wrongProtocol=structuredClone(config);wrongProtocol.providers[0].protocol="openai-images";
  assert.throws(()=>validateModelConfig(wrongProtocol));
  const missingPolicy=structuredClone(config);delete missingPolicy.upstreamModels[0].parameterMap.qualityPolicy;
  assert.throws(()=>validateModelConfig(missingPolicy));
  const legacy=structuredClone(config);delete legacy.upstreamModels[0].parameterMap.apimartImages;
  assert.throws(()=>validateModelConfig(legacy));
}
console.log(`ASYNC_OPT_IN=${available}; CONTRACT_PROBE=PASS; REAL_PAID_API_CALLS=0`);
