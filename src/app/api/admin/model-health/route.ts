import { modelHealthHandler } from "@/lib/model-health/access";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
export const GET=modelHealthHandler;
export const POST=modelHealthHandler;
