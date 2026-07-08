'use client';

// Bảng hiển thị records từ Lark Base.
// Lark Base field values có thể là string, number, array (multi-select),
// object (link/attachment), boolean — cần render an toàn.

interface LarkRecord {
  record_id: string;
  fields: { [key: string]: unknown };
}

interface Props {
  columns: string[];
  records: LarkRecord[];
  total?: number;
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: unknown }).text);
        return JSON.stringify(v);
      })
      .join(', ');
  }
  if (typeof value === 'object') {
    // Lark link/person fields thường có key "text" hoặc "name"
    const obj = value as Record<string, unknown>;
    if ('text' in obj) return String(obj.text);
    if ('name' in obj) return String(obj.name);
    if ('value' in obj) return String(obj.value);
    return JSON.stringify(value);
  }
  return String(value);
}

export function LarkBaseTable({ columns, records }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-zinc-50/60">
              <th className="px-3 py-2.5 text-left font-medium text-zinc-500 w-8">#</th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-left font-medium text-zinc-700 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {records.map((row, i) => (
              <tr key={row.record_id} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-2 text-zinc-700 max-w-[240px] truncate"
                    title={renderCell(row.fields[col])}
                  >
                    {renderCell(row.fields[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
