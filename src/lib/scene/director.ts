import type {DirectorProject} from "../director/project";
import type {SceneDirectorSnapshot} from "./project";

/** Applying a background does not regenerate the camera, geometry or timeline. */
export function applySceneDirectorSnapshot(project: DirectorProject, snapshot: SceneDirectorSnapshot): DirectorProject {
  return {...project, panoramaArtworkId: snapshot.background?.artworkId ?? null,
    backgroundProjection: snapshot.background?.projection ?? "image", sceneReference: snapshot};
}
