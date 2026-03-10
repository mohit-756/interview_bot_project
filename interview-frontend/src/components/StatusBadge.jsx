export default function StatusBadge({ status, children }) {
  const tone = status?.tone || "secondary";
  const label = children || status?.label || "Unknown";
  return <span className={`status-badge ${tone}`}>{label}</span>;
}
