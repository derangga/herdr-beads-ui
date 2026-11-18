// Types the mods share. Imported with `import type` only, so esbuild erases every import of
// this file and each mod still builds to one standalone main.js.
import type { Color } from "gpui-kit";

// herdr.d.ts types theme() as Record<string, string>; its values are always #rrggbb[aa].
export type Theme = Record<string, Color>;

// A node of layout() (typed `unknown` in herdr.d.ts), as far as the mods read it.
export interface LayoutNode {
  id?: string;
  type?: string;
  hidden?: boolean;
  active?: string;
  size?: { px?: number; weight?: number };
  background?: unknown;
  content?: { mod?: string; props?: Record<string, unknown>; tab?: string; pane?: PaneFrame };
  children?: LayoutNode[];
  [key: string]: unknown;
}

export interface PaneFrame {
  background?: string;
  header?: { content?: { mod?: string }; position?: "top" | "bottom"; height?: number; reveal?: string };
  [key: string]: unknown;
}
