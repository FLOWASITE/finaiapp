import { Menu, MoreHorizontal, Calculator, Sparkles, Plus, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatMode, type ChatMode } from "@/hooks/use-chat-mode";
import { useChatLayout } from "@/components/chat/chat-layout-context";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  onToggleSidebar?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
};

export function ChatHeader({ title, onToggleSidebar, onRename, onDelete }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useChatMode();
  const { onMenu } = useChatLayout();

  const toggleSidebar = () => {
    if (onToggleSidebar) return onToggleSidebar();
    onMenu();
  };

  return (
    <header className="sticky top-0 z-20 bg-background/35 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-3 md:px-4">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Mở danh sách hội thoại"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title || "Fin"}
        </div>

        <ModeToggle mode={mode} onChange={setMode} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Tùy chọn"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate({ to: "/chat" })}>
              <Plus className="mr-2 h-4 w-4" /> Cuộc trò chuyện mới
            </DropdownMenuItem>
            {onRename && (
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-4 w-4" /> Đổi tên
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Xoá hội thoại
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function ModeToggle({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Chế độ trò chuyện"
      className="flex h-8 items-center rounded-full border border-border/70 bg-muted/40 p-0.5 text-xs"
    >
      <ModeBtn
        active={mode === "accounting"}
        onClick={() => onChange("accounting")}
        icon={<Calculator className="h-3.5 w-3.5" />}
        label="Kế toán"
      />
      <ModeBtn
        active={mode === "ai"}
        onClick={() => onChange("ai")}
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="AI"
      />
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
