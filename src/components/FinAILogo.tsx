interface FinAILogoProps {
  height?: number;
  className?: string;
  finColor?: string;
  aiColor?: string;
}

/**
 * FinAI wordmark logo.
 * - "Fin" rendered with a rounded sans-serif
 * - "AI" rendered as geometric strokes (A = peak without crossbar, I = vertical bar)
 */
export function FinAILogo({
  height = 40,
  className,
  finColor = "currentColor",
  aiColor = "hsl(217 91% 60%)",
}: FinAILogoProps) {
  // viewBox tuned so width/height ratio ≈ 3.4:1 like the reference
  return (
    <svg
      viewBox="0 0 220 64"
      height={height}
      width={height * (220 / 64)}
      className={className}
      role="img"
      aria-label="FinAI"
    >
      <text
        x="0"
        y="50"
        fill={finColor}
        fontFamily="'Nunito', 'SF Pro Rounded', ui-rounded, system-ui, sans-serif"
        fontWeight={800}
        fontSize={58}
        letterSpacing="-2"
      >
        Fin
      </text>
      <g
        stroke={aiColor}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* A — two diagonals meeting at apex, no crossbar */}
        <path d="M 118 52 L 140 12 L 162 52" />
        {/* I — vertical rounded bar */}
        <line x1="180" y1="12" x2="180" y2="52" />
      </g>
    </svg>
  );
}

export default FinAILogo;
