import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listChartOfAccounts, getActiveCoaCircular, type CoaRow } from "@/lib/coa.functions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, BookOpenCheck, Settings as SettingsIcon } from "lucide-react";
import { CatalogVersionBanner } from "@/components/catalogs/catalog-version-banner";

export const Route = createFileRoute("/_app/coa/")({ component: CoaPage });

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Tài sản",
  LIABILITY: "Nợ phải trả",
  EQUITY: "Vốn chủ sở hữu",
  REVENUE: "Doanh thu",
  EXPENSE: "Chi phí",
  RESULT: "Kết quả KD",
  OTHER: "Khác",
};

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ASSET: "default",
  LIABILITY: "destructive",
  EQUITY: "secondary",
  REVENUE: "default",
  EXPENSE: "outline",
  RESULT: "secondary",
  OTHER: "outline",
};

function CoaPage() {
  const fn = useServerFn(listChartOfAccounts);
  const circFn = useServerFn(getActiveCoaCircular);
  const { data = [], isLoading } = useQuery<CoaRow[]>({
    queryKey: ["coa"],
    queryFn: () => fn(),
    ...QUERY_PRESETS.REFERENCE,
  });
  const { data: circ } = useQuery({
    queryKey: ["coa-circular"],
    queryFn: () => circFn(),
    ...QUERY_PRESETS.REFERENCE,
  });
  const effective = circ?.effective ?? "TT99";
  const circularLabel = effective === "TT133"
    ? "Thông tư 133/2016/TT-BTC"
    : "Thông tư 99/2025/TT-BTC";
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<string>("ALL");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const { tree, total, activeTotal } = React.useMemo(() => {
    const filtered = data.filter((a) => {
      const matchQ =
        !q ||
        a.code.toLowerCase().includes(q.toLowerCase()) ||
        a.name.toLowerCase().includes(q.toLowerCase());
      const matchT = type === "ALL" || a.type === type;
      return matchQ && matchT;
    });
    const parents = filtered.filter((a) => !a.parent_code);
    const children = filtered.filter((a) => a.parent_code);
    // when searching, also include parents of matched children
    if (q || type !== "ALL") {
      const parentCodes = new Set(children.map((c) => c.parent_code!));
      data
        .filter((a) => parentCodes.has(a.code) && !parents.find((p) => p.code === a.code))
        .forEach((p) => parents.push(p));
    }
    const grouped = parents
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((p) => ({
        parent: p,
        children: children
          .filter((c) => c.parent_code === p.code)
          .sort((a, b) => a.code.localeCompare(b.code)),
      }));
    return {
      tree: grouped,
      total: data.length,
      activeTotal: data.filter((a) => a.used).length,
    };
  }, [data, q, type]);

  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const isOpen = (code: string) => expanded.has(code) || !!q || type !== "ALL";

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            Hệ thống tài khoản kế toán
          </h1>
          <p className="text-sm text-muted-foreground">
            Danh mục TK theo {circularLabel} — {total} tài khoản
            {effective === "TT99" && <> · {activeTotal} đang sử dụng</>}
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span>Đang hiển thị theo chế độ kế toán của tổ chức.</span>
            <Link to="/settings" className="inline-flex items-center gap-1 text-primary hover:underline">
              <SettingsIcon className="h-3 w-3" /> Đổi chế độ
            </Link>
          </p>
        </div>
      </div>

      <CatalogVersionBanner catalog="coa" label="Hệ thống tài khoản" />

      <Card>
        <CardHeader className="flex flex-row gap-2 items-end flex-wrap pb-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Tìm theo mã hoặc tên tài khoản…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả loại</SelectItem>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Đang tải…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Mã</TableHead>
                  <TableHead>Tên tài khoản</TableHead>
                  <TableHead className="w-[140px]">Loại</TableHead>
                  <TableHead className="w-[100px] text-right">Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tree.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Không có tài khoản phù hợp
                    </TableCell>
                  </TableRow>
                )}
                {tree.map(({ parent, children }) => (
                  <React.Fragment key={parent.code}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => children.length && toggle(parent.code)}
                    >
                      <TableCell className="font-mono font-semibold">
                        <div className="flex items-center gap-1">
                          {children.length > 0 ? (
                            isOpen(parent.code) ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )
                          ) : (
                            <span className="w-3.5" />
                          )}
                          {parent.code}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{parent.name}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANT[parent.type] ?? "outline"}>
                          {TYPE_LABEL[parent.type] ?? parent.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {parent.used && (
                          <Badge variant="secondary" className="text-[10px]">Đang dùng</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen(parent.code) &&
                      children.map((c) => (
                        <TableRow key={c.code} className="bg-muted/20">
                          <TableCell className="font-mono pl-10 text-muted-foreground">
                            {c.code}
                          </TableCell>
                          <TableCell className="text-sm">{c.name}</TableCell>
                          <TableCell />
                          <TableCell className="text-right">
                            {c.used && (
                              <Badge variant="secondary" className="text-[10px]">Đang dùng</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
