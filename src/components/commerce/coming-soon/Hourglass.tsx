// Ampulheta do Coming soon (SVG puro, decorativa). A areia de cima escoa em 60 s, cai um fio de areia
// e no fim do minuto a ampulheta vira (coming-soon.css). Com movimento reduzido fica parada pela metade.
// Um por página: os ids do gradiente são fixos.
export function Hourglass({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="uh-cs-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb070" />
          <stop offset="100%" stopColor="#ff5a1f" />
        </linearGradient>
        <radialGradient id="uh-cs-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="uh-cs-glow" cx="32" cy="50" rx="30" ry="40" fill="url(#uh-cs-halo)" />
      <g className="uh-cs-glass">
        {/* vidro */}
        <path
          d="M14 10 H50 C50 28 36 40 34 48 C36 56 50 68 50 86 H14 C14 68 28 56 30 48 C28 40 14 28 14 10 Z"
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(232,227,219,0.55)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* areia */}
        <path className="uh-cs-sand-top" d="M18.5 15 H45.5 C44.5 27 36.5 38 32 46 C27.5 38 19.5 27 18.5 15 Z" fill="url(#uh-cs-sand)" />
        <path className="uh-cs-sand-bottom" d="M17.5 83 H46.5 C45.5 70 36.5 58 32 52 C27.5 58 18.5 70 17.5 83 Z" fill="url(#uh-cs-sand)" />
        <line className="uh-cs-stream" x1="32" y1="46" x2="32" y2="82" stroke="#ff8a60" strokeWidth="1.4" strokeLinecap="round" />
        {/* tampas */}
        <rect x="8" y="4" width="48" height="6" rx="3" fill="#ff5a1f" />
        <rect x="8" y="86" width="48" height="6" rx="3" fill="#ff5a1f" />
        <rect x="12" y="5.5" width="40" height="1.2" rx="0.6" fill="rgba(255,255,255,0.35)" />
        <rect x="12" y="87.5" width="40" height="1.2" rx="0.6" fill="rgba(255,255,255,0.35)" />
      </g>
    </svg>
  );
}
