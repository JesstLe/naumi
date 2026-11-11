# 页面与 API 全清单

来源是源码文件枚举，不依赖菜单是否展示。core/related是本模块及补充入口；direct-consumer/dependency是业务消费者或递归依赖，并非都属于后台菜单。API 的最终授权/写入语义见 REPORT.md；后台GET可创建专属草稿、访问上游目录/余额并写缓存，不统称纯SELECT。

| 范围 | 类型 | 路径 | HTTP/导出 | 入口源码 |
|---|---|---|---|---|
| core | 页面 | `/admin/bi/models` | metadata, dynamic, ModelsPage | `src/app/admin/bi/models/page.tsx` |
| core | 页面 | `/admin/billing` | dynamic, metadata, BillingPage | `src/app/admin/billing/page.tsx` |
| core | 页面 | `/admin/billing/price-table` | dynamic, metadata, PriceTablePage | `src/app/admin/billing/price-table/page.tsx` |
| core | 页面 | `/admin/billing/supplier-cost` | dynamic, metadata, SupplierCostPage | `src/app/admin/billing/supplier-cost/page.tsx` |
| related | 页面 | `/admin/center` | dynamic, metadata, AdminCenterPage | `src/app/admin/center/page.tsx` |
| direct-consumer | 页面 | `/admin/creations/[id]` | dynamic, Page | `src/app/admin/creations/[id]/page.tsx` |
| direct-consumer | 页面 | `/admin/creations` | dynamic, Page | `src/app/admin/creations/page.tsx` |
| direct-consumer | 页面 | `/admin/creations/resolve` | dynamic, Page | `src/app/admin/creations/resolve/page.tsx` |
| direct-consumer | 页面 | `/admin/deployments` | dynamic, DeploymentsPage | `src/app/admin/deployments/page.tsx` |
| direct-consumer | 页面 | `/admin/feature-access` | dynamic, FeatureAccessPage | `src/app/admin/feature-access/page.tsx` |
| direct-consumer | 页面 | `/admin/health` | dynamic, metadata, AdminHealthPage | `src/app/admin/health/page.tsx` |
| core | 页面 | `/admin/model-health` | metadata, dynamic, ModelHealthPage | `src/app/admin/model-health/page.tsx` |
| core | 页面 | `/admin/model-management/library` | runtime,dynamic, metadata, SupplierLibraryPage | `src/app/admin/model-management/library/page.tsx` |
| core | 页面 | `/admin/model-management` | runtime,dynamic, metadata, ModelManagementPage | `src/app/admin/model-management/page.tsx` |
| core | 页面 | `/admin/mvp/library` | LegacySupplierLibraryPage | `src/app/admin/mvp/library/page.tsx` |
| core | 页面 | `/admin/mvp` | LegacyModelManagementPage | `src/app/admin/mvp/page.tsx` |
| core | 页面 | `/admin` | metadata, AdminPage | `src/app/admin/page.tsx` |
| core | 页面 | `/admin/pricing` | metadata, dynamic, AdminPricingPage | `src/app/admin/pricing/page.tsx` |
| core | 页面 | `/admin/supplier-balances` | dynamic, metadata, SupplierBalancesPage | `src/app/admin/supplier-balances/page.tsx` |
| direct-consumer | 页面 | `/admin/team-access` | dynamic, TeamAccessPage | `src/app/admin/team-access/page.tsx` |
| direct-consumer | 页面 | `/admin/teams` | dynamic, AdminTeamsPage | `src/app/admin/teams/page.tsx` |
| direct-consumer | 页面 | `/admin/tenants/[tenantId]` | dynamic, Page | `src/app/admin/tenants/[tenantId]/page.tsx` |
| direct-consumer | 页面 | `/admin/tenants` | dynamic, Page | `src/app/admin/tenants/page.tsx` |
| direct-consumer | 页面 | `/admin/usage` | dynamic, metadata, AdminUsagePage | `src/app/admin/usage/page.tsx` |
| related | API | `/api/admin/bi/conversation` | runtime, dynamic, GET | `src/app/api/admin/bi/conversation/route.ts` |
| related | API | `/api/admin/bi/media` | runtime, dynamic, GET | `src/app/api/admin/bi/media/route.ts` |
| core | API | `/api/admin/bi/model-config/catalog` | runtime,dynamic, GET, POST | `src/app/api/admin/bi/model-config/catalog/route.ts` |
| core | API | `/api/admin/bi/model-config/credentials` | runtime,dynamic, POST | `src/app/api/admin/bi/model-config/credentials/route.ts` |
| core | API | `/api/admin/bi/model-config/draft` | runtime,dynamic, PUT | `src/app/api/admin/bi/model-config/draft/route.ts` |
| core | API | `/api/admin/bi/model-config` | runtime,dynamic, GET, POST | `src/app/api/admin/bi/model-config/route.ts` |
| core | API | `/api/admin/bi/model-config/simulate` | runtime,dynamic, POST | `src/app/api/admin/bi/model-config/simulate/route.ts` |
| core | API | `/api/admin/bi/model-config/validate` | runtime,dynamic, POST | `src/app/api/admin/bi/model-config/validate/route.ts` |
| core | API | `/api/admin/bi/model-config/versions` | runtime,dynamic, GET, POST | `src/app/api/admin/bi/model-config/versions/route.ts` |
| related | API | `/api/admin/bi/profile` | runtime, dynamic, PUT | `src/app/api/admin/bi/profile/route.ts` |
| core | API | `/api/admin/bi/provider-ops` | runtime,dynamic,maxDuration, GET | `src/app/api/admin/bi/provider-ops/route.ts` |
| related | API | `/api/admin/bi` | runtime, dynamic, GET | `src/app/api/admin/bi/route.ts` |
| related | API | `/api/admin/bi/trace` | runtime, dynamic, GET | `src/app/api/admin/bi/trace/route.ts` |
| related | API | `/api/admin/bi/usage` | runtime, dynamic, GET | `src/app/api/admin/bi/usage/route.ts` |
| related | API | `/api/admin/bi/users` | runtime, dynamic, POST | `src/app/api/admin/bi/users/route.ts` |
| core | API | `/api/admin/billing/image25-prices` | runtime,dynamic, GET | `src/app/api/admin/billing/image25-prices/route.ts` |
| core | API | `/api/admin/billing/models/postprocess/retry` | runtime,dynamic, POST | `src/app/api/admin/billing/models/postprocess/retry/route.ts` |
| core | API | `/api/admin/billing/models/preview` | runtime,dynamic, POST | `src/app/api/admin/billing/models/preview/route.ts` |
| core | API | `/api/admin/billing/models/stages` | runtime,dynamic, GET | `src/app/api/admin/billing/models/stages/route.ts` |
| core | API | `/api/admin/billing/operations` | runtime,dynamic, GET, POST | `src/app/api/admin/billing/operations/route.ts` |
| core | API | `/api/admin/billing` | runtime,dynamic, GET, POST | `src/app/api/admin/billing/route.ts` |
| core | API | `/api/admin/billing/simulate` | runtime,dynamic, POST | `src/app/api/admin/billing/simulate/route.ts` |
| core | API | `/api/admin/billing/versions` | runtime,dynamic, GET, POST | `src/app/api/admin/billing/versions/route.ts` |
| direct-consumer | API | `/api/admin/feature-access` | runtime,dynamic, GET, POST | `src/app/api/admin/feature-access/route.ts` |
| core | API | `/api/admin/model-health` | runtime,dynamic,maxDuration, GET, POST | `src/app/api/admin/model-health/route.ts` |
| core | API | `/api/admin/model-management/library` | runtime,dynamic, GET, POST | `src/app/api/admin/model-management/library/route.ts` |
| core | API | `/api/admin/model-management/onboarding` | runtime,dynamic, GET, POST | `src/app/api/admin/model-management/onboarding/route.ts` |
| core | API | `/api/admin/model-management` | runtime,dynamic, GET, POST | `src/app/api/admin/model-management/route.ts` |
| core | API | `/api/admin/mvp/library` | runtime,dynamic, GET, POST | `src/app/api/admin/mvp/library/route.ts` |
| core | API | `/api/admin/mvp` | runtime,dynamic, GET, POST | `src/app/api/admin/mvp/route.ts` |
| related | API | `/api/admin/settings` | runtime, dynamic, GET, POST | `src/app/api/admin/settings/route.ts` |
| core | API | `/api/admin/supplier-cost/actions` | runtime,dynamic, POST | `src/app/api/admin/supplier-cost/actions/route.ts` |
| core | API | `/api/admin/supplier-cost/operations/[id]` | runtime,dynamic, GET | `src/app/api/admin/supplier-cost/operations/[id]/route.ts` |
| core | API | `/api/admin/supplier-cost` | runtime,dynamic, GET | `src/app/api/admin/supplier-cost/route.ts` |
| direct-consumer | API | `/api/admin/users` | runtime, dynamic, GET, POST | `src/app/api/admin/users/route.ts` |
| direct-consumer | API | `/api/agent/verify-image` | runtime, maxDuration, POST | `src/app/api/agent/verify-image/route.ts` |
| direct-consumer | API | `/api/aplus` | runtime, maxDuration, GET, POST | `src/app/api/aplus/route.ts` |
| direct-consumer | API | `/api/artworks/add` | runtime, dynamic, POST, GET | `src/app/api/artworks/add/route.ts` |
| direct-consumer | API | `/api/avatar` | runtime, maxDuration, POST | `src/app/api/avatar/route.ts` |
| direct-consumer | API | `/api/billing/catalog` | runtime,dynamic, GET | `src/app/api/billing/catalog/route.ts` |
| direct-consumer | API | `/api/billing/quote` | runtime,dynamic, POST | `src/app/api/billing/quote/route.ts` |
| direct-consumer | API | `/api/canvas/annotate` | runtime, dynamic, maxDuration, POST | `src/app/api/canvas/annotate/route.ts` |
| direct-consumer | API | `/api/canvas/assistant` | runtime, dynamic, maxDuration, POST, GET, PATCH, DELETE | `src/app/api/canvas/assistant/route.ts` |
| direct-consumer | API | `/api/canvas/audio-nodes/[id]/render` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/audio-nodes/[id]/render/route.ts` |
| direct-consumer | API | `/api/canvas/audio-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/audio-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/audio-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/audio-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/audio-operations/adopt` | runtime,dynamic, POST | `src/app/api/canvas/audio-operations/adopt/route.ts` |
| direct-consumer | API | `/api/canvas/audio-operations/catalog` | runtime,dynamic, GET | `src/app/api/canvas/audio-operations/catalog/route.ts` |
| direct-consumer | API | `/api/canvas/audio-operations/quote` | runtime,dynamic, POST | `src/app/api/canvas/audio-operations/quote/route.ts` |
| direct-consumer | API | `/api/canvas/audio-operations/recover` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/audio-operations/recover/route.ts` |
| direct-consumer | API | `/api/canvas/character-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/character-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/character-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/character-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/comfy-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/comfy-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/comfy-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/comfy-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/director-nodes/[id]/outputs` | runtime,dynamic, POST | `src/app/api/canvas/director-nodes/[id]/outputs/route.ts` |
| direct-consumer | API | `/api/canvas/director-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/director-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/director-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/director-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/expand` | runtime, dynamic, maxDuration, POST | `src/app/api/canvas/expand/route.ts` |
| direct-consumer | API | `/api/canvas/image-prompts` | runtime,dynamic, GET, POST | `src/app/api/canvas/image-prompts/route.ts` |
| direct-consumer | API | `/api/canvas/image-reference-upload` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/image-reference-upload/route.ts` |
| direct-consumer | API | `/api/canvas/image-tasks` | runtime, dynamic, GET, POST | `src/app/api/canvas/image-tasks/route.ts` |
| direct-consumer | API | `/api/canvas/nodes/copy` | runtime,dynamic, POST | `src/app/api/canvas/nodes/copy/route.ts` |
| direct-consumer | API | `/api/canvas/nodes/delete` | runtime, dynamic, POST | `src/app/api/canvas/nodes/delete/route.ts` |
| direct-consumer | API | `/api/canvas/ocr` | runtime, dynamic, maxDuration, POST | `src/app/api/canvas/ocr/route.ts` |
| direct-consumer | API | `/api/canvas/scene-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/scene-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/scene-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/scene-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/stitch` | runtime, dynamic, POST, GET | `src/app/api/canvas/stitch/route.ts` |
| direct-consumer | API | `/api/canvas/storyboards/review-audio/quote` | runtime,dynamic, POST | `src/app/api/canvas/storyboards/review-audio/quote/route.ts` |
| direct-consumer | API | `/api/canvas/storyboards/review-audio` | runtime,dynamic,maxDuration, GET, POST | `src/app/api/canvas/storyboards/review-audio/route.ts` |
| direct-consumer | API | `/api/canvas/storyboards/review` | runtime, dynamic, maxDuration, GET, POST | `src/app/api/canvas/storyboards/review/route.ts` |
| direct-consumer | API | `/api/canvas/storyboards` | runtime,dynamic, GET, POST | `src/app/api/canvas/storyboards/route.ts` |
| direct-consumer | API | `/api/canvas/text-edit` | runtime, dynamic, maxDuration, POST | `src/app/api/canvas/text-edit/route.ts` |
| direct-consumer | API | `/api/canvas/text-generate` | runtime, dynamic, maxDuration, POST | `src/app/api/canvas/text-generate/route.ts` |
| direct-consumer | API | `/api/canvas/timeline-nodes/[id]/adopt` | runtime,dynamic, POST | `src/app/api/canvas/timeline-nodes/[id]/adopt/route.ts` |
| direct-consumer | API | `/api/canvas/timeline-nodes/[id]/render` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/timeline-nodes/[id]/render/route.ts` |
| direct-consumer | API | `/api/canvas/timeline-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/timeline-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/timeline-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/timeline-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/video-nodes/[id]/batch` | runtime,dynamic,maxDuration, GET, POST | `src/app/api/canvas/video-nodes/[id]/batch/route.ts` |
| direct-consumer | API | `/api/canvas/video-nodes/[id]/generate` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/video-nodes/[id]/generate/route.ts` |
| direct-consumer | API | `/api/canvas/video-nodes/[id]` | runtime,dynamic, PATCH, GET | `src/app/api/canvas/video-nodes/[id]/route.ts` |
| direct-consumer | API | `/api/canvas/video-nodes/copy` | runtime,dynamic, POST | `src/app/api/canvas/video-nodes/copy/route.ts` |
| direct-consumer | API | `/api/canvas/video-nodes` | runtime,dynamic, POST, GET | `src/app/api/canvas/video-nodes/route.ts` |
| direct-consumer | API | `/api/canvas/video-workflows` | runtime,dynamic,maxDuration, POST | `src/app/api/canvas/video-workflows/route.ts` |
| direct-consumer | API | `/api/cardkeys` | runtime, dynamic, GET, POST, PATCH | `src/app/api/cardkeys/route.ts` |
| direct-consumer | API | `/api/comfyui/run` | runtime, dynamic, maxDuration, POST, GET | `src/app/api/comfyui/run/route.ts` |
| direct-consumer | API | `/api/comfyui/workflows` | runtime, dynamic, GET, POST, DELETE | `src/app/api/comfyui/workflows/route.ts` |
| direct-consumer | API | `/api/competitors/[id]/action` | runtime, maxDuration, POST | `src/app/api/competitors/[id]/action/route.ts` |
| direct-consumer | API | `/api/config` | runtime, dynamic, GET | `src/app/api/config/route.ts` |
| direct-consumer | API | `/api/credits` | runtime, dynamic, GET | `src/app/api/credits/route.ts` |
| direct-consumer | API | `/api/cutout` | runtime, maxDuration, POST | `src/app/api/cutout/route.ts` |
| direct-consumer | API | `/api/dewatermark` | runtime, maxDuration, POST | `src/app/api/dewatermark/route.ts` |
| direct-consumer | API | `/api/dewrinkle` | runtime, maxDuration, POST | `src/app/api/dewrinkle/route.ts` |
| direct-consumer | API | `/api/extract` | runtime, maxDuration, POST | `src/app/api/extract/route.ts` |
| direct-consumer | API | `/api/garment` | runtime, maxDuration, POST | `src/app/api/garment/route.ts` |
| direct-consumer | API | `/api/garment3d` | runtime, maxDuration, GET, POST | `src/app/api/garment3d/route.ts` |
| direct-consumer | API | `/api/generate-image` | runtime, maxDuration, GET, POST | `src/app/api/generate-image/route.ts` |
| direct-consumer | API | `/api/imagegen/batches/[id]` | runtime, maxDuration, GET, POST | `src/app/api/imagegen/batches/[id]/route.ts` |
| direct-consumer | API | `/api/imagegen/cancel` | runtime, POST | `src/app/api/imagegen/cancel/route.ts` |
| direct-consumer | API | `/api/imagegen/capabilities` | runtime, GET | `src/app/api/imagegen/capabilities/route.ts` |
| direct-consumer | API | `/api/imagegen/inputs` | runtime, POST | `src/app/api/imagegen/inputs/route.ts` |
| direct-consumer | API | `/api/imagegen/plan` | runtime, POST | `src/app/api/imagegen/plan/route.ts` |
| direct-consumer | API | `/api/imagegen/recover-delivery` | runtime, POST | `src/app/api/imagegen/recover-delivery/route.ts` |
| direct-consumer | API | `/api/imagegen` | runtime, maxDuration, GET, POST | `src/app/api/imagegen/route.ts` |
| direct-consumer | API | `/api/inpaint` | runtime, maxDuration, POST | `src/app/api/inpaint/route.ts` |
| related | API | `/api/internal/model-capacity` | runtime, dynamic, POST | `src/app/api/internal/model-capacity/route.ts` |
| direct-consumer | API | `/api/ipcheck` | runtime, dynamic, POST | `src/app/api/ipcheck/route.ts` |
| direct-consumer | API | `/api/media/postprocess/retry` | runtime,dynamic, POST | `src/app/api/media/postprocess/retry/route.ts` |
| related | API | `/api/model-health/worker/tick` | runtime,dynamic,maxDuration, POST | `src/app/api/model-health/worker/tick/route.ts` |
| related | API | `/api/models` | runtime,dynamic, GET | `src/app/api/models/route.ts` |
| direct-consumer | API | `/api/packaging-strategy` | runtime, dynamic, maxDuration, GET, POST | `src/app/api/packaging-strategy/route.ts` |
| direct-consumer | API | `/api/packaging3d` | runtime, maxDuration, GET, POST | `src/app/api/packaging3d/route.ts` |
| direct-consumer | API | `/api/payments/create` | runtime, dynamic, POST | `src/app/api/payments/create/route.ts` |
| direct-consumer | API | `/api/printfile` | runtime, maxDuration, POST | `src/app/api/printfile/route.ts` |
| direct-consumer | API | `/api/prompt-assist` | runtime, dynamic, POST | `src/app/api/prompt-assist/route.ts` |
| direct-consumer | API | `/api/recolor` | runtime, maxDuration, POST | `src/app/api/recolor/route.ts` |
| direct-consumer | API | `/api/redeem` | runtime, dynamic, POST | `src/app/api/redeem/route.ts` |
| direct-consumer | API | `/api/reference-workbench/[...path]` | runtime, dynamic, maxDuration, GET, POST | `src/app/api/reference-workbench/[...path]/route.ts` |
| direct-consumer | API | `/api/replicate` | runtime, maxDuration, POST | `src/app/api/replicate/route.ts` |
| direct-consumer | API | `/api/retouch` | runtime, maxDuration, POST | `src/app/api/retouch/route.ts` |
| direct-consumer | API | `/api/style` | runtime, maxDuration, POST | `src/app/api/style/route.ts` |
| direct-consumer | API | `/api/suite` | runtime, maxDuration, GET, POST | `src/app/api/suite/route.ts` |
| related | API | `/api/supplier/apimart/[account]/callback` | runtime,dynamic, POST | `src/app/api/supplier/apimart/[account]/callback/route.ts` |
| direct-consumer | API | `/api/title-gen` | runtime, dynamic, POST | `src/app/api/title-gen/route.ts` |
| direct-consumer | API | `/api/tryon` | runtime, maxDuration, GET, POST | `src/app/api/tryon/route.ts` |
| direct-consumer | API | `/api/upscale` | runtime, maxDuration, POST | `src/app/api/upscale/route.ts` |
| direct-consumer | API | `/api/video/assets` | runtime,dynamic,maxDuration, POST, GET | `src/app/api/video/assets/route.ts` |
| direct-consumer | API | `/api/video/catalog` | runtime, dynamic, GET | `src/app/api/video/catalog/route.ts` |
| direct-consumer | API | `/api/video/extract` | runtime, dynamic, maxDuration, POST | `src/app/api/video/extract/route.ts` |
| direct-consumer | API | `/api/video/generate` | runtime,dynamic,maxDuration, POST | `src/app/api/video/generate/route.ts` |
| direct-consumer | API | `/api/video/media-jobs/[id]` | runtime, dynamic, maxDuration, GET, DELETE | `src/app/api/video/media-jobs/[id]/route.ts` |
| direct-consumer | API | `/api/video/media-jobs` | runtime, dynamic, maxDuration, GET, POST | `src/app/api/video/media-jobs/route.ts` |
| direct-consumer | API | `/api/video/nodes` | runtime,dynamic, GET | `src/app/api/video/nodes/route.ts` |
| direct-consumer | API | `/api/video/references` | runtime, dynamic, maxDuration, POST | `src/app/api/video/references/route.ts` |
| direct-consumer | API | `/api/video/tasks/[id]/cancel` | runtime,dynamic, POST | `src/app/api/video/tasks/[id]/cancel/route.ts` |
| direct-consumer | API | `/api/video/tasks/[id]/resolve` | runtime,dynamic, POST | `src/app/api/video/tasks/[id]/resolve/route.ts` |
| direct-consumer | API | `/api/video/tasks/[id]/retry` | runtime,dynamic,maxDuration, POST | `src/app/api/video/tasks/[id]/retry/route.ts` |
| direct-consumer | API | `/api/video/tasks/[id]` | runtime, dynamic, GET, DELETE | `src/app/api/video/tasks/[id]/route.ts` |
| direct-consumer | API | `/api/video/tasks/[id]/send-to-canvas` | runtime,dynamic, POST | `src/app/api/video/tasks/[id]/send-to-canvas/route.ts` |
| direct-consumer | API | `/api/video/texts` | runtime,dynamic, POST, GET | `src/app/api/video/texts/route.ts` |
| related | API | `/api/video/worker/tick` | runtime, dynamic, maxDuration, POST, GET | `src/app/api/video/worker/tick/route.ts` |
| direct-consumer | API | `/api/video/workflows/[id]` | runtime,dynamic,maxDuration, GET, POST | `src/app/api/video/workflows/[id]/route.ts` |
| direct-consumer | API | `/api/video/workflows` | runtime,dynamic,maxDuration, GET, POST | `src/app/api/video/workflows/route.ts` |

## 快捷操作协议

源码：`src/lib/model-config/management-input.ts`。操作名是已持久化兼容协议，UI 改名不改 operation fingerprint。
- `create-models`
- `video-capability-upgrade`
- `video-parameters`
- `imagegen-parameters`
- `channels`
- `image-mapping`
- `resolutions`
- `discover`
- `credential`
- `switch`
- `identity`
- `rename`
- `scope-compat`
- `order`
- `scope`
- `parameters`
- `pricing`
- `connect`
- `register`
