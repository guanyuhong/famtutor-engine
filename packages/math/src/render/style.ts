import type { EntityStyle, MathDocument, MathEntity } from "../types.js";

export interface ResolvedStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  dashArray?: string;
  labelVisible: boolean;
  pointSize: number;
  fontSize: number;
}

const LIGHT_TOKENS: Record<string, Partial<ResolvedStyle>> = {
  primary: { stroke: "#155a73", fill: "#155a73" },
  accent: { stroke: "#d06a3a", fill: "#d06a3a" },
  auxiliary: { stroke: "#708090", fill: "#708090", opacity: 0.8 },
  muted: { stroke: "#8b98a5", fill: "#8b98a5", opacity: 0.75 },
  danger: { stroke: "#b43a45", fill: "#b43a45" },
  success: { stroke: "#247a52", fill: "#247a52" }
};

const DARK_TOKENS: Record<string, Partial<ResolvedStyle>> = {
  primary: { stroke: "#7fd3ec", fill: "#7fd3ec" },
  accent: { stroke: "#ffad7a", fill: "#ffad7a" },
  auxiliary: { stroke: "#aab8c5", fill: "#aab8c5", opacity: 0.85 },
  muted: { stroke: "#8c9aa8", fill: "#8c9aa8", opacity: 0.75 },
  danger: { stroke: "#ff8992", fill: "#ff8992" },
  success: { stroke: "#76d2a4", fill: "#76d2a4" }
};

function defaultToken(entity: MathEntity): string {
  if (entity.role === "auxiliary" || entity.role === "annotation") return "auxiliary";
  if (entity.role === "measurement") return "accent";
  if (entity.role === "derived") return "accent";
  return "primary";
}

export function styleForEntity(
  document: MathDocument,
  entity: MathEntity,
  theme: "light" | "dark" = "light"
): ResolvedStyle {
  const binding = (document.styles ?? []).find(candidate => candidate.targets.includes(entity.id));
  const authored: EntityStyle = binding?.style ?? {};
  const token = authored.token ?? defaultToken(entity);
  const tokenStyle = (theme === "dark" ? DARK_TOKENS : LIGHT_TOKENS)[token] ?? {};
  const dashArray = authored.dash === "dashed" ? "8 6" : authored.dash === "dotted" ? "2 5" : undefined;
  return {
    stroke: authored.stroke ?? tokenStyle.stroke ?? (theme === "dark" ? "#dce8ef" : "#263746"),
    fill: authored.fill ?? tokenStyle.fill ?? (theme === "dark" ? "#dce8ef" : "#263746"),
    strokeWidth: authored.strokeWidth ?? 2.4,
    opacity: authored.opacity ?? tokenStyle.opacity ?? 1,
    fillOpacity: authored.fillOpacity ?? (
      entity.type === "polygon2" ? 0.13
        : entity.type === "circle2" ? 0.04
          : entity.type === "angle" ? 0.16
            : entity.type === "point2" || entity.type === "scalar" ? 1
              : 0
    ),
    dashArray,
    labelVisible: authored.labelVisible ?? Boolean(entity.label),
    pointSize: authored.pointSize ?? 5,
    fontSize: authored.fontSize ?? 16
  };
}
