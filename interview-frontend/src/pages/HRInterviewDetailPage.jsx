import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

function scoreOrEmpty(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function HRInterviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState("selected");
  const [notes, setNotes] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [behavioralScore, setBehavioralScore] = useState("");
  const [communicationScore, setCommunicationScore] = useState("");
  const [redFlags, setRedFlags] = useState("");

  function hydrateReview(hrReview) {
    if (!hrReview) return;
    setNotes(hrReview.notes || "");
    setFinalScore(scoreOrEmpty(hrReview.final_score));
    setBehavioralScore(scoreOrEmpty(hrReview.behavioral_score));
    setCommunicationScore(scoreOrEmpty(hrReview.communication_score));
    setRedFlags(hrReview.red_flags || "");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await hrApi.interviewDetail(id);
      setData(response);
      hydrateReview(response.hr_review);
      if (response?.interview?.status === "rejected") {
        setDecision("rejected");
      } else if (response?.interview?.status === "selected") {
        setDecision("selected");
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleFinalize() {
    setSaving(true);
    setError("");
    try {
      await hrApi.finalizeInterview(id, {
        decision,
        notes,
        final_score: finalScore ? Number(finalScore) : null,
        behavioral_score: behavioralScore ? Number(behavioralScore) : null,
        communication_score: communicationScore ? Number(communicationScore) : null,
        red_flags: redFlags.trim() || null,
      });
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const suspiciousEvents = useMemo(
    () => (data?.events || []).filter((event) => event.suspicious),
    [data?.events],
  );
  const avgAnswerScore = useMemo(() => {
    const scores = (data?.questions || [])
      .map((question) => Number(question.ai_answer_score))
      .filter((value) => !Number.isNaN(value));
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }, [data?.questions]);

  if (loading) return <p className="center muted">Loading interview...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data?.interview) return <p className="muted">Not found.</p>;

  const { interview, questions, events, hr_review: hrReview } = data;

  return (
    <div className="stack">
      <PageHeader
        title={`Interview ${interview.application_id || interview.interview_id}`}
        subtitle={`Candidate ${interview.candidate?.name} for ${interview.job?.title || "selected role"}`}
        actions={
          <button type="button" className="subtle-button" onClick={() => navigate(-1)}>
            Back
          </button>
        }
      />

      {error && <p className="alert error">{error}</p>}

      <section className="metric-grid">
        <MetricCard label="Status" value={interview.status} hint="Current interview outcome" />
        <MetricCard label="Started" value={formatDateTime(interview.started_at)} hint={`Ended ${formatDateTime(interview.ended_at)}`} />
        <MetricCard label="Avg AI answer score" value={avgAnswerScore === null ? "N/A" : formatPercent(avgAnswerScore)} hint="Across all answered questions" />
        <MetricCard label="Suspicious events" value={String(suspiciousEvents.length)} hint="Requires HR judgment" />
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Final review</p>
            <h3>HR decision panel</h3>
          </div>
        </div>

        <p className="muted">
          Current scores: Final {hrReview?.final_score ?? "N/A"} | Behavioral {hrReview?.behavioral_score ?? "N/A"} | Communication {hrReview?.communication_score ?? "N/A"}
        </p>

        <div className="section-grid">
          <select value={decision} onChange={(event) => setDecision(event.target.value)}>
            <option value="selected">Selected</option>
            <option value="rejected">Rejected</option>
          </select>
          <input type="number" min={0} max={100} placeholder="Final score (0-100)" value={finalScore} onChange={(event) => setFinalScore(event.target.value)} />
          <input type="number" min={0} max={100} placeholder="Behavioral score" value={behavioralScore} onChange={(event) => setBehavioralScore(event.target.value)} />
          <input type="number" min={0} max={100} placeholder="Communication score" value={communicationScore} onChange={(event) => setCommunicationScore(event.target.value)} />
        </div>

        <textarea rows={2} placeholder="Red flags / suspicious behavior remarks" value={redFlags} onChange={(event) => setRedFlags(event.target.value)} />
        <textarea rows={4} placeholder="Final interview notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <button type="button" disabled={saving} onClick={handleFinalize}>
          {saving ? "Saving..." : "Save decision"}
        </button>
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Questions</p>
            <h3>Answer review</h3>
          </div>
        </div>

        {!questions?.length && <p className="muted">No questions.</p>}
        {!!questions?.length && (
          <div className="stack-sm">
            {questions.map((question, index) => (
              <article key={question.id} className="question-preview-card">
                <div className="inline-row">
                  <span className="skill-pill subtle">Question {index + 1}</span>
                  <span className="skill-pill">{question.skipped ? "Skipped" : "Answered"}</span>
                  <span className="muted">
                    {question.time_taken_seconds ?? "N/A"}s / {question.allotted_seconds ?? "N/A"}s
                  </span>
                </div>
                <strong>{question.text}</strong>
                <p><em>Answer:</em> {question.answer_text || "(skipped)"}</p>
                <p className="muted">Summary: {question.answer_summary || "-"}</p>
                <div className="metric-grid compact">
                  <MetricCard label="AI score" value={formatPercent(question.ai_answer_score)} />
                  <MetricCard label="Relevance" value={formatPercent(question.score_breakdown?.relevance)} />
                  <MetricCard label="Completeness" value={formatPercent(question.score_breakdown?.completeness)} />
                  <MetricCard label="Clarity" value={formatPercent(question.score_breakdown?.clarity)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Proctoring</p>
            <h3>Event timeline</h3>
          </div>
        </div>

        {!events?.length && <p className="muted">No proctoring events.</p>}
        {!!events?.length && (
          <div className="stack-sm">
            {events.map((event) => (
              <article key={event.id} className={`event-row ${event.suspicious ? "flagged" : ""}`}>
                <div className="inline-row">
                  <strong>{event.event_type}</strong>
                  <span className="muted">{formatDateTime(event.created_at)}</span>
                  <span className="muted">score {event.score ?? 0}</span>
                  <span className="muted">faces {event.meta_json?.faces_count ?? "N/A"}</span>
                  {(event.image_url || event.snapshot_path) ? (
                    <a href={event.image_url || `/${event.snapshot_path}`} target="_blank" rel="noreferrer">
                      Snapshot
                    </a>
                  ) : null}
                </div>
                {event.meta_json?.frame_reasons?.length ? (
                  <p className="muted">{event.meta_json.frame_reasons.join(" ")}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
