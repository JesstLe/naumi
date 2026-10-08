import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { initialConfig, price, type Catalog } from "../core";
import { PricingStore } from "../store";

const out=resolve("output/pricing-service-20261008"),catalogPath=resolve("services/pricing-service/catalog.json");
mkdirSync(out,{recursive:true});
const catalog:Catalog=JSON.parse(readFileSync(catalogPath,"utf8")),config=initialConfig(catalog);
const input={publicId:"gpt-image2.5",resolution:"4K",ratio:"1:1",quality:"medium",quantity:1};
const mode=process.argv[2];
if(mode==="baseline"){
  const p=price({...config,multiplier:"1"},catalog,input);
  console.log(`BASELINE multiplier=1 fx=7 input=4K:1:1:medium costUsd=${p.costUsd} saleCny=${p.saleCny} scope=${p.costScope}`);
}else if(mode==="modified"){
  const p=price(config,catalog,input);
  copyFileSync(resolve("services/pricing-service/core.ts"),resolve(out,"MODIFIED_FILE.ts"));
  writeFileSync(resolve(out,"SOURCE_HASH.txt"),`catalog.sha256=${createHash("sha256").update(readFileSync(catalogPath)).digest("hex")}\noriginal-money.sha256=${createHash("sha256").update(readFileSync(resolve("src/lib/billing/money.ts"))).digest("hex")}\n`);
  console.log(`MODIFIED multiplier=3 fx=7 input=4K:1:1:medium costUsd=${p.costUsd} saleCny=${p.saleCny} scope=${p.costScope}`);
}else if(mode==="prepare-rollback"){
  const path=resolve(out,"rollback-copy.sqlite"),store=new PricingStore(path,catalogPath);
  try{const old=store.snapshot();const saved=store.saveDraft({...config,multiplier:"4"},store.draft().revision,"fixture");store.publish(old.version,saved.revision,"separate-copy rollback preparation","fixture");console.log(`ROLLBACK_COPY_READY version=${store.snapshot().version} multiplier=4`);}finally{store.close();}
}else if(mode==="check-rollback"){
  const store=new PricingStore(resolve(out,"rollback-copy.sqlite"),catalogPath);
  try{const s=store.snapshot(),p=price(s.config,catalog,input);if(s.config.multiplier!=="3"||p.saleCny!=="0.747432000")throw Error("restored behavior mismatch");console.log(`RESTORED version=${s.version} multiplier=${s.config.multiplier} saleCny=${p.saleCny} productionApplied=false`);}finally{store.close();}
}else throw Error("unknown evidence mode");
