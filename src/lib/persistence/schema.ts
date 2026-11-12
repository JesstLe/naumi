import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import "server-only";
import {getPool} from "@/platform/db/pool";
import {applyBillingSchema,markBillingSchemaReady} from "../billing/schema";
import {withSchemaInitialization} from "../schema-initialization";
import type {PoolClient} from "pg";

/** Preserve rows, relation identity, indexes and triggers while upgrading old
 * globally-keyed sessions. Runs under the existing namespace DDL transaction. */
async function ensureAgentSessionKeyTx(tx: PoolClient) {
    const table = "app_agent_sessions";
    const {rows} = await tx.query<{name:string;columns:string[]}>(`
      SELECT c.conname AS name, array_agg(a.attname::text ORDER BY k.position) AS columns
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum,position)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
      WHERE c.contype='p' AND c.conrelid=$1::regclass GROUP BY c.conname`, [table]);
    const primary = rows[0];
    if (primary?.columns.length === 2 && primary.columns[0] === "email" && primary.columns[1] === "id") return;
    if (primary) await tx.query(`ALTER TABLE ${table} DROP CONSTRAINT "${primary.name.replace(/"/g,'""')}"`);
    await tx.query(`ALTER TABLE ${table} ADD PRIMARY KEY (email,id)`);
}

/** Application storage compatibility initializer, not the generic DB platform.
 * It does not import business repositories or the legacy db facade. R4B moves
 * runtime DDL to an explicit lifecycle; this boundary keeps old startup behavior. */

