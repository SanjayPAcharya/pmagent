// PMAgent wordmark — the same logo used on the Keycloak sign-in page
// (infra/keycloak/themes/pmagent/login/resources/img/logo.svg), but driven by
// `currentColor` so it themes with the app (works in light + dark mode).
// "PM" at full weight/opacity, "Agent" lighter — matching the login screen.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 56"
      role="img"
      aria-label="PMAgent"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="120"
        y="41"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        fontSize="40"
        letterSpacing="-1"
        fill="currentColor"
      >
        <tspan fontWeight="800">PM</tspan><tspan fontWeight="500" opacity="0.62">Agent</tspan>
      </text>
    </svg>
  )
}
