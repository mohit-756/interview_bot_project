export default function MetricCard({ label, value, hint, tone = "default" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <p className="metric-label">{label}</p>
      <h3 className="metric-value">{value}</h3>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </article>
  );
}
