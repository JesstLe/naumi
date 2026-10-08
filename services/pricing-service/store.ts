import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { initialConfig, validateConfig, price, quoteSchema, prepareQuickPreset, type Catalog, type PricingConfig } from "./core";

// Node 24 built-in SQLite; no extra driver, project .env or production DB access.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
export class ServiceError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export type Snapshot = { version: number; digest: string; config: PricingConfig; reason: string; actor: string; createdAt: string };
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export class PricingStore {
  private db: any;
  readonly catalog: Catalog;
  constructor(path: string, catalogPath: string) {
    this.catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS versions(version INTEGER PRIMARY KEY,config TEXT NOT NULL,digest TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),current_version INTEGER NOT NULL,draft TEXT NOT NULL,draft_revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS simulated_upstream(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,digest TEXT NOT NULL,acknowledged_at TEXT NOT NULL);
      PRAGMA user_version=2;`);
    this.tx(() => {
      if (!this.db.prepare("SELECT 1 FROM state WHERE id=1").get()) {
        const config = initialConfig(this.catalog), now = new Date().toISOString();
        this.db.prepare("INSERT INTO versions VALUES(1,?,?,?,?,?)").run(JSON.stringify(config), digest(config), "首次独立初始化", "system", now);
        this.db.prepare("INSERT INTO state VALUES(1,1,?,1)").run(JSON.stringify(config));
      }
      if (!this.db.prepare("SELECT 1 FROM simulated_upstream WHERE id=1").get()) this.acknowledge(this.snapshot());
    });
  }
  private tx<T>(fn: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const r = fn(); this.db.exec("COMMIT"); return r; } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  close() { this.db.close(); }
  snapshot(version?: number): Snapshot {
    const r = version === undefined ? this.db.prepare("SELECT v.* FROM versions v JOIN state s ON v.version=s.current_version WHERE s.id=1").get() : this.db.prepare("SELECT * FROM versions WHERE version=?").get(version);
    if (!r) throw new ServiceError(404, "VERSION_NOT_FOUND", "版本不存在");
    return { version: r.version, digest: r.digest, config: JSON.parse(r.config), reason: r.reason, actor: r.actor, createdAt: r.created_at };
  }
  draft() { const r = this.db.prepare("SELECT draft,draft_revision,current_version FROM state WHERE id=1").get(); return { revision: r.draft_revision, basedOnVersion: r.current_version, config: JSON.parse(r.draft) as PricingConfig }; }
  saveDraft(config: unknown, expectedRevision: number, actor: string) {
    const parsed = validateConfig(config, this.catalog);
    return this.tx(() => {
      if (this.draft().revision !== expectedRevision) throw new ServiceError(409, "DRAFT_CONFLICT", "草稿已变化，请重新加载");
      this.db.prepare("UPDATE state SET draft=?,draft_revision=draft_revision+1 WHERE id=1").run(JSON.stringify(parsed));
      this.audit("save-draft", actor, "保存独立定价草稿"); return this.draft();
    });
  }
  publish(expectedVersion: number, expectedRevision: number, reason: string, actor: string) {
    return this.tx(() => {
      const current = this.snapshot(), draft = this.draft();
      if (current.version !== expectedVersion || draft.revision !== expectedRevision) throw new ServiceError(409, "VERSION_CONFLICT", "版本或草稿冲突，请重新加载");
      const config = validateConfig(draft.config, this.catalog);
      return this.install(config, reason, actor);
    });
  }
  rollback(targetVersion: number, expectedVersion: number, reason: string, actor: string) {
    return this.tx(() => {
      if (this.snapshot().version !== expectedVersion) throw new ServiceError(409, "VERSION_CONFLICT", "当前版本已变化");
      return this.install(this.snapshot(targetVersion).config, reason, actor);
    });
  }
  private install(config: PricingConfig, reason: string, actor: string) {
    const version = this.db.prepare("SELECT MAX(version)+1 AS v FROM versions").get().v;
    this.db.prepare("INSERT INTO versions VALUES(?,?,?,?,?,?)").run(version, JSON.stringify(config), digest(config), reason, actor, new Date().toISOString());
    this.db.prepare("UPDATE state SET current_version=?,draft=?,draft_revision=draft_revision+1 WHERE id=1").run(version, JSON.stringify(config));
    const installed = this.snapshot(); this.acknowledge(installed);
    this.audit("apply", actor, reason); return installed;
  }
  private audit(action: string, actor: string, reason: string) { this.db.prepare("INSERT INTO audit(action,actor,reason,created_at) VALUES(?,?,?,?)").run(action, actor, reason, new Date().toISOString()); }
  history() { return this.db.prepare("SELECT version,digest,reason,actor,created_at AS createdAt FROM versions ORDER BY version DESC LIMIT 100").all(); }
  private acknowledge(snapshot: Snapshot) {
    this.db.prepare("INSERT INTO simulated_upstream VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,digest=excluded.digest,acknowledged_at=excluded.acknowledged_at").run(snapshot.version, snapshot.digest, new Date().toISOString());
  }
  upstreamState() {
    const row = this.db.prepare("SELECT version,digest,acknowledged_at AS acknowledgedAt FROM simulated_upstream WHERE id=1").get();
    return { ...row, mode: "simulated", status: "acknowledged", productionApplied: false, realUpstreamApplied: false };
  }
  quickApply(input: unknown, expectedVersion: number, expectedRevision: number, actor: string) {
    return this.tx(() => {
      const current = this.snapshot(), draft = this.draft();
      if (current.version !== expectedVersion || draft.revision !== expectedRevision) throw new ServiceError(409, "VERSION_CONFLICT", "配置已变化，请重新加载后预览");
      if (digest(validateConfig(draft.config, this.catalog)) !== digest(validateConfig(current.config, this.catalog))) throw new ServiceError(409, "UNPUBLISHED_DRAFT", "存在未应用草稿，请先应用或回滚草稿，避免快速配置覆盖修改");
      const prepared = prepareQuickPreset(current.config, this.catalog, input);
      const published = this.install(prepared.config, `快速配置 ${prepared.preset.publicId}`, actor);
      return { current: published, preview: prepared.preview, upstream: this.upstreamState(), productionApplied: false };
    });
  }
  freeze(input: unknown, key: string) {
    return this.tx(() => {
      const normalized = quoteSchema.parse(input);
      const fingerprint = digest(normalized), existing = this.db.prepare("SELECT fingerprint,result FROM quotes WHERE idempotency_key=?").get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new ServiceError(409, "QUOTE_CONFLICT", "同一报价编号不能用于不同参数");
        return { ...JSON.parse(existing.result), replayed: true };
      }
      const snapshot = this.snapshot(), result = { ...price(snapshot.config, this.catalog, normalized), id: randomUUID(), configVersion: snapshot.version, configDigest: snapshot.digest, quotedAt: new Date().toISOString(), replayed: false, mode: "standalone-preview", productionApplied: false };
      this.db.prepare("INSERT INTO quotes VALUES(?,?,?,?,?,?)").run(result.id, key, fingerprint, JSON.stringify(snapshot), JSON.stringify(result), result.quotedAt);
      return result;
    });
  }
  getQuote(id: string) { const r = this.db.prepare("SELECT result FROM quotes WHERE id=?").get(id); if (!r) throw new ServiceError(404, "QUOTE_NOT_FOUND", "报价不存在"); return JSON.parse(r.result); }
  exportPackage() {
    const s = this.snapshot();
    return { schema: "naumi-pricing-review/v1", mode: "review-only", productionReady: false, ...s,
      catalogSources: this.catalog.sources, blockers: ["尚未核验生产实际供应商账号、会员价格及EXT升级", "预算汇率不等于实际充值成本", "需接入现有权限、PostgreSQL版本事务、Router、预占结算和完整usage", "原生输出估计不能替代完整API报价", "未设置积分兑换时不可生产扣费"] };
  }
}
