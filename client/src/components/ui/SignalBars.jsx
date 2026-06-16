export function SignalBars({ score }) {
  const bars = score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : 1;
  const color = score >= 75 ? "#16a34a" : score >= 55 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 18 }}>
      {[1, 2, 3, 4].map((b) => (
        <div
          key={b}
          style={{
            width: 4,
            height: b * 4 + 2,
            borderRadius: 2,
            background: b <= bars ? color : "#e5e7eb",
          }}
        />
      ))}
    </div>
  );
}
