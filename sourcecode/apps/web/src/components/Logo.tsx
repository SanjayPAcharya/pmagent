// PmAgent by Buildenics Logo — modern SVG wordmark with Stacked Blocks icon.
// Driven by `currentColor` for "Pm" so it themes dynamically in light and dark mode.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 64"
      role="img"
      aria-label="PmAgent by Buildenics"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Icon Mark: Stacked Blocks 'B' + Action Arrow */}
      <g transform="translate(4, 6) scale(0.52)">
        <path d="M 12 16 L 30 16 L 30 84 L 12 84 Z" fill="currentColor" opacity="0.9" />
        <path d="M 30 16 L 68 16 L 82 30 L 30 30 Z" fill="#007AFF" />
        <path d="M 12 37 L 68 37 L 88 50 L 68 63 L 12 63 Z" fill="#007AFF" />
        <path d="M 30 70 L 68 70 L 82 84 L 30 84 Z" fill="currentColor" opacity="0.9" />
      </g>

      {/* Wordmark Typography */}
      <text
        x="64"
        y="38"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        fontSize="34"
        letterSpacing="-0.5"
      >
        <tspan fontWeight="800" fill="currentColor">Pm</tspan>
        <tspan fontWeight="700" fill="#007AFF">Agent</tspan>
      </text>

      {/* Brand Sub-tagline */}
      <text
        x="65"
        y="53"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        fontSize="10"
        fontWeight="700"
        letterSpacing="2.5"
        fill="currentColor"
        opacity="0.5"
      >
        BY BUILDENICS
      </text>
    </svg>
  )
}
