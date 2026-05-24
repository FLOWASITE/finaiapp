export function GraphLegend() {
  return (
    <div className="rounded-md border bg-card/95 p-2.5 text-[10.5px] shadow-md backdrop-blur">
      <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground">
        Chú thích
      </div>
      <div className="space-y-1">
        <Row color="#4F46C7" label="Quy tắc" />
        <Row color="#0F6E56" label="Đối tác" />
        <Row color="#BA7517" label="Tài khoản" />
        <div className="my-1 border-t" />
        <Row color="#0F6E56" label="Auto" lineStyle="solid" />
        <Row color="#A3A3A3" label="Đề xuất" lineStyle="dashed" />
        <Row color="#DC2626" label="Đã tắt" lineStyle="dotted" />
        <Row color="#0EA5A4" label="Mặc định NCC" lineStyle="solid" />
        <Row color="#94A3B8" label="Phân loại HH" lineStyle="dashed" />
      </div>
    </div>
  );
}

function Row({
  color,
  label,
  lineStyle,
}: {
  color: string;
  label: string;
  lineStyle?: "solid" | "dashed" | "dotted";
}) {
  return (
    <div className="flex items-center gap-2">
      {lineStyle ? (
        <span
          className="inline-block h-0 w-6"
          style={{
            borderTop: `2px ${lineStyle} ${color}`,
          }}
        />
      ) : (
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
