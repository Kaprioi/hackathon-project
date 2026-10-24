// Hand-drawn style SVG illustrations for the homepage, copied from the Lovable
// design. They are decorative (the text next to them says the same thing), so
// they are hidden from screen readers.

const ink = "#1f2a37";
// The theme colours (see the "Color" setting), so the drawings change with it.
const brand = "var(--color-brand)";
const lilac = "var(--color-lilac)";
const lilacShade = "color-mix(in oklab, var(--color-lilac) 75%, var(--color-brand))";
const leaf = "#17795a";
const mint = "#c9f0df";
const coral = "#ff9f7a";
const wood = "#c48a5c";

/**
 * Grandma at home, waving; a phone on a table watching the room; and the
 * family update it sends. `cardKey` makes the update card pop when it changes.
 */
export function HeroIllustration({
  title,
  sub,
  time,
  cardKey,
  className = "",
  style,
}: {
  title: string;
  sub: string;
  time: string;
  cardKey: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 520 420" className={`h-auto w-full ${className}`} style={style} aria-hidden="true">
      <circle cx="250" cy="210" r="200" fill={lilac} />
      <g className="animate-float">
        <circle className="origin-center animate-pulse-ring [transform-box:fill-box]" cx="78" cy="78" r="34" fill="#fff1b8" />
        <circle cx="78" cy="78" r="34" fill="#fff1b8" />
      </g>
      <ellipse cx="260" cy="398" rx="230" ry="14" fill={lilacShade} />

      {/* What the phone's camera can see */}
      <path className="animate-scan" d="M372 236 L140 120 L140 372 Z" fill={brand} />
      <path
        className="animate-dash"
        d="M372 236 L140 120 M372 236 L140 372"
        stroke={brand}
        strokeWidth="4"
        strokeDasharray="6 10"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* Grandma, waving */}
      <g transform="translate(20 124)">
        <g className="animate-bob">
          <path d="M40 270c0-90 20-130 60-130s60 40 60 130z" fill={coral} />
          <circle cx="100" cy="95" r="45" fill="#f2c2a0" />
          <path d="M55 90c0-40 90-45 90 0-5-25-30-30-45-30s-40 5-45 30z" fill="#e6e9ee" />
          <circle cx="100" cy="50" r="18" fill="#e6e9ee" />
          <circle cx="85" cy="98" r="4" fill={ink} />
          <circle cx="115" cy="98" r="4" fill={ink} />
          <path d="M88 115q12 10 24 0" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="78" cy="108" r="7" fill="#ffb3a1" opacity="0.7" />
          <circle cx="122" cy="108" r="7" fill="#ffb3a1" opacity="0.7" />
          <g className="animate-wave [transform-box:fill-box]" style={{ transformOrigin: "10% 92%" }}>
            <path d="M150 175q40-20 45-70" stroke={coral} strokeWidth="26" fill="none" strokeLinecap="round" />
            <circle cx="196" cy="98" r="16" fill="#f2c2a0" />
          </g>
        </g>
      </g>

      {/* Table with the phone on a stand */}
      <rect x="318" y="334" width="12" height="62" fill="#a8724a" />
      <rect x="470" y="334" width="12" height="62" fill="#a8724a" />
      <rect x="300" y="318" width="200" height="16" rx="8" fill={wood} />
      <path d="M380 318 l8-12 h26 l8 12z" fill="#46505f" />
      <rect x="370" y="196" width="62" height="114" rx="12" fill={ink} />
      <rect x="376" y="212" width="50" height="86" rx="6" fill="#fff" />
      <circle cx="401" cy="204" r="3.5" fill={mint} />
      <circle className="origin-center animate-pulse-ring [transform-box:fill-box]" cx="401" cy="244" r="14" fill={mint} />
      <circle cx="401" cy="244" r="14" fill={mint} />
      <path d="m394 244 5 5 9-10" stroke={leaf} strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="386" y="266" width="30" height="6" rx="3" fill={ink} />
      <rect x="390" y="278" width="22" height="5" rx="2.5" fill="#b8c2d1" />

      {/* The update the family receives */}
      <path
        className="animate-dash"
        d="M401 190 C400 168 418 160 412 146"
        stroke={brand}
        strokeWidth="4"
        strokeDasharray="3 9"
        fill="none"
        strokeLinecap="round"
      />
      <g transform="translate(288 64)">
        <g key={cardKey} className="origin-center animate-pop [transform-box:fill-box]">
          <rect x="4" y="6" width="214" height="70" rx="18" fill={lilacShade} />
          <rect width="214" height="70" rx="18" fill="#fff" />
          <circle cx="35" cy="35" r="19" fill={mint} />
          <path d="m26 35 6 6 12-13" stroke={leaf} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <text x="64" y="31" fontSize="17" fontWeight="800" fill={ink} fontFamily="inherit">
            {title}
          </text>
          <text x="64" y="52" fontSize="14" fill="#46505f" fontFamily="inherit">
            {sub} · {time}
          </text>
        </g>
      </g>
    </svg>
  );
}

