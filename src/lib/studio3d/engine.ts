import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildProduct, disposeObject } from "./scene";
import { outputDimensions, type StudioProject } from "./project";

export class StudioEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  readonly controls: OrbitControls;
  private product: THREE.Group | null = null;
  private floor: THREE.Mesh;
  private key = new THREE.DirectionalLight(0xfff5e8, 4);
  private fill = new THREE.DirectionalLight(0xe8f0ff, 2);
  private rim = new THREE.DirectionalLight(0xffffff, 3);
  private environment: THREE.WebGLRenderTarget;
  private observer: ResizeObserver;
  private disposed = false;
  private sequence = 0;
  private productKey = "";
  private current: StudioProject | null = null;
  private cameraKey = "";
  private contextLost: (event: Event) => void;
  constructor(
    private host: HTMLElement,
    onCamera: (pose: NonNullable<StudioProject["camera"]>) => void,
    onError: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "产品三维视窗");
    this.renderer.domElement.dataset.studioRenderer = "webgl";
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener("change", () => this.render());
    this.controls.addEventListener("end", () => onCamera(this.pose()));
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.key.position.set(3, 6, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = this.key.shadow.camera.bottom = -6;
    this.key.shadow.camera.right = this.key.shadow.camera.top = 6;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.bias = -0.0001;
    this.key.shadow.radius = 4;
    this.fill.position.set(-4, 3, 2);
    this.rim.position.set(1, 4, -3);
    this.scene.add(this.key, this.fill, this.rim);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: "#383d32", opacity: 0.18 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.004;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.contextLost = (event) => {
      event.preventDefault();
      onError("三维显示已中断，请保存工程后重新打开项目");
    };
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
  }
  pose(): NonNullable<StudioProject["camera"]> {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }
  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth),
      height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  private render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }
  private applyView(view: StudioProject["view"]) {
    if (!this.product) return;
    const bounds = new THREE.Box3().setFromObject(this.product),
      center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const radius = size.length() / 2,
      fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance =
      (radius /
        Math.sin(
          Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect)) /
            2,
        )) *
      1.1;
    const vectors = {
      hero: [1, 0.48, 1.7],
      front: [0, 0.12, 2],
      side: [2, 0.15, 0],
      back: [0, 0.12, -2],
      top: [0.01, 2, 0.1],
    };
    const direction = new THREE.Vector3(...vectors[view]).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = 0.01;
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  async update(p: StudioProject) {
    if (this.disposed || this.renderer.getContext().isContextLost())
      throw Error("三维显示已中断，请保存工程后重新打开项目");
    const serial = ++this.sequence;
    const signature = JSON.stringify([
      p.template,
      p.width,
      p.height,
      p.depth,
      p.material,
      p.color,
      p.capColor,
      p.roughness,
      p.rotation,
      p.label,
      p.labelScale,
      p.labelY,
      p.model,
    ]);
    if (signature !== this.productKey) {
      const next = await buildProduct(p);
      if (this.disposed || serial !== this.sequence) {
        disposeObject(next);
        return false;
      }
      if (this.product) {
        this.scene.remove(this.product);
        disposeObject(this.product);
      }
      this.product = next;
      this.scene.add(next);
      this.productKey = signature;
    }
    if (this.disposed || serial !== this.sequence) return false;
    const first = !this.current || this.current.id !== p.id;
    this.current = p;
    this.scene.background = new THREE.Color(p.background);
    this.renderer.toneMappingExposure = p.exposure;
    this.key.intensity =
      p.light === "bright" ? 3.5 : p.light === "dramatic" ? 4.5 : 2.2;
    this.fill.intensity = p.light === "dramatic" ? 0.2 : 0.9;
    this.rim.intensity = p.light === "dramatic" ? 3 : 1.4;
    this.scene.environmentIntensity = p.light === "dramatic" ? 0.25 : 0.5;
    this.resize();
    const key = JSON.stringify([
      p.view,
      p.camera,
      p.width,
      p.height,
      p.depth,
      p.output,
    ]);
    if (key !== this.cameraKey || first) {
      if (p.camera) {
        this.camera.position.fromArray(p.camera.position);
        this.controls.target.fromArray(p.camera.target);
        this.controls.update();
      } else this.applyView(p.view);
      this.cameraKey = key;
    }
    this.render();
    return true;
  }
  thumbnail() {
    this.render();
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = Math.round(320 / this.camera.aspect);
    canvas
      .getContext("2d")!
      .drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75);
  }
  async png(p: StudioProject, view?: StudioProject["view"]): Promise<Blob> {
    if (!this.product) throw Error("请等待模型加载完成");
    const [width, height] = outputDimensions(p),
      limit = this.renderer.capabilities.maxTextureSize;
    if (width > limit || height > limit)
      throw Error("当前设备不支持该分辨率，请降低导出尺寸");
    const pose = this.pose(),
      pixelRatio = this.renderer.getPixelRatio(),
      background = this.scene.background;
    const controlsEnabled = this.controls.enabled;
    this.controls.enabled = false;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      if (view) this.applyView(view);
      this.floor.visible = !p.transparent;
      if (p.transparent) this.scene.background = null;
      this.render();
      return await new Promise((resolve, reject) =>
        this.renderer.domElement.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(Error("导出图片失败，请降低分辨率")),
          "image/png",
        ),
      );
    } finally {
      this.scene.background = background;
      this.floor.visible = true;
      this.renderer.setPixelRatio(pixelRatio);
      this.camera.position.fromArray(pose.position);
      this.controls.target.fromArray(pose.target);
      this.controls.update();
      this.resize();
      this.controls.enabled = controlsEnabled;
    }
  }
  async glb() {
    if (!this.product) throw Error("请等待模型加载完成");
    const data = await new GLTFExporter().parseAsync(this.product, {
      binary: true,
    });
    if (!(data instanceof ArrayBuffer)) throw Error("模型导出失败");
    return new Blob([data], { type: "model/gltf-binary" });
  }
  dispose() {
    this.disposed = true;
    this.sequence++;
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    if (this.product) disposeObject(this.product);
    disposeObject(this.floor);
    this.key.shadow.map?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
