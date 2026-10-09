interface MobiRobotProps {
  /** full: cuerpo completo con el letrero de bienvenida · head: cabeza flotante · mini: avatar de 24px */
  variant: 'full' | 'head' | 'mini';
}

// Parpadeo breve cada 4 s (los ojos son elipses para poder animar su alto)
const PARPADEO = { dur: '4s', keyTimes: '0;0.46;0.5;0.54;1', repeatCount: 'indefinite' } as const;

export default function MobiRobot({ variant }: MobiRobotProps) {
  // Se repite en cada mensaje: sin <defs> para no duplicar ids en la página
  if (variant === 'mini') {
    return (
      <svg width="24" height="24" viewBox="0 -2 24 24" fill="none" aria-hidden="true">
        <line x1="12" y1="3" x2="12" y2="0" stroke="#5a6070" strokeWidth="1.5" />
        <circle cx="12" cy="0" r="1.5" fill="#3b82f6">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </circle>
        <rect x="3" y="3" width="18" height="16" rx="4" fill="#3a4055" stroke="#5a6070" strokeWidth="0.5" />
        <ellipse cx="9" cy="11" rx="2.5" ry="2.5" fill="#3b82f6">
          <animate attributeName="ry" values="2.5;2.5;0.3;2.5;2.5" {...PARPADEO} />
        </ellipse>
        <ellipse cx="15" cy="11" rx="2.5" ry="2.5" fill="#3b82f6">
          <animate attributeName="ry" values="2.5;2.5;0.3;2.5;2.5" {...PARPADEO} />
        </ellipse>
      </svg>
    );
  }

  if (variant === 'head') {
    return (
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-blue-500/25 blur-xl" />
        <svg
          width="56"
          height="56"
          viewBox="0 -3 50 50"
          fill="none"
          aria-hidden="true"
          className="mobi-float relative drop-shadow-[0_0_8px_rgba(59,130,246,0.35)]"
        >
          <line x1="25" y1="8" x2="25" y2="2" stroke="#5a6070" strokeWidth="2" />
          <circle cx="25" cy="2" r="3" fill="#3b82f6">
            <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
          </circle>
          <rect x="4" y="8" width="42" height="34" rx="8" fill="url(#mobiHeadGrad)" stroke="#5a6070" strokeWidth="1" />
          <rect x="8" y="12" width="34" height="26" rx="4" fill="#2a2f3b" opacity="0.5" />
          <ellipse cx="18" cy="25" rx="5" ry="5" fill="#3b82f6" filter="url(#mobiHeadGlow)">
            <animate attributeName="ry" values="5;5;0.5;5;5" {...PARPADEO} />
          </ellipse>
          <ellipse cx="32" cy="25" rx="5" ry="5" fill="#3b82f6" filter="url(#mobiHeadGlow)">
            <animate attributeName="ry" values="5;5;0.5;5;5" {...PARPADEO} />
          </ellipse>
          <path d="M20 33 Q25 37 30 33" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          {/* Tornillos */}
          <circle cx="10" cy="14" r="1" fill="#5a6070" />
          <circle cx="40" cy="14" r="1" fill="#5a6070" />
          <circle cx="10" cy="36" r="1" fill="#5a6070" />
          <circle cx="40" cy="36" r="1" fill="#5a6070" />
          <defs>
            <linearGradient id="mobiHeadGrad" x1="4" y1="8" x2="46" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#505878" />
              <stop offset="1" stopColor="#3a4055" />
            </linearGradient>
            <filter id="mobiHeadGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-3xl bg-blue-500/10 blur-2xl" />
      <svg
        width="132"
        height="163"
        viewBox="-6 -8 132 163"
        fill="none"
        aria-hidden="true"
        className="relative drop-shadow-[0_0_12px_rgba(59,130,246,0.25)]"
      >
        {/* Antena */}
        <line x1="50" y1="35" x2="50" y2="30" stroke="#5a6070" strokeWidth="2.5" />
        <circle cx="50" cy="31" r="3" fill="#3b82f6">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Cabeza */}
        <rect x="18" y="35" width="64" height="38" rx="10" fill="url(#mobiFullHead)" stroke="#5a6070" strokeWidth="1" />
        <rect x="24" y="40" width="52" height="28" rx="6" fill="#2a2f3b" opacity="0.5" />
        <ellipse cx="38" cy="53" rx="6" ry="6" fill="#3b82f6" filter="url(#mobiFullGlow)">
          <animate attributeName="ry" values="6;6;0.5;6;6" {...PARPADEO} />
        </ellipse>
        <ellipse cx="62" cy="53" rx="6" ry="6" fill="#3b82f6" filter="url(#mobiFullGlow)">
          <animate attributeName="ry" values="6;6;0.5;6;6" {...PARPADEO} />
        </ellipse>
        <path d="M40 63 Q50 69 60 63" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <circle cx="23" cy="40" r="1.5" fill="#5a6070" />
        <circle cx="77" cy="40" r="1.5" fill="#5a6070" />

        {/* Cuello */}
        <rect x="42" y="73" width="16" height="6" rx="2" fill="#3a4055" />

        {/* Cuerpo con panel central */}
        <rect x="22" y="79" width="56" height="40" rx="8" fill="url(#mobiFullBody)" stroke="#5a6070" strokeWidth="1" />
        <rect x="35" y="85" width="30" height="20" rx="4" fill="#2a2f3b" opacity="0.6" />
        <circle cx="43" cy="95" r="2" fill="#22c55e">
          <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <rect x="48" y="93" width="12" height="1.5" rx="1" fill="#5a6070" />
        <rect x="48" y="97" width="8" height="1.5" rx="1" fill="#5a6070" />
        <line x1="26" y1="111" x2="74" y2="111" stroke="#ffffff" strokeOpacity="0.12" />
        <circle cx="28" cy="84" r="1.5" fill="#5a6070" />
        <circle cx="72" cy="84" r="1.5" fill="#5a6070" />

        {/* Brazo izquierdo, en reposo */}
        <rect x="6" y="83" width="14" height="28" rx="5" fill="#2a2f3b" stroke="#5a6070" strokeWidth="0.5" />
        <circle cx="13" cy="113" r="5" fill="#5a6070" />

        {/* Base con orugas */}
        <rect x="26" y="119" width="48" height="10" rx="5" fill="#2a2f3b" />
        <ellipse cx="36" cy="133" rx="12" ry="6" fill="#3a4055" stroke="#5a6070" strokeWidth="0.5" />
        <ellipse cx="64" cy="133" rx="12" ry="6" fill="#3a4055" stroke="#5a6070" strokeWidth="0.5" />
        <line x1="28" y1="133" x2="44" y2="133" stroke="#5a6070" strokeWidth="0.5" />
        <line x1="56" y1="133" x2="72" y2="133" stroke="#5a6070" strokeWidth="0.5" />

        <text x="50" y="151" textAnchor="middle" fill="#3b82f6" fontSize="10" fontWeight="bold" fontFamily="system-ui, sans-serif">
          MOBI
        </text>

        {/* Brazo derecho con el letrero: entra con rebote y se mece desde el hombro */}
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 -10;0 2;0 -3;0 0"
            dur="0.8s"
            repeatCount="1"
          />
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-3 89 88;3 89 88;-3 89 88"
              dur="1.4s"
              repeatCount="indefinite"
            />
            <rect x="82" y="46" width="14" height="46" rx="5" fill="#2a2f3b" stroke="#5a6070" strokeWidth="0.5" />
            <line x1="89" y1="26" x2="89" y2="44" stroke="#5a6070" strokeWidth="2.5" />
            <circle cx="89" cy="45" r="5.5" fill="#5a6070" />
            <rect x="10" y="0" width="100" height="28" rx="6" fill="url(#mobiSignGrad)" stroke="#60a5fa" strokeWidth="1" />
            <rect x="12" y="2" width="96" height="8" rx="3" fill="#ffffff" opacity="0.1" />
            <text x="60" y="19" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold" fontFamily="system-ui, sans-serif">
              ¡Bienvenido!
            </text>
          </g>
        </g>

        <defs>
          <linearGradient id="mobiSignGrad" x1="10" y1="0" x2="110" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563eb" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="mobiFullHead" x1="18" y1="35" x2="82" y2="73" gradientUnits="userSpaceOnUse">
            <stop stopColor="#505878" />
            <stop offset="1" stopColor="#3a4055" />
          </linearGradient>
          <linearGradient id="mobiFullBody" x1="22" y1="79" x2="78" y2="119" gradientUnits="userSpaceOnUse">
            <stop stopColor="#505878" />
            <stop offset="1" stopColor="#2a2f3b" />
          </linearGradient>
          <filter id="mobiFullGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}
