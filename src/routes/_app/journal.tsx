import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/journal")({
  component: Journal,
});

function Journal() {
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith("#entry-")) {
      const id = h.slice("#entry-".length);
      setHighlight(id);
      setTimeout(() => document.getElementById(h.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, []);
  const { data: entries } = useQuery({
    queryKey: ["journal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, journal_lines(account_code, debit, credit, line_order)")
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const exportCsv = () => {
    const rows: string[] = ["Ngày,Diễn giải,TK,Nợ,Có"];
    (entries ?? []).forEach((e) => {
      e.journal_lines
        ?.sort((a, b) => a.line_order - b.line_order)
        .forEach((l) => {
          rows.push(`${e.entry_date},"${e.description ?? ""}",${l.account_code},${l.debit},${l.credit}`);
        });
    });
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `so-nhat-ky-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sổ nhật ký chung</h1>
          <p className="text-sm text-muted-foreground">Toàn bộ bút toán đã được duyệt</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Xuất CSV
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {(entries ?? []).map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <div className="font-medium">{e.description}</div>
                <div className="text-xs text-muted-foreground">{e.entry_date}</div>
              </div>
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {e.journal_lines
                  ?.sort((a, b) => a.line_order - b.line_order)
                  .map((l, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 font-mono">{l.account_code}</td>
                      <td className="py-2 text-right font-mono">
                        {Number(l.debit) > 0 ? Number(l.debit).toLocaleString("vi-VN") : ""}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {Number(l.credit) > 0 ? Number(l.credit).toLocaleString("vi-VN") : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
        {(entries ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            Chưa có bút toán. Duyệt hóa đơn để ghi vào sổ.
          </div>
        )}
      </div>
    </div>
  );
}
