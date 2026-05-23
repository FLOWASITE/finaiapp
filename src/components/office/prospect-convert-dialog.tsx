import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { convertProspect, listProspects } from "@/lib/office/prospects.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRightCircle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function ProspectConvertDialog({
  prospectId, prospectName,
}: { prospectId: string; prospectName: string }) {
  const [open, setOpen] = useState(false);
  const [tenantName, setTenantName] = useState(prospectName);
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fee, setFee] = useState(0);
  const [doInvite, setDoInvite] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const qc = useQueryClient();
  const convertFn = useServerFn(convertProspect);
  const listFn = useServerFn(listProspects);

  // Prefill from prospect on open
  const prospects = useQuery({
    queryKey: ["office", "prospects"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const p = (prospects.data ?? []).find((x: { id: string }) => x.id === prospectId) as
    | { name: string; tax_id: string | null; address: string | null; phone: string | null;
        email: string | null; estimated_fee: number | null } | undefined;
  if (p && tenantName === prospectName && !taxId && !address) {
    // one-shot prefill
    if (p.tax_id) setTaxId(p.tax_id);
    if (p.address) setAddress(p.address);
    if (p.phone) setPhone(p.phone);
    if (p.email) { setEmail(p.email); setInviteEmail(p.email); }
    if (p.estimated_fee) setFee(Number(p.estimated_fee));
  }

  const mut = useMutation({
    mutationFn: () =>
      convertFn({
        data: {
          prospect_id: prospectId,
          tenant_name: tenantName,
          tax_id: taxId || null,
          address: address || null,
          phone: phone || null,
          email: email || null,
          fee_per_month: Number(fee) || 0,
          display_name: tenantName,
          invite_contact_email: doInvite && inviteEmail ? inviteEmail : null,
        },
      }),
    onSuccess: (res: { invite_token: string | null }) => {
      toast.success("Đã tạo khách hàng FinAI");
      qc.invalidateQueries({ queryKey: ["office"] });
      if (res.invite_token) {
        const link = `${window.location.origin}/invite/${res.invite_token}`;
        setInviteLink(link);
      } else {
        setOpen(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const close = () => {
    setOpen(false);
    setInviteLink(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowRightCircle className="h-4 w-4 mr-1" />Chuyển KH
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo khách hàng FinAI từ "{prospectName}"</DialogTitle>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-3">
            <p className="text-sm">
              Đã tạo tenant FinAI và lời mời đăng nhập. Gửi link sau cho khách:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} className="text-xs" />
              <Button size="icon" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Link hiệu lực 7 ngày. Khách hàng đăng ký bằng email <b>{inviteEmail}</b> và
              chấp nhận lời mời để truy cập FinAI.
            </p>
            <DialogFooter>
              <Button onClick={close}>Đóng</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Hệ thống sẽ tạo 1 tenant FinAI mới cho khách. Văn phòng được gán làm quản lý.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Tên khách hàng *</Label>
                <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
              </div>
              <div>
                <Label>MST</Label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
              <div>
                <Label>Điện thoại</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Địa chỉ</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Email contact</Label>
                <Input type="email" value={email} onChange={(e) => {
                  setEmail(e.target.value); setInviteEmail(e.target.value);
                }} />
              </div>
              <div>
                <Label>Phí dịch vụ / tháng</Label>
                <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
              </div>
            </div>

            <div className="mt-2 space-y-2 border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={doInvite} onCheckedChange={(v) => setDoInvite(!!v)} />
                Gửi lời mời đăng nhập FinAI cho contact
              </label>
              {doInvite && (
                <div>
                  <Label className="text-xs">Email nhận lời mời</Label>
                  <Input type="email" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="contact@khachhang.vn" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close}>Huỷ</Button>
              <Button onClick={() => mut.mutate()}
                disabled={!tenantName.trim() || mut.isPending
                  || (doInvite && !inviteEmail.trim())}>
                {mut.isPending ? "Đang tạo..." : "Tạo khách hàng"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
