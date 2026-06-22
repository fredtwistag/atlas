export type Tone = "blue" | "amber" | "red" | "green" | "purple" | "gray";

export interface LayoutLane {
  id: string;
  label: string;
  y: number;
  h: number;
}

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string | null;
  tone: Tone;
  shape: "rect" | "diamond" | "circle";
  dashed: boolean;
  /** Role label shown as a pill at the top of a vertical card. When set, the
   * renderer draws the card (left-aligned chip + title + body lines) instead of
   * the centered box. null/undefined → the existing centered rendering. */
  chip?: string | null;
  /** Pre-wrapped title lines for a vertical card (≤2) so a long step label is
   * shown in full instead of truncated. */
  titleLines?: string[] | null;
  /** Pre-wrapped description lines for a vertical card (≤2). The box height is
   * sized to fit both title + body lines; the renderer draws one `<text>` per line. */
  bodyLines?: string[] | null;
}

export interface LayoutEdge {
  id: string;
  points: { x: number; y: number }[];
  dashed: boolean;
  tone: Tone;
}

export interface LayoutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
}

export interface LayoutText {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  muted: boolean;
}

export interface Layout {
  width: number;
  height: number;
  lanes: LayoutLane[];
  boxes: LayoutBox[];
  edges: LayoutEdge[];
  lines: LayoutLine[];
  texts: LayoutText[];
}
