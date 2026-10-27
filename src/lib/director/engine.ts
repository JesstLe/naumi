import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { disposeObject } from "../three/dispose";
import { buildDirectorEntity, applyDirectorEntity } from "./scene";
import { directorOutputSize, sampleDirectorProject, type DirectorProject, type DirectorTransform, type DirectorView } from "./project";
import { finalizeDirectorWebm,muxDirectorWebm,type DirectorEncodedFrame } from "./webm";

type Callbacks = { onView: (view: DirectorView) => void; onSelect: (id: string | null) => void; onTransform: (id: string, transform: Omit<DirectorTransform, "pose">, commit: boolean) => void; onError: (message: string) => void };
function waitForPaint(signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  let finished=false,paintTask=0;const clean=()=>{cancelAnimationFrame(frame);clearTimeout(timer);clearTimeout(paintTask);signal.removeEventListener('abort',abort);};
  const finish=()=>{if(finished)return;finished=true;clean();resolve();},abort=()=>{if(finished)return;finished=true;clean();reject(signal.reason||new DOMException('Recording cancelled','AbortError'));};
  const frame=requestAnimationFrame(()=>{paintTask=window.setTimeout(finish,0);}),timer=window.setTimeout(finish,250);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
/** One editor owns one renderer. Canvas cards render stored thumbnails, not hidden WebGL scenes. */
export class DirectorEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 2000);
  readonly controls: OrbitControls;
  readonly transform: TransformControls;
  private objects = new Map<string, { object: THREE.Group; key: string }>();
  private floor: THREE.Mesh; private grid = new THREE.GridHelper(40, 40, "#b6c0cc", "#d4dbe3");
  private observer: ResizeObserver; private disposed = false; private project?: DirectorProject; private selected: string | null = null;
  private currentView = ""; private panorama = ""; private panoramaSequence = 0; private pendingTexture: Promise<void> = Promise.resolve();
  private down = { x: 0, y: 0 }; private exporting = false;
  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "导演台三维视窗"); this.renderer.domElement.dataset.directorRenderer = "webgl";
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.minDistance = 0.2; this.controls.maxDistance = 300;
    this.controls.addEventListener("change", this.render); this.controls.addEventListener("end", () => { if (!this.exporting) callbacks.onView(this.view()); });
    this.transform = new TransformControls(this.camera, this.renderer.domElement); this.transform.setSpace("world"); this.scene.add(this.transform.getHelper());
    this.transform.addEventListener("objectChange", () => { this.reportTransform(false); this.render(); });
    this.transform.addEventListener("dragging-changed", event => { this.controls.enabled = !event.value; if (!event.value) this.reportTransform(true); });
    const sun = new THREE.DirectionalLight(0xfff5e9, 3.5); sun.position.set(5, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -12; sun.shadow.camera.right = sun.shadow.camera.top = 12; sun.shadow.normalBias = 0.02;
    const fill = new THREE.DirectionalLight(0xe0ecff, 1.5); fill.position.set(-5, 4, -3); this.scene.add(sun, fill, new THREE.HemisphereLight(0xffffff, 0xa4afbd, 2));
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: "#e2e6ec", roughness: 1 })); this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -0.055; this.floor.receiveShadow = true; this.scene.add(this.floor); this.grid.position.y = -0.05; this.scene.add(this.grid);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown); this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
  }
  private contextLost = (event: Event) => { event.preventDefault(); this.callbacks.onError("三维视窗连接已中断，请保存工程后重新打开"); };
  private pointerDown = (event: PointerEvent) => { this.down = { x: event.clientX, y: event.clientY }; };
  private pointerUp = (event: PointerEvent) => {
    if (this.exporting || this.transform.dragging || event.button !== 0 || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4) return;
    const box = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1), this.camera);
    let object: THREE.Object3D | undefined = ray.intersectObjects([...this.objects.values()].map(item => item.object), true)[0]?.object;
    while (object && !object.userData.directorId) object = object.parent || undefined;
    this.callbacks.onSelect(object?.userData.directorId || null);
  };
  private reportTransform(commit: boolean) {
    const object = this.transform.object; if (!object || !this.selected) return;
    const rounded = (values: number[]) => values.map(value => Math.round(value * 1000) / 1000) as [number, number, number];
    this.callbacks.onTransform(this.selected, { position: rounded(object.position.toArray()), rotation: rounded([object.rotation.x, object.rotation.y, object.rotation.z].map(THREE.MathUtils.radToDeg)), scale: rounded(object.scale.toArray()).map(value => Math.max(0.05, Math.min(100, value))) as [number, number, number] }, commit);
  }
  view(): DirectorView { const rounded=(values:number[])=>values.map(value=>Math.round(value*10000)/10000) as [number,number,number];return { position: rounded(this.camera.position.toArray()), target: rounded(this.controls.target.toArray()), fov: this.camera.fov }; }
  select(id: string | null) { this.selected = id; const object = id ? this.objects.get(id)?.object : undefined; if (object && !this.exporting) this.transform.attach(object); else this.transform.detach(); this.render(); }
  mode(mode: "translate" | "rotate" | "scale") { this.transform.setMode(mode); this.transform.setSpace(mode === "scale" ? "local" : "world"); }
  setProject(project: DirectorProject, panoramaUrl?: string) {
    if (this.disposed) return; this.project = project;
    const ids = new Set(project.entities.map(entity => entity.id));
    for (const [id, item] of this.objects) if (!ids.has(id)) { if (this.transform.object === item.object) this.transform.detach(); this.scene.remove(item.object); disposeObject(item.object); this.objects.delete(id); }
    for (const entity of project.entities) {
      const key = `${entity.kind}:${entity.color}`; let item = this.objects.get(entity.id);
      if (!item || item.key !== key) {
        if (item) { this.scene.remove(item.object); disposeObject(item.object); }
        item = { object: buildDirectorEntity(entity), key }; this.objects.set(entity.id, item); this.scene.add(item.object);
      }
      applyDirectorEntity(item.object, entity);
    }
    (this.floor.material as THREE.MeshStandardMaterial).color.set(project.floor);
    const view = project.cameras.find(camera => camera.id === project.activeCameraId)!.view, key = JSON.stringify(view);
    if (key !== this.currentView) { this.currentView = key; this.camera.position.fromArray(view.position); this.controls.target.fromArray(view.target); this.camera.fov = view.fov; this.camera.updateProjectionMatrix(); this.controls.update(); }
    const url = project.panoramaArtworkId ? panoramaUrl || "" : "";
    if (url !== this.panorama) {
      this.panorama = url; const sequence = ++this.panoramaSequence;
      if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose(); this.scene.background = new THREE.Color(project.background);
      this.pendingTexture = url ? new THREE.TextureLoader().loadAsync(url).then(texture => {
        if (this.disposed || sequence !== this.panoramaSequence) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping; this.scene.background = texture; this.render();
      }).catch(() => { if (sequence === this.panoramaSequence && !this.disposed) this.callbacks.onError("全景背景加载失败，请重新选择画布图片"); throw new Error("全景背景加载失败"); }) : Promise.resolve();
      void this.pendingTexture.catch(() => {});
    }
    if (!url) this.scene.background = new THREE.Color(project.background);
    this.scene.backgroundRotation.y = THREE.MathUtils.degToRad(project.panoramaRotation); this.resize(); this.select(this.selected); this.render();
  }
  render = () => { if (!this.disposed) this.renderer.render(this.scene, this.camera); };
  private resize() {
    if (this.disposed || this.exporting) return;
    const [width, height] = directorOutputSize(this.project?.aspectRatio || "16:9"), ratio = width / height, box = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.min(box.width, box.height * ratio)), h = Math.max(1, w / ratio);
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = `${w}px`; this.renderer.domElement.style.height = `${h}px`; this.camera.aspect = ratio; this.camera.updateProjectionMatrix(); this.render();
  }
  private beginOutput() {
    if (this.exporting || !this.project || this.disposed || this.renderer.getContext().isContextLost()) throw new Error("三维视窗尚未就绪");
    this.exporting = true; this.controls.enabled = false; this.transform.detach(); this.grid.visible = false; this.renderer.setPixelRatio(1);
    const [width, height] = directorOutputSize(this.project.aspectRatio); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.render();
  }
  private endOutput(project: DirectorProject) { this.exporting = false; this.controls.enabled = true; this.grid.visible = true; this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.currentView = ""; this.setProject(project, this.panorama); }
  async capture(): Promise<Blob> {
    await this.pendingTexture; const project = this.project!; this.beginOutput();
    try { return await new Promise<Blob>((resolve, reject) => this.renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error("图像输出失败")), "image/png")); }
    finally { this.endOutput(project); }
  }
  async record(signal: AbortSignal, onProgress: (value: number) => void): Promise<Blob> {
    if(typeof VideoEncoder!=="undefined"&&typeof VideoFrame!=="undefined"){
      const output=await this.encodeFrames(signal,onProgress);if(output)return output;
    }
    this.renderer.domElement.dataset.directorEncoder="mediarecorder";
    return this.recordRealtime(signal,onProgress);
  }
  /** Offline timestamps keep every keyframed frame even on a software renderer;
   * export speed never turns a two-second camera move into a seven-frame clip. */
  private async encodeFrames(signal:AbortSignal,onProgress:(value:number)=>void):Promise<Blob|null>{
    await this.pendingTexture;const project=this.project!;if(!project)throw new Error("三维视窗尚未就绪");const [width,height]=directorOutputSize(project.aspectRatio),fps=24;
    let selected:VideoEncoderConfig|undefined;
    for(const codec of ["vp09.00.10.08","vp8"]){const config:VideoEncoderConfig={codec,width,height,framerate:fps,bitrate:6_000_000,latencyMode:"realtime",hardwareAcceleration:"prefer-software"};if((await VideoEncoder.isConfigSupported(config)).supported){selected=config;break;}}
    if(!selected)return null;signal.throwIfAborted();const frames:DirectorEncodedFrame[]=[];let failure:Error|undefined;
    const encoder=new VideoEncoder({output:chunk=>{const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);frames.push({data,timestamp:chunk.timestamp,key:chunk.type==="key"});},error:error=>{failure=error;}});
    try{encoder.configure(selected);this.beginOutput();this.renderer.domElement.dataset.directorEncoder="webcodecs";
      const count=Math.max(2,Math.round(project.duration*fps)),microseconds=Math.round(project.duration*1_000_000);
      for(let index=0;index<count;index++){
        signal.throwIfAborted();if(failure)throw failure;const sampled=sampleDirectorProject(project,index/(count-1)*project.duration);
        for(const entity of sampled.entities)applyDirectorEntity(this.objects.get(entity.id)!.object,entity);
        const view=sampled.cameras.find(camera=>camera.id===sampled.activeCameraId)!.view;this.camera.position.fromArray(view.position);this.camera.fov=view.fov;this.camera.lookAt(new THREE.Vector3().fromArray(view.target));this.camera.updateProjectionMatrix();this.render();this.renderer.getContext().finish();
        const timestamp=Math.round(index*microseconds/count),frame=new VideoFrame(this.renderer.domElement,{timestamp,duration:Math.round((index+1)*microseconds/count)-timestamp});
        try{encoder.encode(frame,{keyFrame:index%fps===0});}finally{frame.close();}
        if(encoder.encodeQueueSize>=4)await encoder.flush();onProgress((index+1)/count);await new Promise(resolve=>setTimeout(resolve,0));
      }
      await encoder.flush();signal.throwIfAborted();if(failure)throw failure;if(frames.length!==count)throw new Error("视频编码帧数不完整");frames.sort((a,b)=>a.timestamp-b.timestamp);
      return muxDirectorWebm(frames,width,height,project.duration,selected.codec==="vp8"?"V_VP8":"V_VP9");
    }finally{if(encoder.state!=="closed")encoder.close();if(this.exporting)this.endOutput(project);}
  }
  private async recordRealtime(signal: AbortSignal, onProgress: (value: number) => void): Promise<Blob> {
    await this.pendingTexture; const project = this.project!;
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("当前浏览器未启用视频录制，请使用支持WebM录制的浏览器");
    signal.throwIfAborted(); this.beginOutput(); const stream = this.renderer.domElement.captureStream(0), chunks: Blob[] = [],track=stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if(typeof track.requestFrame!=="function"){stream.getTracks().forEach(track=>track.stop());this.endOutput(project);throw new Error("当前浏览器未启用逐帧录制");}
    let recorder: MediaRecorder;try{recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6_000_000});}catch(error){stream.getTracks().forEach(track=>track.stop());this.endOutput(project);throw error;}
    let failed: unknown; const finished = new Promise<void>((resolve, reject) => { recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("视频录制失败")); });
    void finished.catch(error => { failed = error; });
    try {
      recorder.start(250); const start = performance.now();
      for (;;) {
        const frameStart=performance.now();
        signal.throwIfAborted(); if (failed) throw failed;
        const seconds = Math.min(project.duration, (performance.now() - start) / 1000), sampled = sampleDirectorProject(project, seconds);
        for (const entity of sampled.entities) applyDirectorEntity(this.objects.get(entity.id)!.object, entity);
        const view = sampled.cameras.find(camera => camera.id === sampled.activeCameraId)!.view; this.camera.position.fromArray(view.position); this.camera.fov = view.fov; this.camera.lookAt(new THREE.Vector3().fromArray(view.target)); this.camera.updateProjectionMatrix(); this.render();this.renderer.getContext().flush();track.requestFrame();onProgress(seconds / project.duration);
        // A WebGL draw is not a compositor frame. Wait for paint before the next
        // capture/stop so a valid-duration file cannot contain only its first frame.
        await waitForPaint(signal);
        signal.throwIfAborted();if (seconds >= project.duration) break;
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000/24-(performance.now()-frameStart))));
      }
      const seconds=(performance.now()-start)/1000;recorder.stop(); await finished; signal.throwIfAborted(); if (!chunks.length) throw new Error("录制结果为空"); return await finalizeDirectorWebm(new Blob(chunks, { type: "video/webm" }),seconds);
    } finally {
      if (recorder.state !== "inactive") { recorder.stop(); await finished.catch(() => {}); } stream.getTracks().forEach(track => track.stop()); this.endOutput(project);
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.panoramaSequence++; this.observer.disconnect(); this.controls.dispose(); this.transform.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown); this.renderer.domElement.removeEventListener("pointerup", this.pointerUp); this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.objects.forEach(item => disposeObject(item.object)); disposeObject(this.floor); this.grid.dispose(); if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.scene.traverse(object => { if (object instanceof THREE.Light && "shadow" in object) (object.shadow as THREE.LightShadow).dispose(); }); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
