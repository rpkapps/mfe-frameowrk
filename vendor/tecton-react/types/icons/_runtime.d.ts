/**
 * Size / stroke-width maths shared by generated SVG-backed icons.
 * Mirrors lucide: with `absoluteStrokeWidth` the stroke stays visually
 * constant across sizes (strokeWidth * viewBoxSize / size).
 */
export declare function tectonSvgAttrs(size: number | string, strokeWidth: number | string | undefined, absoluteStrokeWidth: boolean | undefined, viewBox?: string): {
    width: number | string;
    height: number | string;
    strokeWidth?: number | string;
};
