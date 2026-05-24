import {
  ScanLine,
  BookOpen,
  ArrowLeftRight,
  ReceiptText,
  ShieldAlert,
  ChartPie,
  Bot,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  ScanLine,
  BookOpen,
  ArrowLeftRight,
  ReceiptText,
  ShieldAlert,
  ChartPie,
};

export function AgentIcon({
  name,
  size = 16,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const Icon = MAP[name] ?? Bot;
  return <Icon size={size} color={color} />;
}
