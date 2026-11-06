import { TXASM_MARK_PATHS, TXASM_MARK_VIEWBOX } from "~/lib/brand-svg";

type Props = { className?: string; title?: string };

/**
 * TXASM emblem mark. Inlined so it follows the [data-theme] toggle. Fill falls
 * back to --accent if --brand-red is absent, so it can never get stuck. Path
 * geometry is shared with the print cover via brand-svg.ts.
 */
export function BrandMark({ className, title = "TXASM" }: Props) {
  return (
    <svg
      className={className}
      viewBox={TXASM_MARK_VIEWBOX}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <g style={{ fill: "var(--brand-red, var(--accent))" }}>
        {TXASM_MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
