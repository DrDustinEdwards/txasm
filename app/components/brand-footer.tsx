import { TEXAS_STATE_PATH } from "~/lib/brand-svg";

type Props = {
  className?: string;
  /** Wordmark cap size in px. Everything else scales from this. */
  size?: number;
  /** Set false to render the wordmark without the tagline line. */
  tagline?: boolean;
};

/**
 * TXASM footer wordmark: "Texas" + Texas state glyph + "Branch", tagline below.
 * All text is real Inter (inherits --font-sans); only the state is inline SVG.
 * Colors read theme tokens and follow the [data-theme] toggle. Brand tokens are
 * first choice; --link / --accent are fallbacks that also flip on toggle, so the
 * mark can never get stuck on one theme.
 */
export function BrandFooter({ className, size = 36, tagline = true }: Props) {
  const blue = "var(--brand-blue, var(--accent-text))";
  const red = "var(--brand-red, var(--accent))";

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Math.round(size * 0.22),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.38) }}>
        <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1, color: blue }}>
          Texas
        </span>
        <svg
          viewBox="0 0 200 190"
          role="img"
          aria-label="Texas"
          style={{ height: size * 1.15, width: "auto", color: "var(--muted)" }}
        >
          <path d={TEXAS_STATE_PATH} fill="currentColor" />
        </svg>
        <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1, color: red }}>
          Branch
        </span>
      </div>
      {tagline ? (
        <div
          style={{
            fontSize: Math.round(size * 0.3),
            fontWeight: 500,
            letterSpacing: "0.22em",
            color: "var(--muted)",
          }}
        >
          AMERICAN SOCIETY FOR MICROBIOLOGY
        </div>
      ) : null}
    </div>
  );
}
