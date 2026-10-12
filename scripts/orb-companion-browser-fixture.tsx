import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useOrbCompanion } from "../src/components/naumi-orb/use-orb-companion";
import { CanvasAgentOrb } from "../src/components/canvas/canvas-agent-orb";

function Fixture() {
  const [scope, setScope] = useState("fixture:p1");
  const [open, setOpen] = useState(false);
  const companion = useOrbCompanion(scope), separate = useOrbCompanion("workbench:independent");
  const outcome = companion.model.busy ? "running" : companion.model.phase === "error" ? "error" : companion.model.phase === "stopped" ? "stopped" : companion.model.phase === "done" ? "done" : "idle";
  Object.assign(window, { orbTest: { emit: companion.emit, setScope, oldEmit: (window as any).orbTest?.oldEmit || companion.emit } });
  return <main style={{ position: "relative", width: "100vw", height: "100vh", background: "#f8f9fb" }}>
    <CanvasAgentOrb email="fixture@example.test" busy={companion.model.busy} outcome={outcome} steps={[]}
      open={open} english={false} onActivate={() => setOpen(value => !value)} companion={companion} onCue={companion.emit} />
    <output data-testid="independent" data-busy={separate.model.busy}>{separate.face}</output>
    <output data-testid="opened">{String(open)}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
