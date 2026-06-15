const DEFAULT_LABELS = ["Never", "Rarely", "Sometimes", "Usually", "Always"];

export function RangeSlider({ label, sub, value, onChange, labels = DEFAULT_LABELS }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 7 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {labels.map((lbl, i) => {
          const n = i + 1;
          const active = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                padding: "5px 2px",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                color: active ? "#fff" : "#6b7280",
                background: active ? "#4f46e5" : "#f3f4f6",
                border: active ? "1.5px solid #4f46e5" : "1.5px solid #e5e7eb",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}
