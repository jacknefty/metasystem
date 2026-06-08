/**
 * Cube Mockups — SVG black cube variations for node design
 */

import { COLORS } from '../design-system';

interface CubeProps {
  glowColor?: string;
  size?: number;
}

// Variant 1: Clean isometric cube with edge glow
export function CubeClean({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="topFace1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
        <linearGradient id="leftFace1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0d0d0d" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="rightFace1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#111111" />
          <stop offset="100%" stopColor="#080808" />
        </linearGradient>
        <filter id="glow1" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Cube faces */}
      <polygon points="50,15 85,35 85,70 50,90 15,70 15,35" fill="#080808" />
      <polygon points="50,15 85,35 50,55 15,35" fill="url(#topFace1)" />
      <polygon points="15,35 50,55 50,90 15,70" fill="url(#leftFace1)" />
      <polygon points="85,35 50,55 50,90 85,70" fill="url(#rightFace1)" />

      {/* Glowing edges */}
      <g filter="url(#glow1)" stroke={glowColor} strokeWidth="1" fill="none" opacity="0.8">
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
        <line x1="50" y1="55" x2="50" y2="90" />
        <line x1="85" y1="35" x2="85" y2="70" />
        <line x1="15" y1="35" x2="15" y2="70" />
      </g>
    </svg>
  );
}

// Variant 2: Circuit-traced cube
export function CubeCircuit({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="topFace2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#121212" />
          <stop offset="100%" stopColor="#080808" />
        </linearGradient>
        <linearGradient id="leftFace2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="rightFace2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0e0e0e" />
          <stop offset="100%" stopColor="#070707" />
        </linearGradient>
        <filter id="glow2" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glowStrong2" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Cube faces */}
      <polygon points="50,15 85,35 50,55 15,35" fill="url(#topFace2)" />
      <polygon points="15,35 50,55 50,90 15,70" fill="url(#leftFace2)" />
      <polygon points="85,35 50,55 50,90 85,70" fill="url(#rightFace2)" />

      {/* Circuit traces on TOP face */}
      <g stroke={glowColor} fill="none" filter="url(#glow2)">
        {/* Main bus lines */}
        <path d="M50,20 L50,35 L42,40" strokeWidth="0.8" opacity="0.9" />
        <path d="M50,35 L58,40" strokeWidth="0.8" opacity="0.9" />
        <path d="M30,30 L40,35 L40,42" strokeWidth="0.6" opacity="0.7" />
        <path d="M70,30 L60,35 L60,42" strokeWidth="0.6" opacity="0.7" />
        {/* Cross traces */}
        <path d="M35,33 L50,42 L65,33" strokeWidth="0.5" opacity="0.5" />
        <path d="M25,35 L32,38" strokeWidth="0.4" opacity="0.4" />
        <path d="M75,35 L68,38" strokeWidth="0.4" opacity="0.4" />
      </g>

      {/* Circuit nodes on TOP */}
      <g fill={glowColor} filter="url(#glow2)">
        <circle cx="50" cy="35" r="2.5" opacity="1" />
        <circle cx="50" cy="20" r="1.5" opacity="0.8" />
        <circle cx="42" cy="40" r="1.2" opacity="0.7" />
        <circle cx="58" cy="40" r="1.2" opacity="0.7" />
        <circle cx="40" cy="35" r="1" opacity="0.6" />
        <circle cx="60" cy="35" r="1" opacity="0.6" />
        <circle cx="30" cy="30" r="0.8" opacity="0.5" />
        <circle cx="70" cy="30" r="0.8" opacity="0.5" />
        <rect x="47" y="27" width="6" height="3" rx="0.5" opacity="0.4" />
      </g>

      {/* Circuit traces on LEFT face */}
      <g stroke={glowColor} fill="none" filter="url(#glow2)">
        <path d="M32,42 L32,55 L25,62" strokeWidth="0.6" opacity="0.6" />
        <path d="M32,55 L38,65 L32,75" strokeWidth="0.5" opacity="0.5" />
        <path d="M22,50 L28,55" strokeWidth="0.4" opacity="0.4" />
        <path d="M40,58 L40,72" strokeWidth="0.4" opacity="0.35" />
      </g>

      {/* Circuit nodes on LEFT */}
      <g fill={glowColor} filter="url(#glow2)">
        <circle cx="32" cy="55" r="1.5" opacity="0.7" />
        <circle cx="25" cy="62" r="1" opacity="0.5" />
        <circle cx="38" cy="65" r="1" opacity="0.5" />
        <circle cx="32" cy="75" r="0.8" opacity="0.4" />
      </g>

      {/* Circuit traces on RIGHT face */}
      <g stroke={glowColor} fill="none" filter="url(#glow2)">
        <path d="M68,42 L68,55 L75,62" strokeWidth="0.6" opacity="0.6" />
        <path d="M68,55 L62,65 L68,75" strokeWidth="0.5" opacity="0.5" />
        <path d="M78,50 L72,55" strokeWidth="0.4" opacity="0.4" />
        <path d="M60,58 L60,72" strokeWidth="0.4" opacity="0.35" />
        <path d="M55,62 L62,65" strokeWidth="0.3" opacity="0.3" />
      </g>

      {/* Circuit nodes on RIGHT */}
      <g fill={glowColor} filter="url(#glow2)">
        <circle cx="68" cy="55" r="1.5" opacity="0.7" />
        <circle cx="75" cy="62" r="1" opacity="0.5" />
        <circle cx="62" cy="65" r="1" opacity="0.5" />
        <circle cx="68" cy="75" r="0.8" opacity="0.4" />
      </g>

      {/* Glowing edges */}
      <g filter="url(#glowStrong2)" stroke={glowColor} strokeWidth="1.5" fill="none" opacity="0.95">
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
        <line x1="50" y1="55" x2="50" y2="90" />
      </g>

      {/* Corner vertex accents */}
      <g fill={glowColor} filter="url(#glowStrong2)">
        <circle cx="50" cy="15" r="2.5" opacity="1" />
        <circle cx="50" cy="90" r="2" opacity="0.8" />
      </g>
    </svg>
  );
}

