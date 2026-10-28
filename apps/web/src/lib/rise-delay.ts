import type { CSSProperties } from "react";

/** Staggers the `.rise` entrance (globals.css) of one element by `ms`. */
export const riseDelay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;
