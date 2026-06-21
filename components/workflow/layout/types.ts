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
