export function Pill({ text, bg, c }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: bg, color: c, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

const STATUS_COLORS = {
  "Close friend":  ["#f3e8ff", "#7c3aed"],
  "Friend":        ["#dbeafe", "#1d4ed8"],
  "Acquaintance":  ["#f3f4f6", "#6b7280"],
  "Prospect":      ["#fef3c7", "#d97706"],
};

export function StatusPill({ status }) {
  const [bg, c] = STATUS_COLORS[status] || STATUS_COLORS["Friend"];
  return <Pill text={status} bg={bg} c={c} />;
}