// Variant 3: Hexagonal tech cube
export function CubeHex({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <pattern id="hexPattern" width="10" height="8.66" patternUnits="userSpaceOnUse">
          <polygon points="5,0 10,2.5 10,7.5 5,10 0,7.5 0,2.5"
            fill="none" stroke={glowColor} strokeWidth="0.3" opacity="0.2" />
        </pattern>
        <filter id="glow3" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base cube */}
      <polygon points="50,15 85,35 50,55 15,35" fill="#101010" />
      <polygon points="15,35 50,55 50,90 15,70" fill="#080808" />
      <polygon points="85,35 50,55 50,90 85,70" fill="#0c0c0c" />

      {/* Hex pattern overlay */}
      <polygon points="50,15 85,35 50,55 15,35" fill="url(#hexPattern)" />

      {/* Inner glow frame */}
      <g filter="url(#glow3)" stroke={glowColor} strokeWidth="0.8" fill="none" opacity="0.7">
        <polygon points="50,22 78,38 50,54 22,38" />
      </g>

      {/* Corner accents */}
      <g fill={glowColor} filter="url(#glow3)">
        <circle cx="50" cy="15" r="2" opacity="0.9" />
        <circle cx="85" cy="35" r="1.5" opacity="0.6" />
        <circle cx="15" cy="35" r="1.5" opacity="0.6" />
        <circle cx="50" cy="90" r="1.5" opacity="0.6" />
      </g>

      {/* Edge glow */}
      <g filter="url(#glow3)" stroke={glowColor} strokeWidth="1.2" fill="none" opacity="0.8">
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
      </g>
    </svg>
  );
}

// Variant 4: Wireframe holographic cube
export function CubeWireframe({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <filter id="glow4" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Transparent fill */}
      <polygon points="50,15 85,35 50,55 15,35" fill="#0a0a0a" fillOpacity="0.8" />
      <polygon points="15,35 50,55 50,90 15,70" fill="#050505" fillOpacity="0.8" />
      <polygon points="85,35 50,55 50,90 85,70" fill="#080808" fillOpacity="0.8" />

      {/* All edges glowing */}
      <g filter="url(#glow4)" stroke={glowColor} strokeWidth="1" fill="none">
        {/* Top */}
        <line x1="50" y1="15" x2="85" y2="35" opacity="1" />
        <line x1="50" y1="15" x2="15" y2="35" opacity="1" />
        <line x1="85" y1="35" x2="50" y2="55" opacity="0.7" />
        <line x1="15" y1="35" x2="50" y2="55" opacity="0.7" />
        {/* Verticals */}
        <line x1="50" y1="55" x2="50" y2="90" opacity="0.8" />
        <line x1="85" y1="35" x2="85" y2="70" opacity="0.5" />
        <line x1="15" y1="35" x2="15" y2="70" opacity="0.5" />
        {/* Bottom */}
        <line x1="50" y1="90" x2="85" y2="70" opacity="0.4" />
        <line x1="50" y1="90" x2="15" y2="70" opacity="0.4" />
        <line x1="85" y1="70" x2="15" y2="70" opacity="0.3" strokeDasharray="2,2" />
      </g>

      {/* Corner points */}
      <g fill={glowColor} filter="url(#glow4)">
        <circle cx="50" cy="15" r="2.5" />
        <circle cx="85" cy="35" r="2" />
        <circle cx="15" cy="35" r="2" />
        <circle cx="50" cy="55" r="1.5" />
        <circle cx="50" cy="90" r="2" />
      </g>
    </svg>
  );
}

