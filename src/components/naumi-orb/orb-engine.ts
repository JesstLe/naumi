export interface OrbEngine {
  setEmotion(id: string): boolean;
  setGaze(x: number, y: number): this;
  clearGaze(): this;
  spin(turns?: number): this;
  setActive(active: boolean): void;
  renderStatic(): void;
  destroy(): void;
}

export interface OrbRuntime {
  create(element: Element, options: {
    emotion: string; color: string; eyeColor: string; eyeScale: number;
    label: string; autostart: boolean; lite: boolean; idle: boolean;
  }): OrbEngine;
}

let loading: Promise<OrbRuntime> | undefined;
export function loadOrbEngine(): Promise<OrbRuntime> {
  if (!loading) {
    loading = import("./vendor/grok-ball.js").then(() => {
      const runtime = (window as unknown as { GrokBall: OrbRuntime }).GrokBall;
      if (!runtime?.create) throw new Error("Orb runtime missing");
      return runtime;
    }).catch(error => { loading = undefined; throw error; });
  }
  return loading;
}
