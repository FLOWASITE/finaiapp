import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConditionsEdit } from "./ConditionsBlock";
import { ActionsEdit } from "./ActionsBlock";
import { RuleSettings } from "./RuleSettings";
import { RuleTestPanel } from "./RuleTestPanel";
import { useRuleStore } from "@/lib/rules/rule-store";
import type { Rule } from "@/types/rule";

export function RuleEditor({
  rule,
  open,
  onOpenChange,
  onSave,
}: {
  rule: Rule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (rule: Rule) => Promise<void> | void;
}) {
  const isMobile = useIsMobile();
  const storeUpsert = useRuleStore((s) => s.upsert);
  const [draft, setDraft] = useState<Rule>(rule);
  const [hasTested, setHasTested] = useState(false);
  const [confirmHeavyOpen, setConfirmHeavyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Lưu ý: parent phải truyền `key={rule.id}` để remount khi đổi rule —
  // tránh setState trong render (gây React #185).

  const patch = (p: Partial<Rule>) => {
    setDraft((d) => ({ ...d, ...p }));
    setHasTested(false);
  };

  const doSave = async () => {
    if (draft.conditions.length === 0) {
      toast.error("Cần ít nhất 1 điều kiện");
      return;
    }
    if (draft.actions.length === 0) {
      toast.error("Cần ít nhất 1 hành động");
      return;
    }
    if (!draft.name.trim() || draft.name.trim().length < 3) {
      toast.error("Tên quy tắc tối thiểu 3 ký tự");
      return;
    }
    const next: Rule = {
      ...draft,
      version: rule.id === draft.id && rule.applied_count > 0 ? rule.version + 1 : draft.version,
      previous_version_id: rule.applied_count > 0 ? rule.id : draft.previous_version_id,
    };
    try {
      setSaving(true);
      if (onSave) await onSave(next);
      else storeUpsert(next);
      toast.success("Đã lưu quy tắc — sẽ áp dụng từ giao dịch tiếp theo");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu quy tắc thất bại");
    } finally {
      setSaving(false);
    }
  };

  const trySave = () => {
    if (rule.applied_count > 100) {
      setConfirmHeavyOpen(true);
      return;
    }
    doSave();
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-3">
          <Label className="text-[13px] font-medium">Tên quy tắc</Label>
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="text-[14px]"
          />
          <Textarea
            placeholder="Mô tả ngắn (tùy chọn)"
            value={draft.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
            className="min-h-[60px] text-[12.5px]"
          />
        </div>

        <Accordion type="multiple" defaultValue={["conditions", "actions", "settings"]} className="mt-4">
          <AccordionItem value="conditions">
            <AccordionTrigger className="text-[13px] font-medium">
              Điều kiện ({draft.conditions.length})
            </AccordionTrigger>
            <AccordionContent>
              <ConditionsEdit
                conditions={draft.conditions}
                onChange={(conditions) => patch({ conditions })}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="actions">
            <AccordionTrigger className="text-[13px] font-medium">
              Hành động ({draft.actions.length})
            </AccordionTrigger>
            <AccordionContent>
              <ActionsEdit actions={draft.actions} onChange={(actions) => patch({ actions })} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="settings">
            <AccordionTrigger className="text-[13px] font-medium">Cài đặt</AccordionTrigger>
            <AccordionContent>
              <RuleSettings rule={draft} onChange={patch} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="advanced">
            <AccordionTrigger className="text-[13px] font-medium">Nâng cao</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-[11.5px] text-muted-foreground">
                <p>
                  Biến nội suy hỗ trợ: <code>{"{vendor.name}"}</code>,{" "}
                  <code>{"{amount}"}</code>, <code>{"{matched_invoice.number}"}</code>,{" "}
                  <code>{"{passenger.name}"}</code>.
                </p>
                <p>
                  Regex theo cú pháp JavaScript. Vd: <code>TT.?HD|thanh.?toan</code>.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="border-t bg-background px-5 py-3">
        <RuleTestPanel rule={draft} onTested={() => setHasTested(true)} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={trySave}
            disabled={!hasTested || saving}
            title={!hasTested ? "Chạy thử trước khi lưu" : ""}
          >
            {saving ? "Đang lưu..." : "Lưu quy tắc"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmHeavyOpen} onOpenChange={setConfirmHeavyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quy tắc đã chạy nhiều lần</AlertDialogTitle>
            <AlertDialogDescription>
              Quy tắc này đã áp dụng {rule.applied_count} lần. Sửa có thể ảnh hưởng tới
              các giao dịch tương lai. Bạn chắc chắn?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmHeavyOpen(false);
                doSave();
              }}
            >
              Vẫn lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>Sửa quy tắc</DrawerTitle>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[540px] flex-col p-0 sm:max-w-[540px]">
        <SheetHeader className="border-b px-5 py-3">
          <SheetTitle className="text-[15px]">Sửa quy tắc</SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
