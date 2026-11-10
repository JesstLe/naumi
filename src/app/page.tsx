import { HomeGate } from "@/components/home/home-gate";

export default function HomePage() {
  // Visitors and members use the same creation layout; actions retain auth gates.
  return <HomeGate />;
}
