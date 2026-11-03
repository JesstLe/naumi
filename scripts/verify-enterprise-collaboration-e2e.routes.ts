import * as imagePrompts from '../src/app/api/canvas/image-prompts/route';
import * as imageReferenceUpload from '../src/app/api/canvas/image-reference-upload/route';
import * as nodeCopy from '../src/app/api/canvas/nodes/copy/route';
import * as assets from '../src/app/api/video/assets/route';
import * as enterprise from '../src/app/api/enterprise/route';
import * as jobs from '../src/app/api/video/media-jobs/route';
import * as route0 from '../src/app/api/collaboration/bootstrap/route';
import * as route1 from '../src/app/api/collaboration/conversations/route';
import * as route2 from '../src/app/api/collaboration/events/route';
import * as route3 from '../src/app/api/collaboration/forward/route';
import * as route4 from '../src/app/api/collaboration/members/route';
import * as route5 from '../src/app/api/collaboration/presence/route';
import * as route6 from '../src/app/api/collaboration/shares/route';
import * as route7 from '../src/app/api/collaboration/uploads/route';
import * as route8 from '../src/app/api/collaboration/uploads/[id]/route';
import * as route9 from '../src/app/api/collaboration/uploads/[id]/complete/route';
import * as route10 from '../src/app/api/collaboration/shares/[id]/route';
import * as route11 from '../src/app/api/collaboration/shares/[id]/preview/route';
import * as route12 from '../src/app/api/collaboration/messages/[id]/withdraw/route';
import * as route13 from '../src/app/api/collaboration/conversations/[id]/route';
import * as route14 from '../src/app/api/collaboration/conversations/[id]/messages/route';
import * as route15 from '../src/app/api/collaboration/conversations/[id]/read/route';
import * as route16 from '../src/app/api/collaboration/attachments/[id]/route';
import * as route17 from '../src/app/api/auth/login/route';
import * as route18 from '../src/app/api/auth/session/route';
import * as route19 from '../src/app/api/auth/logout/route';
import * as route20 from '../src/app/api/account/route';
import * as route21 from '../src/app/api/projects/route';
import * as route22 from '../src/app/api/feature-access/route';
import * as route23 from '../src/app/api/canvas/text-nodes/route';
import * as route24 from '../src/app/api/canvas/node-settings/route';
import * as route25 from '../src/app/api/canvas/video-nodes/route';
import * as route26 from '../src/app/api/canvas/director-nodes/route';
import * as route27 from '../src/app/api/canvas/character-nodes/route';
import * as route28 from '../src/app/api/canvas/scene-nodes/route';
import * as route29 from '../src/app/api/canvas/audio-nodes/route';
import * as route30 from '../src/app/api/canvas/timeline-nodes/route';
import * as route31 from '../src/app/api/canvas/workflow-import/route';
import * as route32 from '../src/app/api/canvas/history/route';
import * as route33 from '../src/app/api/artworks/position/route';
import * as route34 from '../src/app/api/artworks/get/route';
import * as route35 from '../src/app/api/artworks/trash/route';
import * as route36 from '../src/app/api/artworks/canvas-size/route';
import * as route37 from '../src/app/api/media/image-cache/route';
import * as route38 from '../src/app/api/video/tasks/route';
import * as route39 from '../src/app/api/canvas/image-tasks/route';
import * as route40 from '../src/app/media/[...path]/route';
export const routes: Array<[RegExp, Record<string, any>, string[]]> = [
[/^\/api\/canvas\/image-prompts$/,imagePrompts,[]],
[/^\/api\/canvas\/image-reference-upload$/,imageReferenceUpload,[]],
[/^\/api\/canvas\/nodes\/copy$/,nodeCopy,[]],
[new RegExp('^/api/enterprise$'),enterprise,[]],
[new RegExp('^/api/video/assets$'),assets,[]],
[new RegExp('^/api/video/media-jobs$'),jobs,[]],
[new RegExp('^/api/collaboration/bootstrap$'), route0, []],
[new RegExp('^/api/collaboration/conversations$'), route1, []],
[new RegExp('^/api/collaboration/events$'), route2, []],
[new RegExp('^/api/collaboration/forward$'), route3, []],
[new RegExp('^/api/collaboration/members$'), route4, []],
[new RegExp('^/api/collaboration/presence$'), route5, []],
[new RegExp('^/api/collaboration/shares$'), route6, []],
[new RegExp('^/api/collaboration/uploads$'), route7, []],
[new RegExp('^/api/collaboration/uploads/([^/]+)$'), route8, ["id"]],
[new RegExp('^/api/collaboration/uploads/([^/]+)/complete$'), route9, ["id"]],
[new RegExp('^/api/collaboration/shares/([^/]+)$'), route10, ["id"]],
[new RegExp('^/api/collaboration/shares/([^/]+)/preview$'), route11, ["id"]],
[new RegExp('^/api/collaboration/messages/([^/]+)/withdraw$'), route12, ["id"]],
[new RegExp('^/api/collaboration/conversations/([^/]+)$'), route13, ["id"]],
[new RegExp('^/api/collaboration/conversations/([^/]+)/messages$'), route14, ["id"]],
[new RegExp('^/api/collaboration/conversations/([^/]+)/read$'), route15, ["id"]],
[new RegExp('^/api/collaboration/attachments/([^/]+)$'), route16, ["id"]],
[new RegExp('^/api/auth/login$'), route17, []],
[new RegExp('^/api/auth/session$'), route18, []],
[new RegExp('^/api/auth/logout$'), route19, []],
[new RegExp('^/api/account$'), route20, []],
[new RegExp('^/api/projects$'), route21, []],
[new RegExp('^/api/feature-access$'), route22, []],
[new RegExp('^/api/canvas/text-nodes$'), route23, []],
[new RegExp('^/api/canvas/node-settings$'), route24, []],
[new RegExp('^/api/canvas/video-nodes$'), route25, []],
[new RegExp('^/api/canvas/director-nodes$'), route26, []],
[new RegExp('^/api/canvas/character-nodes$'), route27, []],
[new RegExp('^/api/canvas/scene-nodes$'), route28, []],
[new RegExp('^/api/canvas/audio-nodes$'), route29, []],
[new RegExp('^/api/canvas/timeline-nodes$'), route30, []],
[new RegExp('^/api/canvas/workflow-import$'), route31, []],
[new RegExp('^/api/canvas/history$'), route32, []],
[new RegExp('^/api/artworks/position$'), route33, []],
[new RegExp('^/api/artworks/get$'), route34, []],
[new RegExp('^/api/artworks/trash$'), route35, []],
[new RegExp('^/api/artworks/canvas-size$'), route36, []],
[new RegExp('^/api/media/image-cache$'), route37, []],
[new RegExp('^/api/video/tasks$'), route38, []],
[new RegExp('^/api/canvas/image-tasks$'), route39, []],
[new RegExp('^/media/(.+)$'), route40, ["path"]]
];
