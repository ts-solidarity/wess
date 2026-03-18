type PieceColor = "w" | "b";
type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

type PieceDescriptor = {
  color: PieceColor;
  type: PieceType;
};

const FALLBACK_PIECE_BODY = `
  <circle cx="50" cy="34" r="18" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" />
  <rect x="28" y="54" width="44" height="24" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" />
  <rect x="20" y="82" width="60" height="10" fill="#bea070" stroke="#1a1208" stroke-width="1.8" />
`;

const PIECE_SVG_BODIES: Record<`${PieceColor}${PieceType}`, string> = {
  wk: `
    <polygon points="44,4 56,4 56,12 67,12 67,24 56,24 56,32 44,32 44,24 33,24 33,12 44,12" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="56,4 56,32 67,12 67,24" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="44,4 44,32 33,12 33,24" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="42" y="32" width="16" height="4" fill="#bea070" stroke="#1a1208" stroke-width="1.5"/>
    <polygon points="27,36 73,36 79,81 21,81" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,36 73,36 79,81 50,81" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="50,36 27,36 21,81 50,81" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="14" y="81" width="72" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="20" y="92" width="60" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  bk: `
    <polygon points="44,4 56,4 56,12 67,12 67,24 56,24 56,32 44,32 44,24 33,24 33,12 44,12" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="56,4 56,32 67,12 67,24" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="44,4 44,32 33,12 33,24" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="42" y="32" width="16" height="4" fill="#4a4038" stroke="#1c1610" stroke-width="1.5"/>
    <polygon points="27,36 73,36 79,81 21,81" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,36 73,36 79,81 50,81" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="50,36 27,36 21,81 50,81" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="14" y="81" width="72" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="20" y="92" width="60" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
  wq: `
    <polygon points="22,4 30,20 38,4 50,20 62,4 70,20 78,4 78,30 22,30" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,20 62,4 70,20 78,4 78,30 50,30" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="22,4 30,20 38,4 50,20 50,30 22,30" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <polygon points="22,30 78,30 73,81 27,81" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,30 78,30 73,81 50,81" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="50,30 22,30 27,81 50,81" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="15" y="81" width="70" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="20" y="92" width="60" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  bq: `
    <polygon points="22,4 30,20 38,4 50,20 62,4 70,20 78,4 78,30 22,30" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,20 62,4 70,20 78,4 78,30 50,30" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="22,4 30,20 38,4 50,20 50,30 22,30" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <polygon points="22,30 78,30 73,81 27,81" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,30 78,30 73,81 50,81" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="50,30 22,30 27,81 50,81" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="15" y="81" width="70" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="20" y="92" width="60" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
  wb: `
    <polygon points="30,52 38,6 50,22 62,6 70,52" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,22 62,6 70,52" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="30,52 38,6 50,22" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <line x1="38" y1="32" x2="62" y2="32" stroke="#1a1208" stroke-width="2.2"/>
    <line x1="50" y1="20" x2="50" y2="46" stroke="#1a1208" stroke-width="2.2"/>
    <rect x="24" y="50" width="52" height="9" fill="#bea070" stroke="#1a1208" stroke-width="2.6"/>
    <polygon points="24,59 76,59 71,82 29,82" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,59 76,59 71,82 50,82" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="50,59 24,59 29,82 50,82" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="14" y="82" width="72" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="20" y="93" width="60" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  bb: `
    <polygon points="30,52 38,6 50,22 62,6 70,52" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,22 62,6 70,52" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="30,52 38,6 50,22" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <line x1="38" y1="32" x2="62" y2="32" stroke="#1c1610" stroke-width="2.2"/>
    <line x1="50" y1="20" x2="50" y2="46" stroke="#1c1610" stroke-width="2.2"/>
    <rect x="24" y="50" width="52" height="9" fill="#4a4038" stroke="#1c1610" stroke-width="2.6"/>
    <polygon points="24,59 76,59 71,82 29,82" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,59 76,59 71,82 50,82" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="50,59 24,59 29,82 50,82" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="14" y="82" width="72" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="20" y="93" width="60" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
  wn: `
    <polygon points="33,12 50,4 62,10 70,22 74,36 76,48 73,56 65,56 57,62 54,70 62,82 38,82 32,70 26,58 26,42 30,26" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,4 62,10 70,22 74,36 76,48 73,56 65,56 57,62 54,70 62,82 50,82 50,60 50,38 50,18" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="33,12 50,4 50,18 50,38 50,60 50,82 38,82 32,70 26,58 26,42 30,26" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="63" y="28" width="7" height="7" fill="#1a1208" stroke="none"/>
    <line x1="57" y1="62" x2="62" y2="56" stroke="#1a1208" stroke-width="1.4"/>
    <rect x="12" y="82" width="76" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="18" y="93" width="64" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  bn: `
    <polygon points="33,12 50,4 62,10 70,22 74,36 76,48 73,56 65,56 57,62 54,70 62,82 38,82 32,70 26,58 26,42 30,26" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,4 62,10 70,22 74,36 76,48 73,56 65,56 57,62 54,70 62,82 50,82 50,60 50,38 50,18" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="33,12 50,4 50,18 50,38 50,60 50,82 38,82 32,70 26,58 26,42 30,26" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="63" y="28" width="7" height="7" fill="#040200" stroke="none"/>
    <line x1="57" y1="62" x2="62" y2="56" stroke="#1c1610" stroke-width="1.4"/>
    <rect x="12" y="82" width="76" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="18" y="93" width="64" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
  wr: `
    <rect x="15" y="5" width="30" height="24" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <polygon points="15,5 27,5 27,29 15,29" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="55" y="5" width="30" height="24" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <polygon points="73,5 85,5 85,29 73,29" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <rect x="15" y="26" width="70" height="56" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="44" y="40" width="12" height="28" fill="#1a1208" stroke="none"/>
    <polygon points="15,26 33,26 33,82 15,82" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <polygon points="67,26 85,26 85,82 67,82" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <line x1="45" y1="29" x2="55" y2="29" stroke="#1a1208" stroke-width="1.4"/>
    <rect x="11" y="82" width="78" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="17" y="93" width="66" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  br: `
    <rect x="15" y="5" width="30" height="24" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <polygon points="15,5 27,5 27,29 15,29" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="55" y="5" width="30" height="24" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <polygon points="73,5 85,5 85,29 73,29" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <rect x="15" y="26" width="70" height="56" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="44" y="40" width="12" height="28" fill="#040200" stroke="none"/>
    <polygon points="15,26 33,26 33,82 15,82" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <polygon points="67,26 85,26 85,82 67,82" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <line x1="45" y1="29" x2="55" y2="29" stroke="#1c1610" stroke-width="1.4"/>
    <rect x="11" y="82" width="78" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="17" y="93" width="66" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
  wp: `
    <polygon points="50,8 63,17 63,34 50,43 37,34 37,17" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,8 63,17 63,34 50,43" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="50,8 37,17 37,34 50,43" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <polygon points="44,43 56,43 58,56 42,56" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,43 56,43 58,56 50,56" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="30,56 70,56 75,81 25,81" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,56 70,56 75,81 50,81" fill="#ffffff" fill-opacity="0.38" stroke="none"/>
    <polygon points="50,56 30,56 25,81 50,81" fill="#503205" fill-opacity="0.24" stroke="none"/>
    <rect x="18" y="81" width="64" height="11" fill="#f0e8d4" stroke="#1a1208" stroke-width="2.6"/>
    <rect x="22" y="92" width="56" height="8" fill="#bea070" stroke="#1a1208" stroke-width="1.8"/>
  `,
  bp: `
    <polygon points="50,8 63,17 63,34 50,43 37,34 37,17" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,8 63,17 63,34 50,43" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="50,8 37,17 37,34 50,43" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <polygon points="44,43 56,43 58,56 42,56" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,43 56,43 58,56 50,56" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="30,56 70,56 75,81 25,81" fill="#3a3229" stroke="#1c1610" stroke-width="2.6" stroke-linejoin="miter"/>
    <polygon points="50,56 70,56 75,81 50,81" fill="#ffffff" fill-opacity="0.20" stroke="none"/>
    <polygon points="50,56 30,56 25,81 50,81" fill="#000000" fill-opacity="0.32" stroke="none"/>
    <rect x="18" y="81" width="64" height="11" fill="#3a3229" stroke="#1c1610" stroke-width="2.6"/>
    <rect x="22" y="92" width="56" height="8" fill="#4a4038" stroke="#1c1610" stroke-width="1.8"/>
  `,
};

function normalizeClassName(className: string) {
  return className.trim().replace(/\s+/g, " ");
}

export function renderPieceSvg(piece: PieceDescriptor, className = "piece-svg") {
  const key = `${piece.color}${piece.type}` as const;
  const body = PIECE_SVG_BODIES[key] ?? FALLBACK_PIECE_BODY;
  const classes = normalizeClassName(`${className} piece-${piece.color} piece-${piece.type}`);

  return `
    <svg
      class="${classes}"
      viewBox="0 0 100 102"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      shape-rendering="geometricPrecision"
    >
      ${body}
    </svg>
  `;
}
