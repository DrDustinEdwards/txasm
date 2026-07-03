type Props = {
  className?: string;
  /** Wordmark cap size in px. Everything else scales from this. */
  size?: number;
  /** Set false to render the wordmark without the tagline line. */
  tagline?: boolean;
};

const TEXAS_PATH =
  "M142.5,190 L136.5,189 L115,179.5 L108,160.5 L97,148.5 L90,133.5 L78.5,123 L76.5,122 L61.5,123 L57,132.5 L53.5,136 L46.5,134 L38.5,130 L32,123.5 L29,114.5 L25,108.5 L0,85.5 L1.5,83 L53.5,83 L55,81.5 L55.5,0 L100.5,0 L101,34.5 L105.5,39 L112.5,40 L119.5,44 L128.5,44 L132.5,48 L137.5,47 L149.5,48 L155.5,52 L160.5,52 L167.5,49 L176.5,48 L192,55.5 L192,81.5 L200,98.5 L196,123.5 L193.5,126 L158.5,146 L152,152.5 L142,166.5 L143,177.5 L144,178.5 L144,188.5 L142.5,190 Z";

/**
 * TXASM footer wordmark: "Texas" + Texas state glyph + "Branch", tagline below.
 * All text is real Inter (inherits --font-sans); only the state is inline SVG.
 * Colors read theme tokens and follow the [data-theme] toggle. Brand tokens are
 * first choice; --link / --accent are fallbacks that also flip on toggle, so the
 * mark can never get stuck on one theme.
 */
export function BrandFooter({ className, size = 36, tagline = true }: Props) {
  const blue = "var(--brand-blue, var(--link))";
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
          style={{ height: size * 1.15, width: "auto", color: "var(--text-muted)" }}
        >
          <path d={TEXAS_PATH} fill="currentColor" />
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
            color: "var(--text-muted)",
          }}
        >
          AMERICAN SOCIETY FOR MICROBIOLOGY
        </div>
      ) : null}
    </div>
  );
}

export default BrandFooter;
