function AdviceList({ title, items, renderItem }) {
  if (!items?.length) return null;
  return (
    <section className="advice-group">
      <h4>{title}</h4>
      <div className="stack-sm">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="advice-item">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ResumeAdvicePanel({ advice, title = "Resume Improvement Plan" }) {
  if (!advice) return null;

  return (
    <section className="card stack">
      <div className="title-row">
        <h3>{title}</h3>
      </div>

      <AdviceList
        title="Current strengths"
        items={advice.strengths || []}
        renderItem={(item) => <span className="skill-pill success">{item}</span>}
      />

      <AdviceList
        title="Priority gaps"
        items={advice.priority_gaps || []}
        renderItem={(item) => (
          <div className="stack-sm">
            <strong>{item.skill}</strong>
            <p className="muted">{item.reason}</p>
          </div>
        )}
      />

      <AdviceList
        title="Rewrite tips"
        items={advice.rewrite_tips || []}
        renderItem={(item) => <p className="muted">{item}</p>}
      />

      <AdviceList
        title="Project framing"
        items={advice.project_tips || []}
        renderItem={(item) => (
          <div className="stack-sm">
            <strong>{item.title}</strong>
            <p className="muted">{item.tip}</p>
          </div>
        )}
      />

      <AdviceList
        title="Next steps"
        items={advice.next_steps || []}
        renderItem={(item) => <p className="muted">{item}</p>}
      />
    </section>
  );
}