export async function ensureSchema(): Promise<void> {
 const state=databaseSchemaReadiness(getPool(),"core");
  if(process.env.FLEET_PORTAL_ONLY==='1'||process.env.NAUMI_AUTH_LOGIN_ONLY==='1'){
    // Central sidecar must never run general application migrations against a live mixed-version site.
    // Fleet's additive namespace is initialized separately; business/auth schema stays server-owned.
    if(!state.pending)state.pending=(async()=>{
      await getPool().query('SELECT email,name,role,banned,auth_revoked_before,account_expires_at FROM app_users LIMIT 0');
      await getPool().query('SELECT k,v FROM app_settings LIMIT 0');
    })().catch(error=>{state.pending=null;throw error;});
    return state.pending;
  }
  if (!state.pending) {
    state.pending = withSchemaInitialization(getPool(),async schemaDb => {
      await schemaDb.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          email         text PRIMARY KEY,
          name          text NOT NULL,
          plan          text NOT NULL DEFAULT 'starter',
          credits_total integer NOT NULL DEFAULT 20,
          credits_used  integer NOT NULL DEFAULT 0,
          joined_at     timestamptz NOT NULL DEFAULT now(),
          renews_at     timestamptz NOT NULL
        );
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS management_version integer NOT NULL DEFAULT 0;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_revoked_before timestamptz;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_expires_at timestamptz;
        -- Additive feature ACL schema must exist before any billed transaction.
        -- Lazy FK DDL inside an Agent transaction can wait on that transaction's app_users lock.
        CREATE TABLE IF NOT EXISTS app_feature_access (
          email text PRIMARY KEY REFERENCES app_users(email) ON DELETE CASCADE,
          mode text NOT NULL CHECK(mode IN ('default','custom')),
          allowed jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS app_feature_access_audit (
          id uuid PRIMARY KEY, email text NOT NULL, actor text NOT NULL,
          fingerprint text NOT NULL, before_policy jsonb NOT NULL, after_policy jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_feature_access_audit_email ON app_feature_access_audit(email,created_at DESC);
        CREATE TABLE IF NOT EXISTS app_user_image_providers (
          id             text PRIMARY KEY,
          email          text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
          name           text NOT NULL DEFAULT '默认供应商',
          is_active      boolean NOT NULL DEFAULT false,
          enabled        boolean NOT NULL DEFAULT false,
          protocol       text NOT NULL DEFAULT 'openai-images',
          base_url_enc   text NOT NULL DEFAULT '',
          api_key_enc    text NOT NULL DEFAULT '',
          models         jsonb NOT NULL DEFAULT '[]'::jsonb,
          default_model  text NOT NULL DEFAULT '',
          updated_at     timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_user_image_providers_email
          ON app_user_image_providers (email);
        CREATE TABLE IF NOT EXISTS app_invoices (
          id         text PRIMARY KEY,
          email      text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          plan       text NOT NULL,
          amount     integer NOT NULL,
          status     text NOT NULL DEFAULT 'paid'
        );
        CREATE TABLE IF NOT EXISTS app_artworks (
          id         text PRIMARY KEY,
          email      text NOT NULL,
          title      text NOT NULL,
          category   text NOT NULL,
          prompt     text NOT NULL,
          status     text NOT NULL DEFAULT 'completed',
          image_url  text NOT NULL,
          gradient   text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_artworks_email_idx
          ON app_artworks (email, created_at DESC);
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS style text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS ratio text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS source_url text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS batch_id text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS resolution text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS parent_id text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS parent_ids jsonb DEFAULT '[]'::jsonb;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS template_id text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_x double precision;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_y double precision;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS image_width integer;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_image_version jsonb;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_image_revision integer NOT NULL DEFAULT 0;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS image_height integer;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS processing_kind text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS postprocess_status text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_width double precision;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_height double precision;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS origin text;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS creation_provenance jsonb;
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS marked boolean NOT NULL DEFAULT false;
        -- 稳定项目分组:同一画布项目的所有节点共享 group_id,删中间节点也不改它,
        -- 避免"删一个连接节点 → 下游节点跑去别的项目"。
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS group_id text;
        -- 画布编辑分组:与项目 group_id、生成血缘分离。仅用于成组/解组和整体编辑。
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS canvas_group_id text;
        -- 视频节点:产物为视频时 image_url 存海报帧(可空),video_url 存视频文件地址。
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS video_url text;
        -- 软删除/回收站:deleted_at 非空=已删(进回收站),空=正常。保留 N 天后才真删。
        ALTER TABLE app_artworks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
        CREATE INDEX IF NOT EXISTS app_artworks_deleted_idx
          ON app_artworks (email, deleted_at);
        -- 回填历史数据:给每个节点写入它当前所在血缘树的"根节点 id"作为 group_id。
        WITH RECURSIVE chain AS (
          SELECT id, email, parent_id, id AS root
            FROM app_artworks a
           WHERE parent_id IS NULL
              OR NOT EXISTS (
                   SELECT 1 FROM app_artworks p
                    WHERE p.id = a.parent_id AND p.email = a.email)
          UNION ALL
          SELECT a.id, a.email, a.parent_id, c.root
            FROM app_artworks a
            JOIN chain c ON a.parent_id = c.id AND a.email = c.email
        )
        UPDATE app_artworks t
           SET group_id = chain.root
          FROM chain
         WHERE t.id = chain.id AND t.email = chain.email AND t.group_id IS NULL;
        CREATE TABLE IF NOT EXISTS app_settings (
          k          text PRIMARY KEY,
          v          text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS app_image_jobs (
          id text PRIMARY KEY, email text NOT NULL, kind text NOT NULL,
          snapshot jsonb NOT NULL, payload jsonb NOT NULL,
          cost integer NOT NULL DEFAULT 0, reserved_cost integer NOT NULL DEFAULT 0,
          metered boolean NOT NULL, billing_settled boolean NOT NULL DEFAULT false,
          lease_token text, lease_until timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_image_jobs_owner ON app_image_jobs(email, kind, created_at DESC);
        CREATE INDEX IF NOT EXISTS app_image_jobs_queue_leases ON app_image_jobs(kind,lease_until) WHERE lease_token IS NOT NULL;
        CREATE INDEX IF NOT EXISTS app_image_jobs_active ON app_image_jobs(email, kind, created_at DESC)
          WHERE snapshot->>'status' NOT IN ('done','error');
        CREATE INDEX IF NOT EXISTS app_image_jobs_due ON app_image_jobs(updated_at)
          WHERE snapshot->>'status'='pending' OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb;
        CREATE TABLE IF NOT EXISTS app_project_names (
          email      text NOT NULL,
          key        text NOT NULL,
          name       text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (email, key)
        );
        CREATE TABLE IF NOT EXISTS app_canvas_history_ops (
          id uuid NOT NULL,
          email text NOT NULL,
          fingerprint text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(email,id)
        );
        CREATE TABLE IF NOT EXISTS app_canvas_text_nodes (
          id          text PRIMARY KEY,
          email       text NOT NULL,
          project_key text NOT NULL,
          title       text NOT NULL DEFAULT '文字生成',
          prompt      text NOT NULL DEFAULT '',
          content     text NOT NULL DEFAULT '',
          status      text NOT NULL DEFAULT 'completed',
          canvas_x    double precision NOT NULL DEFAULT 0,
          canvas_y    double precision NOT NULL DEFAULT 0,
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_canvas_text_nodes_email_idx
          ON app_canvas_text_nodes (email, project_key, updated_at DESC);
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS source_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS target_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS product_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS error_message text NOT NULL DEFAULT '';
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS canvas_width double precision NOT NULL DEFAULT 300;
        ALTER TABLE app_canvas_text_nodes ADD COLUMN IF NOT EXISTS canvas_height double precision NOT NULL DEFAULT 176;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
        CREATE TABLE IF NOT EXISTS app_ledger (
          id         text PRIMARY KEY,
          email      text NOT NULL,
          delta      integer NOT NULL,
          reason     text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_ledger_created_idx
          ON app_ledger (created_at DESC);
        -- 内部成本审计:质量档回退时记录「用户实扣(按请求档) vs 实际执行成本(按执行档)」,
        -- 供成本利润核算。只写不改用户侧 app_ledger 账单,用户可见流水不受任何影响。
        CREATE TABLE IF NOT EXISTS app_image_cost_audit (
          id                text PRIMARY KEY,
          job_id            text NOT NULL DEFAULT '',
          email             text NOT NULL DEFAULT '',
          requested_quality text NOT NULL DEFAULT '',
          executed_quality  text NOT NULL DEFAULT '',
          upstream          text NOT NULL DEFAULT '',
          images            integer NOT NULL DEFAULT 1,
          billed_credits      double precision NOT NULL DEFAULT 0,
          cost_credits        double precision NOT NULL DEFAULT 0,
          margin_credits      double precision NOT NULL DEFAULT 0,
          reason            text NOT NULL DEFAULT '',
          created_at        timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_image_cost_audit_created_idx
          ON app_image_cost_audit (created_at DESC);
        -- Preserve audit data created by the earlier terminology during upgrade.
        DO $$ BEGIN
          IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='app_image_cost_audit' AND column_name='billed_beans') THEN
            ALTER TABLE app_image_cost_audit RENAME COLUMN billed_beans TO billed_credits;
            ALTER TABLE app_image_cost_audit RENAME COLUMN cost_beans TO cost_credits;
            ALTER TABLE app_image_cost_audit RENAME COLUMN margin_beans TO margin_credits;
          END IF;
        END $$;
        ALTER TABLE app_users ALTER COLUMN credits_total SET DEFAULT 20;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_ip text;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
        ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash text;
        CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_idx
          ON app_users (phone) WHERE phone IS NOT NULL;
        CREATE TABLE IF NOT EXISTS app_banned_ips (
          ip         text PRIMARY KEY,
          reason     text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS app_templates (
          id          text PRIMARY KEY,
          title       text NOT NULL,
          category    text NOT NULL DEFAULT '',
          industry    text NOT NULL DEFAULT '',
          description text NOT NULL DEFAULT '',
          prompt      text NOT NULL DEFAULT '',
          tags        text[] NOT NULL DEFAULT '{}',
          image       text NOT NULL DEFAULT '',
          gradient    text NOT NULL DEFAULT 'from-emerald-100 to-teal-100',
          popular     boolean NOT NULL DEFAULT false,
          sort_index  integer NOT NULL DEFAULT 0,
          updated_at  timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_templates_sort_idx
          ON app_templates (sort_index DESC, id ASC);
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS homepage_featured boolean NOT NULL DEFAULT false;
        CREATE INDEX IF NOT EXISTS app_templates_homepage_idx
          ON app_templates (homepage_featured) WHERE homepage_featured = true;
        -- 白底原图:作品转模板时把原作品的 source_url(用户上传的白底产品图)带进来,
        -- 这样别人点「做同款」时左侧产品图能带出白底原图(爬来的库模板无此值,留空)。
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS source_image text NOT NULL DEFAULT '';
        -- 模板封面缓存:图片字节在 MEDIA_DIR/R2，DB 只保存来源、稳定地址与迁移状态。
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS image_source text NOT NULL DEFAULT '';
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS image_cached_at timestamptz;
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS image_cache_error text NOT NULL DEFAULT '';
        ALTER TABLE app_templates ADD COLUMN IF NOT EXISTS image_cache_attempted_at timestamptz;
        CREATE TABLE IF NOT EXISTS app_user_favs (
          email       text NOT NULL,
          template_id text NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (email, template_id)
        );
        CREATE INDEX IF NOT EXISTS app_user_favs_email_idx
          ON app_user_favs (email, created_at DESC);
        CREATE TABLE IF NOT EXISTS app_gen_reservations (
          job_id     text PRIMARY KEY,
          email      text NOT NULL,
          cost       integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        -- 视频生成任务:上游任务、本地落盘和积分结算状态。
        CREATE TABLE IF NOT EXISTS app_video_tasks (
          id               text PRIMARY KEY,
          email            text NOT NULL,
          upstream_id      text NOT NULL,
          model            text NOT NULL DEFAULT '',
          prompt           text NOT NULL DEFAULT '',
          size             text NOT NULL DEFAULT '',
          seconds          text NOT NULL DEFAULT '',
          status           text NOT NULL DEFAULT 'processing',
          cost             integer NOT NULL DEFAULT 0,
          request_body     text NOT NULL DEFAULT '',
          progress         integer NOT NULL DEFAULT 0,
          artwork_id       text NOT NULL DEFAULT '',
          video_url        text NOT NULL DEFAULT '',
          error            text NOT NULL DEFAULT '',
          poll_lock_until  timestamptz,
          credits_refunded boolean NOT NULL DEFAULT false,
          last_polled_at   timestamptz,
          created_at       timestamptz NOT NULL DEFAULT now(),
          updated_at       timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_video_tasks_email_idx
          ON app_video_tasks (email, created_at DESC);
        CREATE INDEX IF NOT EXISTS app_video_tasks_artwork_idx ON app_video_tasks(email, artwork_id);
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS poll_lock_until timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS credits_refunded boolean NOT NULL DEFAULT false;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS cancellation_sent_at timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS cancellation_supported boolean;
        -- 视频子系统重写(Phase 1):规范化参数、来源、能力快照与后台恢复调度。
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS provider_id text NOT NULL DEFAULT 'openai-videos';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'canvas';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS source_id text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS video_references jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS capability_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS upstream_video_id text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS error_code text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS next_poll_at timestamptz;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS poll_attempts integer NOT NULL DEFAULT 0;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS channel_id text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS response_body text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS last_response jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS error_detail jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS result_storage_key text NOT NULL DEFAULT '';
        ALTER TABLE app_video_tasks ADD COLUMN IF NOT EXISTS result_observed_at timestamptz;
        DROP INDEX IF EXISTS app_video_tasks_poll_idx;
        CREATE INDEX IF NOT EXISTS app_video_tasks_due_idx
          ON app_video_tasks (next_poll_at) WHERE status IN ('queued','processing');
        CREATE UNIQUE INDEX IF NOT EXISTS app_video_tasks_idem_key
          ON app_video_tasks (email, idempotency_key) WHERE idempotency_key <> '';
        CREATE TABLE IF NOT EXISTS app_video_results (
          id                 text PRIMARY KEY,
          task_id            text NOT NULL UNIQUE,
          email              text NOT NULL,
          artwork_id         text NOT NULL DEFAULT '',
          provider_id        text NOT NULL DEFAULT '',
          model              text NOT NULL DEFAULT '',
          prompt             text NOT NULL DEFAULT '',
          video_url          text NOT NULL DEFAULT '',
          result_storage_key text NOT NULL DEFAULT '',
          parameters         jsonb NOT NULL DEFAULT '{}'::jsonb,
          reference_items    jsonb NOT NULL DEFAULT '[]'::jsonb,
          created_at         timestamptz NOT NULL DEFAULT now(),
          deleted_at         timestamptz
        );
        CREATE INDEX IF NOT EXISTS app_video_results_email_idx
          ON app_video_results (email, created_at DESC) WHERE deleted_at IS NULL;
        -- 画布图片编辑后台任务:关闭 Dock/页面后由常驻 worker 继续处理。
        CREATE TABLE IF NOT EXISTS app_canvas_image_tasks (
          id                text PRIMARY KEY,
          email             text NOT NULL,
          kind              text NOT NULL DEFAULT 'text-edit',
          source_artwork_id text NOT NULL,
          parameters        jsonb NOT NULL DEFAULT '{}'::jsonb,
          status            text NOT NULL DEFAULT 'queued',
          progress          integer NOT NULL DEFAULT 0,
          cost              integer NOT NULL DEFAULT 0,
          result_artwork_id text NOT NULL DEFAULT '',
          error             text NOT NULL DEFAULT '',
          attempts          integer NOT NULL DEFAULT 0,
          lease_until       timestamptz,
          credits_refunded  boolean NOT NULL DEFAULT false,
          created_at        timestamptz NOT NULL DEFAULT now(),
          updated_at        timestamptz NOT NULL DEFAULT now(),
          completed_at      timestamptz
        );
        CREATE INDEX IF NOT EXISTS app_canvas_image_tasks_email_idx
          ON app_canvas_image_tasks (email, created_at DESC);
        CREATE INDEX IF NOT EXISTS app_canvas_image_tasks_artwork_idx ON app_canvas_image_tasks(email, result_artwork_id);
        CREATE INDEX IF NOT EXISTS app_canvas_image_tasks_due_idx
          ON app_canvas_image_tasks (created_at)
          WHERE status IN ('queued', 'processing');
        CREATE TABLE IF NOT EXISTS app_orders (
          id           text PRIMARY KEY,
          email        text NOT NULL,
          kind         text NOT NULL,                 -- 'plan' | 'pack'
          item_id      text NOT NULL,                 -- plan key or pack id
          title        text NOT NULL DEFAULT '',
          credits      integer NOT NULL DEFAULT 0,
          amount       integer NOT NULL,              -- 分 (RMB cents)
          status       text NOT NULL DEFAULT 'pending', -- pending|paid|failed|expired
          provider     text NOT NULL DEFAULT '',      -- wechat|alipay|mock
          provider_txn text,
          created_at   timestamptz NOT NULL DEFAULT now(),
          paid_at      timestamptz
        );
        CREATE INDEX IF NOT EXISTS app_orders_email_idx
          ON app_orders (email, created_at DESC);
        CREATE TABLE IF NOT EXISTS app_genchat_sessions (
          id         text PRIMARY KEY,
          email      text NOT NULL,
          title      text NOT NULL DEFAULT '',
          turns      jsonb NOT NULL DEFAULT '[]',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_genchat_email_idx
          ON app_genchat_sessions (email, updated_at DESC);
        -- 业务项目注册表:统一聚合入口(导航下拉/首页卡片/Agent 工具来源)
        CREATE TABLE IF NOT EXISTS app_projects (
          id          serial PRIMARY KEY,
          slug        text NOT NULL UNIQUE,
          name        text NOT NULL,
          description text NOT NULL DEFAULT '',
          url         text NOT NULL DEFAULT '',
          icon        text NOT NULL DEFAULT 'Box',
          color       text NOT NULL DEFAULT '#4F46E5',
          category    text NOT NULL DEFAULT '业务系统',
          agent_tool  boolean NOT NULL DEFAULT false,
          run_type    text NOT NULL DEFAULT 'web',
          visible     boolean NOT NULL DEFAULT true,
          sort_index  integer NOT NULL DEFAULT 0,
          created_at  timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'web';
        -- Agent 任务会话:消息历史 + 工具轨迹(公开摘要),支持刷新恢复。
        -- 主键 (email,id):防跨用户猜 id 覆盖;新库直接建复合主键。
        CREATE TABLE IF NOT EXISTS app_agent_sessions (
          id         text NOT NULL,
          email      text NOT NULL,
          title      text NOT NULL DEFAULT '',
          messages   jsonb NOT NULL DEFAULT '[]',
          steps      jsonb NOT NULL DEFAULT '[]',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (email, id)
        );
        CREATE INDEX IF NOT EXISTS app_agent_email_idx
          ON app_agent_sessions (email, updated_at DESC);
        -- 侧栏会话条目:置顶标记 + 最近一次创作缩略图(保存时从消息 markdown 提取)。
        ALTER TABLE app_agent_sessions ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
        ALTER TABLE app_agent_sessions ADD COLUMN IF NOT EXISTS last_image_url text;
        -- ComfyUI 工作流(BYOC:算力在用户自备端点,站内不扣积分)。
        -- 端点 = base URL + 可选 Bearer 密钥(本机/NAS/租的 GPU);
        -- 工作流 = API 格式 JSON + 导入时解析出的输入清单(inputs)+依赖节点类(required)。
        CREATE TABLE IF NOT EXISTS app_comfyui_endpoints (
          id         text PRIMARY KEY,
          email      text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
          name       text NOT NULL DEFAULT 'ComfyUI',
          base_url   text NOT NULL DEFAULT '',
          api_key    text NOT NULL DEFAULT '',
          is_active  boolean NOT NULL DEFAULT false,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_comfyui_endpoints_email
          ON app_comfyui_endpoints (email);
        CREATE TABLE IF NOT EXISTS app_comfyui_workflows (
          id         text PRIMARY KEY,
          email      text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
          name       text NOT NULL DEFAULT '未命名工作流',
          api_json   jsonb NOT NULL,
          inputs     jsonb NOT NULL DEFAULT '[]'::jsonb,
          required   jsonb NOT NULL DEFAULT '[]'::jsonb,
          note       text NOT NULL DEFAULT '',
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_comfyui_workflows_email
          ON app_comfyui_workflows (email, updated_at DESC);
        -- 市场:is_public=true 的工作流进入公开市场(所有人可见、可复制导入);
        -- author 为发布时的展示名(邮箱本地部分,不回传完整邮箱)。
        ALTER TABLE app_comfyui_workflows ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
        ALTER TABLE app_comfyui_workflows ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_comfyui_workflows_public
          ON app_comfyui_workflows (is_public, updated_at DESC) WHERE is_public;
        -- 积分批次:每次充值/赠送/迁移 = 一个批次,带自己的到期日(2 年 / 新人 30 天)。
        -- 余额 = 所有「未到期且 remaining>0」批次的 remaining 之和;消耗按「先到期先扣」FIFO。
        -- remaining 到期后不清零(留作记录),靠 expires_at>now() 过滤;expired 仅用于「只记一次过期流水」。
        CREATE TABLE IF NOT EXISTS app_credit_batches (
          id         text PRIMARY KEY,
          email      text NOT NULL,
          amount     integer NOT NULL,            -- 批次原始积分
          remaining  integer NOT NULL,            -- 剩余(FIFO 扣减)
          source     text NOT NULL,               -- purchase|grant|migrate|admin
          reason     text NOT NULL DEFAULT '',
          order_id   text,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          expired    boolean NOT NULL DEFAULT false
        );
        CREATE INDEX IF NOT EXISTS app_credit_batches_live_idx
          ON app_credit_batches (email, expires_at);
        -- 流水扩列:kind 给明细页分类(purchase/consume/grant/refund/expire);
        -- expires_at 给「购买/获取」类流水显示到期时间。
        ALTER TABLE app_ledger ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT '';
        ALTER TABLE app_ledger ADD COLUMN IF NOT EXISTS expires_at timestamptz;
        -- 兑换码:站长后台批量生成,用户在充值弹窗兑换成积分(走 addCreditBatch grant)。
        CREATE TABLE IF NOT EXISTS app_card_keys (
          code       text PRIMARY KEY,                 -- NOVA-XXXX-XXXX-XXXX
          credits    integer NOT NULL,
          status     text NOT NULL DEFAULT 'unused',   -- unused|used|disabled
          batch      text NOT NULL DEFAULT '',
          note       text NOT NULL DEFAULT '',
          expires_at timestamptz,                      -- null = 永久
          created_at timestamptz NOT NULL DEFAULT now(),
          used_by    text,
          used_at    timestamptz
        );
        CREATE INDEX IF NOT EXISTS app_card_keys_status_idx
          ON app_card_keys (status, created_at DESC);

        -- Pro 自托管授权 License(爱发电售卖/发货的产品)。
        CREATE TABLE IF NOT EXISTS app_licenses (
          key          text PRIMARY KEY,                 -- NOVA-XXXX-XXXX-XXXX-XXXX
          tier         text NOT NULL DEFAULT 'pro',
          status       text NOT NULL DEFAULT 'active',   -- active|revoked
          device_limit integer NOT NULL DEFAULT 3,       -- 可绑定部署/设备数
          expires_at   timestamptz,                      -- null = 永久
          batch        text NOT NULL DEFAULT '',
          note         text NOT NULL DEFAULT '',
          bound_email  text,
          created_at   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_licenses_created_idx
          ON app_licenses (created_at DESC);
        -- Pro 实例激活(每个部署 host 一条),用于设备数限制 + 我的授权页展示。
        CREATE TABLE IF NOT EXISTS app_license_activations (
          id           bigserial PRIMARY KEY,
          license_key  text NOT NULL REFERENCES app_licenses(key) ON DELETE CASCADE,
          host         text NOT NULL,
          active       boolean NOT NULL DEFAULT true,
          activated_at timestamptz NOT NULL DEFAULT now(),
          last_seen    timestamptz NOT NULL DEFAULT now(),
          UNIQUE (license_key, host)
        );
        CREATE INDEX IF NOT EXISTS app_license_act_key_idx
          ON app_license_activations (license_key);
      `);
      await ensureAgentSessionKeyTx(schemaDb);
      // app_user_image_providers 旧结构迁移:主键曾是 email(一人一供应商的单一槽位)。
      // 检测到旧主键时把数据搬进多供应商新结构(先搬后删,不丢数据),旧配置成为
      // 「默认供应商」并保持原 enabled 作为激活态。
      const providerPk = await schemaDb.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_name = 'app_user_image_providers' AND tc.table_schema = current_schema()`
      );
      const pkColumn = providerPk.rows[0]?.column_name;
      if (pkColumn === "email") {
        await schemaDb.query(`
          CREATE TABLE app_user_image_providers_new (
            id             text PRIMARY KEY,
            email          text NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
            name           text NOT NULL DEFAULT '默认供应商',
            is_active      boolean NOT NULL DEFAULT false,
            enabled        boolean NOT NULL DEFAULT false,
            protocol       text NOT NULL DEFAULT 'openai-images',
            base_url_enc   text NOT NULL DEFAULT '',
            api_key_enc    text NOT NULL DEFAULT '',
            models         jsonb NOT NULL DEFAULT '[]'::jsonb,
            default_model  text NOT NULL DEFAULT '',
            updated_at     timestamptz NOT NULL DEFAULT now()
          );
          INSERT INTO app_user_image_providers_new
            (id, email, name, is_active, enabled, protocol, base_url_enc, api_key_enc,
             models, default_model, updated_at)
          SELECT 'prov-' || md5(random()::text) , email, '默认供应商', enabled, enabled,
                 protocol, base_url_enc, api_key_enc, models, default_model, updated_at
            FROM app_user_image_providers;
          DROP TABLE app_user_image_providers;
          ALTER TABLE app_user_image_providers_new RENAME TO app_user_image_providers;
          CREATE INDEX idx_user_image_providers_email
            ON app_user_image_providers (email);
        `);
      }
      await applyBillingSchema(schemaDb);
    }).then(()=>{markBillingSchemaReady(getPool());}).catch(error => { state.pending = null; throw error; });
  }
  return state.pending;
}
