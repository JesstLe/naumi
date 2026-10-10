import type { LayoutNode, LayoutEdge } from "../../src/lib/canvas/smart-layout";

/** Same scale/topology as the user's reference: 3 product chains, tall text and shared inputs. */
export function complexCanvas() {
  const nodes: LayoutNode[] = [], edges: LayoutEdge[] = [];
  const add = (id: string, width: number, height: number, column: number, row: number) => {
    nodes.push({ id, width, height, x: column * 180 + row * 37, y: row * 240 });
  };
  const edge = (source: string, target: string) => edges.push({ source, target });
  for (let product = 0; product < 3; product++) {
    const p = `p${product}`;
    add(`${p}-original`, 300, product === 1 ? 500 : 280, 0, product * 5);
    add(`${p}-reference`, 360, 220, 0, product * 5 + 1);
    add(`text-${p}-brief`, 330, product === 1 ? 680 : 400, 1, product * 5 + 1);
    edge(`${p}-original`, `text-${p}-brief`);
    for (let variant = 0; variant < 4; variant++) {
      const id = `${p}-v${variant}`;
      add(id, 320, variant === 2 ? 580 : 460, 2 + variant % 2, product * 5 + variant);
      edge(`${p}-original`, id);
      edge(`${p}-reference`, id);
      edge(`text-${p}-brief`, id);
      if (variant > 1) edge(`${p}-v${variant - 2}`, id);
    }
    add(`text-${p}-review`, 360, 720, 4, product * 5 + 2);
    edge(`${p}-v2`, `text-${p}-review`); edge(`${p}-v3`, `text-${p}-review`);
    add(`${p}-final`, 400, 300, 5, product * 5 + 3);
    edge(`text-${p}-review`, `${p}-final`); edge(`${p}-v3`, `${p}-final`);
    add(`text-${p}-copy`, 360, 220, 6, product * 5 + 4);
    edge(`${p}-final`, `text-${p}-copy`);
  }
  return { nodes, edges };
}
