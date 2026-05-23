import logoSrc from "@/assets/finai-logo.png";

interface FinAILogoProps {
  height?: number;
  className?: string;
  /** @deprecated kept for API compat */
  finColor?: string;
  /** @deprecated kept for API compat */
  aiColor?: string;
}

export function FinAILogo({ height = 40, className }: FinAILogoProps) {
  return (
    <img
      src={logoSrc}
      alt="FinAI"
      draggable={false}
      style={{ height, width: "auto" }}
      className={className}
    />
  );
}

export default FinAILogo;
