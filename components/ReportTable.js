"use client";

export default function ReportTable({ columns = [], rows = [] }) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "70vh",
          width: "100%",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 980,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "var(--card, #fff)",
            }}
          >
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    borderBottom: "1px solid rgba(128,128,128,.22)",
                    whiteSpace: "nowrap",
                    background: "inherit",
                    ...(col.style || {}),
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id ?? idx}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "12px 14px",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(128,128,128,.12)",
                    whiteSpace: "nowrap",
                    verticalAlign: "middle",
                    ...(col.style || {}),
                  }}
                >
                    {row[col.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  style={{
                    padding: "18px 14px",
                    fontSize: 14,
                    opacity: 0.7,
                  }}
                >
                  Nema podataka.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
