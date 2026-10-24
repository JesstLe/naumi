"use client";
import {getBezierPath,type EdgeProps} from "@xyflow/react";
import {cn} from "@/lib/utils";
export function CometEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = data as { lit?: boolean; dim?: boolean } | undefined;
  const lit = !!d?.lit;
  return (
    <>
      {/* 加宽的透明命中区:让"鼠标放到线上"更容易触发悬停/剪断 */}
      <path
        className="react-flow__edge-interaction"
        d={path}
        fill="none"
        strokeWidth={22}
        stroke="transparent"
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
      <path
        className={cn("cw-base", lit && "cw-on", d?.dim && "cw-dim2")}
        d={path}
        fill="none"
      />
      {lit && (
        <>
          <path className="cw-comet cw-tail" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-body" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-head" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-spark" pathLength={100} d={path} fill="none" />
        </>
      )}
    </>
  );
}
