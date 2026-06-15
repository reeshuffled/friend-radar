export function Stars({ value, onChange, size = 18 }) {
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange && onChange(n)} style={{
          fontSize: size, background: "none", border: "none",
          cursor: onChange ? "pointer" : "default",
          color: n <= value ? "#f59e0b" : "#e5e7eb", padding: "0 1px", lineHeight: 1,
        }}>★</button>
      ))}
    </div>
  );
}