/** Step 1: a phone standing on a table. */
export function PhoneOnTableIcon() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
      <path d="M26 30a16 16 0 0 0 0 22" stroke={brand} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M17 24a26 26 0 0 0 0 34" stroke={brand} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.5" />
      <rect x="36" y="16" width="28" height="52" rx="6" fill={ink} />
      <rect x="39" y="24" width="22" height="38" rx="3" fill="#fff" />
      <circle cx="50" cy="20" r="2" fill={mint} />
      <rect x="6" y="70" width="84" height="8" rx="4" fill={wood} />
      <rect x="14" y="78" width="6" height="14" fill="#a8724a" />
      <rect x="76" y="78" width="6" height="14" fill="#a8724a" />
    </svg>
  );
}

const arrow = {
  stroke: ink,
  strokeWidth: 4,
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Step 2: the phone follows movement left/right and up/down. */
export function MovementIcon() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="34" r="9" fill="#f2c2a0" />
      <path d="M35 68c0-16 6-24 13-24s13 8 13 24z" fill={brand} />
      <path d="M48 20V6m-6 6 6-6 6 6" {...arrow} />
      <path d="M48 74v16m-6-6 6 6 6-6" {...arrow} />
      <path d="M28 52H8m6-6-6 6 6 6" {...arrow} />
      <path d="M68 52h20m-6-6 6 6-6 6" {...arrow} />
    </svg>
  );
}

/** Step 3: a message arrives on a family member's phone. */
export function FamilyPhoneIcon() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
      <rect x="26" y="8" width="44" height="80" rx="10" fill={ink} />
      <rect x="31" y="18" width="34" height="58" rx="5" fill="#fff" />
      <path
        className="origin-center animate-heartbeat [transform-box:fill-box]"
        d="M48 58s-10-6-10-12a5 5 0 0 1 10-3 5 5 0 0 1 10 3c0 6-10 12-10 12z"
        fill="#e0475b"
      />
      <circle cx="68" cy="14" r="10" fill={leaf} />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="#fff" />
      <path d="M28 12 44 42H12z" fill="#c2412a" />
      <rect x="26.5" y="22" width="3" height="10" fill="#fff" />
      <rect x="26.5" y="35" width="3" height="3" fill="#fff" />
    </svg>
  );
}

export function CheckInIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="#fff" />
      <circle cx="28" cy="28" r="16" fill={leaf} />
      <path d="m21 28 5 5 9-10" stroke="#fff" strokeWidth="4" fill="none" />
    </svg>
  );
}

export function DashboardIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="28" fill="#fff" />
      <circle cx="20" cy="22" r="6" fill={brand} />
      <circle cx="36" cy="22" r="6" fill={coral} />
      <path d="M9 42c1-8 6-12 11-12s10 4 11 12zm16 0c1-8 6-12 11-12s10 4 11 12z" fill={ink} />
    </svg>
  );
}

/** "Updates by itself": a person with arrows, on a white circle. */
export function UpdatesIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="48" fill="#fff" />
      <circle cx="48" cy="34" r="9" fill="#f2c2a0" />
      <path d="M35 68c0-16 6-24 13-24s13 8 13 24z" fill={brand} />
      <path d="M48 20V10m-5 5 5-5 5 5" {...arrow} />
      <path d="M28 52H14m5-5-5 5 5 5" {...arrow} />
      <path d="M68 52h14m-5-5 5 5-5 5" {...arrow} />
    </svg>
  );
}

/** Three family members sharing the same update. */
export function FamilyIllustration() {
  return (
    <svg viewBox="0 0 420 260" className="h-auto w-full" aria-hidden="true">
      <rect width="420" height="260" rx="32" fill={mint} />
      <g className="animate-bob [animation-delay:-0.4s]">
        <circle cx="110" cy="110" r="36" fill="#f2c2a0" />
        <path d="M60 230c4-50 24-70 50-70s46 20 50 70z" fill={brand} />
      </g>
      <g className="animate-bob [animation-delay:-1.2s]">
        <circle cx="210" cy="100" r="40" fill="#e3b089" />
        <path d="M155 230c4-55 26-78 55-78s51 23 55 78z" fill={coral} />
        <path
          className="origin-center animate-heartbeat [transform-box:fill-box]"
          d="M210 50s-10-6-10-12a5 5 0 0 1 10-3 5 5 0 0 1 10 3c0 6-10 12-10 12z"
          fill="#e0475b"
        />
      </g>
      <g className="animate-bob [animation-delay:-2s]">
        <circle cx="310" cy="118" r="30" fill="#f2c2a0" />
        <path d="M268 230c3-44 20-62 42-62s39 18 42 62z" fill={leaf} />
      </g>
    </svg>
  );
}
