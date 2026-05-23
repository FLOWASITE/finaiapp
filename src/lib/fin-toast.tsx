import { toast, type ExternalToast } from "sonner";
import { FinMascot } from "@/components/fin-mascot";

const icon = <FinMascot size="xs" mood="happy" />;

export const finToast = {
  success: (msg: string, opts?: ExternalToast) =>
    toast.success(msg, { icon, duration: 4000, ...opts }),
  info: (msg: string, opts?: ExternalToast) =>
    toast(msg, { icon: <FinMascot size="xs" mood="idle" />, ...opts }),
};
