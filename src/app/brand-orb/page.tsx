import type { Metadata } from "next";
import { OrbLab } from "./orb-lab";

export const metadata: Metadata = { title: "Naumi · 小球设计" };
export default function BrandOrbPage() { return <OrbLab />; }
