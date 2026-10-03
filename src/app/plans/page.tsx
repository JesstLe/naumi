import { notFound } from "next/navigation";

/** Research pricing is available only in the authenticated administration area. */
export default function PlansPage() {
  notFound();
}