// Variant 5: Solid tech cube with panel lines
export function CubeTech({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="topFace5" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#181818" />
          <stop offset="50%" stopColor="#101010" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </linearGradient>
        <filter id="glow5" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="innerShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
          <feOffset dx="2" dy="2" result="offsetBlur" />
          <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
        </filter>
      </defs>

      {/* Base cube with shadows */}
      <polygon points="50,15 85,35 50,55 15,35" fill="url(#topFace5)" />
      <polygon points="15,35 50,55 50,90 15,70" fill="#090909" />
      <polygon points="85,35 50,55 50,90 85,70" fill="#0d0d0d" />

      {/* Panel lines on top */}
      <g stroke="#222" strokeWidth="0.5" fill="none">
        <line x1="50" y1="20" x2="50" y2="50" />
        <line x1="25" y1="32" x2="75" y2="38" />
      </g>

      {/* Tech details */}
      <g fill={glowColor} filter="url(#glow5)">
        <rect x="45" y="30" width="10" height="6" rx="1" opacity="0.3" />
        <rect x="47" y="32" width="6" height="2" rx="0.5" opacity="0.8" />
      </g>

      {/* Side panel lines */}
      <g stroke="#1a1a1a" strokeWidth="0.5" fill="none">
        <line x1="30" y1="50" x2="30" y2="75" />
        <line x1="70" y1="50" x2="70" y2="75" />
      </g>

      {/* Edge highlights */}
      <g filter="url(#glow5)" stroke={glowColor} strokeWidth="1.2" fill="none" opacity="0.9">
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
        <line x1="50" y1="55" x2="50" y2="90" />
      </g>

      {/* Top corner accent */}
      <circle cx="50" cy="15" r="3" fill={glowColor} filter="url(#glow5)" opacity="0.8" />
    </svg>
  );
}

// Variant 6: Minimal with strong glow on all edges
export function CubeMinimal({ glowColor = COLORS.identity.primary, size = 120 }: CubeProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <filter id="glow6" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="topFace6" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f0f0f" />
          <stop offset="100%" stopColor="#080808" />
        </linearGradient>
      </defs>

      {/* Solid dark cube */}
      <polygon points="50,15 85,35 50,55 15,35" fill="url(#topFace6)" />
      <polygon points="15,35 50,55 50,90 15,70" fill="#060606" />
      <polygon points="85,35 50,55 50,90 85,70" fill="#0a0a0a" />

      {/* All edges glowing */}
      <g filter="url(#glow6)" stroke={glowColor} strokeWidth="1.5" fill="none">
        {/* Top face edges */}
        <line x1="50" y1="15" x2="85" y2="35" />
        <line x1="50" y1="15" x2="15" y2="35" />
        <line x1="15" y1="35" x2="50" y2="55" />
        <line x1="85" y1="35" x2="50" y2="55" />
        {/* Vertical edges */}
        <line x1="50" y1="55" x2="50" y2="90" />
        <line x1="15" y1="35" x2="15" y2="70" />
        <line x1="85" y1="35" x2="85" y2="70" />
        {/* Bottom face edges */}
        <line x1="15" y1="70" x2="50" y2="90" />
        <line x1="85" y1="70" x2="50" y2="90" />
      </g>
    </svg>
  );
}

// Mockup showcase page
export function CubeMockups() {
  const colors = [
    { name: 'Identity (Gold)', color: COLORS.identity.primary },
    { name: 'Member (Cyan)', color: COLORS.member.primary },
    { name: 'Project (Violet)', color: COLORS.project.primary },
  ];

  const variants = [
    { name: '1. Clean', component: CubeClean },
    { name: '2. Circuit', component: CubeCircuit },
    { name: '3. Hex Pattern', component: CubeHex },
    { name: '4. Wireframe', component: CubeWireframe },
    { name: '5. Tech Panels', component: CubeTech },
    { name: '6. Minimal Glow', component: CubeMinimal },
  ];

  return (
    <div style={{
      background: COLORS.bg.void,
      minHeight: '100vh',
      padding: '40px',
      color: COLORS.text.primary
    }}>
      <h1 style={{ marginBottom: '40px', fontSize: '1.5rem' }}>
        Cube Node Mockups
      </h1>

      {variants.map(({ name, component: Cube }) => (
        <div key={name} style={{ marginBottom: '60px' }}>
          <h2 style={{
            marginBottom: '20px',
            fontSize: '1rem',
            color: COLORS.text.secondary
          }}>
            {name}
          </h2>

          <div style={{ display: 'flex', gap: '60px', flexWrap: 'wrap' }}>
            {colors.map(({ name: colorName, color }) => (
              <div key={colorName} style={{ textAlign: 'center' }}>
                <Cube glowColor={color} size={140} />
                <div style={{
                  marginTop: '12px',
                  fontSize: '0.75rem',
                  color: COLORS.text.muted
                }}>
                  {colorName}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
