import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import ResumeAdvicePanel from "../components/ResumeAdvicePanel";
import StatusBadge from "../components/StatusBadge";
import { candidateApi } from "../services/api";
import { formatPercent, formatScoreValue, screeningBandLabel } from "../utils/formatters";

function JourneyStep({ index, title, description, done, active }) {
  return (
    <article className={`step-card ${done ? "done" : ""} ${active ? "active" : ""}`}>
      <div className="step-index">{index}</div>
      <div className="stack-sm">
        <h4>{title}</h4>
        <p className="muted">{description}</p>
      </div>
      <span className={`status-badge ${done ? "success" : active ? "primary" : "secondary"}`}>
        {done ? "Done" : active ? "Current" : "Pending"}
      </span>
    </article>
  );
}

export default function CandidateDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [interviewDate, setInterviewDate] = useState("");

  const selectedJdId = data?.selected_jd_id || null;
  const availableJds = data?.available_jds || [];
  const selectedJd = useMemo(
    () => availableJds.find((jd) => jd.id === selectedJdId) || null,
    [availableJds, selectedJdId],
  );
  const result = data?.result || null;
  const explanation = result?.explanation || {};
  const resumeAdvice = data?.resume_advice || null;

  async function loadDashboard(jobId) {
    setLoading(true);
    setError("");
    try {
      const dashboard = await candidateApi.dashboard(jobId);
      setData(dashboard);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleUploadResume() {
    if (!resumeFile || !selectedJdId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await candidateApi.uploadResume(resumeFile, selectedJdId);
      setData(response);
      setResumeFile(null);
      setNotice(response.message || "Resume uploaded.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectJd(nextJdId) {
    if (!nextJdId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await candidateApi.selectJd({ jd_id: nextJdId });
      await loadDashboard(nextJdId);
      setNotice("JD selected.");
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleScheduleInterview() {
    if (!result?.id || !interviewDate) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await candidateApi.scheduleInterview({
        result_id: result.id,
        interview_date: interviewDate,
      });
      setNotice(response.message);
      await loadDashboard(selectedJdId);
    } catch (scheduleError) {
      setError(scheduleError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="center muted">Loading candidate dashboard...</p>;

  const hasSelectedJd = Boolean(selectedJdId);
  const hasResume = Boolean(data?.candidate?.resume_path);
  const hasResult = Boolean(result);
  const isShortlisted = Boolean(result?.shortlisted);
  const hasInterviewScheduled = Boolean(result?.interview_date);
  const scheduledInterviewPath = result?.id ? `/interview/${result.id}` : null;

  const steps = [
    {
      title: "Choose role",
      description: "Pick the JD you want to align your resume against.",
      done: hasSelectedJd,
    },
    {
      title: "Upload resume",
      description: "Store your latest resume locally and trigger scoring.",
      done: hasResume,
    },
    {
      title: "Review match",
      description: "Check score breakdown, skill gaps, and rewrite advice.",
      done: hasResult,
    },
    {
      title: "Schedule or practice",
      description: "Book the real interview or rehearse locally first.",
      done: hasInterviewScheduled || isShortlisted,
    },
  ];
  const activeStepIndex = steps.findIndex((item) => !item.done);

  return (
    <div className="stack">
      <PageHeader
        title="Candidate Workspace"
        subtitle="Local-first interview prep, scoring, and scheduling."
        actions={
          <>
            <button type="button" className="subtle-button" onClick={() => loadDashboard(selectedJdId)}>
              Refresh
            </button>
            {hasResume && hasSelectedJd ? (
              <Link to="/candidate/practice" className="button-link subtle-button">
                Practice Mode
              </Link>
            ) : null}
          </>
        }
      />

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      <section className="hero-card">
        <div className="stack-sm">
          <p className="eyebrow">Candidate profile</p>
          <h3>{data?.candidate?.name}</h3>
          <p className="muted">{data?.candidate?.email}</p>
        </div>
        <div className="hero-meta">
          <MetricCard label="Candidate ID" value={data?.candidate?.candidate_uid || "Pending"} hint="Generated locally" />
          <MetricCard label="Resume status" value={hasResume ? "Uploaded" : "Missing"} hint={data?.candidate?.resume_path || "Upload to unlock scoring"} />
          <MetricCard label="Current status" value={hasResult ? (isShortlisted ? "Shortlisted" : "Needs work") : "Not scored"} hint={selectedJd?.title || "No JD selected"} />
        </div>
      </section>

      <section className="step-grid">
        {steps.map((step, index) => (
          <JourneyStep
            key={step.title}
            index={index + 1}
            title={step.title}
            description={step.description}
            done={step.done}
            active={activeStepIndex === index}
          />
        ))}
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Step 1</p>
            <h3>Select JD</h3>
          </div>
          {selectedJd ? <StatusBadge status={{ tone: "primary", label: selectedJd.title }} /> : null}
        </div>
        {!availableJds.length && <p className="muted">No JDs available yet.</p>}
        {!!availableJds.length && (
          <div className="stack-sm">
            <select value={selectedJdId || ""} onChange={(event) => handleSelectJd(Number(event.target.value))}>
              <option value="">Select JD</option>
              {availableJds.map((jd) => (
                <option key={jd.id} value={jd.id}>
                  {jd.title}
                </option>
              ))}
            </select>
            {selectedJd ? (
              <div className="metric-grid compact">
                <MetricCard label="Shortlist cutoff" value={formatPercent(selectedJd.qualify_score)} />
                <MetricCard label="Min academic" value={formatPercent(selectedJd.min_academic_percent)} />
                <MetricCard label="Interview questions" value={String(selectedJd.total_questions || 8)} />
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Step 2</p>
            <h3>Upload Resume</h3>
          </div>
        </div>
        <div className="inline-row">
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
          />
          <button disabled={busy || !resumeFile || !selectedJdId} onClick={handleUploadResume}>
            {busy ? "Uploading..." : "Upload and score"}
          </button>
        </div>
        {!selectedJdId && <p className="muted">Select a JD first so the score is calculated against the correct role.</p>}
      </section>

      <section className="metric-grid">
        <MetricCard label="Resume score" value={result ? `${formatScoreValue(result.score)}%` : "0.00%"} hint="Current AI screening result" />
        <MetricCard label="Screening band" value={screeningBandLabel(explanation.screening_band)} hint="Strong shortlist, review, or reject" />
        <MetricCard label="Matched skills" value={String((explanation.matched_skills || []).length)} hint={(explanation.matched_skills || []).join(", ") || "No strong matches yet"} />
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Step 3</p>
            <h3>Review Match</h3>
          </div>
          {result ? (
            <StatusBadge status={{ tone: isShortlisted ? "success" : "danger", label: isShortlisted ? "Shortlisted" : "Rejected" }} />
          ) : null}
        </div>

        {!result && <p className="muted">Upload your resume to see the detailed score breakdown.</p>}
        {!!result && (
          <div className="stack">
            <div className="metric-grid compact">
              <MetricCard label="Weighted skills" value={formatPercent(explanation.weighted_skill_score)} />
              <MetricCard label="Semantic fit" value={formatPercent(explanation.semantic_score)} />
              <MetricCard label="Experience" value={formatPercent(explanation.experience_score)} />
              <MetricCard label="Education" value={formatPercent(explanation.education_score)} />
            </div>
            <div className="stack-sm">
              <p><strong>Matched skills:</strong> {(explanation.matched_skills || []).join(", ") || "None"}</p>
              <p><strong>Missing skills:</strong> {(explanation.missing_skills || []).join(", ") || "None"}</p>
              <p><strong>Why:</strong> {(explanation.reasons || []).join(" ") || "No notes available."}</p>
            </div>
          </div>
        )}
      </section>

      <ResumeAdvicePanel advice={resumeAdvice} />

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Step 4</p>
            <h3>Schedule or practice</h3>
          </div>
        </div>

        {!result && <p className="muted">Practice mode and scheduling become useful after a scored resume is available.</p>}
        {!!result && (
          <div className="stack">
            <div className="inline-row">
              <Link to="/candidate/practice" className="button-link subtle-button">
                Start local practice
              </Link>
              {result.interview_date && scheduledInterviewPath ? (
                <Link to={scheduledInterviewPath} className="button-link">
                  Open Interview
                </Link>
              ) : null}
            </div>

            {isShortlisted && !hasInterviewScheduled ? (
              <div className="stack-sm">
                <p className="muted">You are shortlisted. Pick your preferred interview slot.</p>
                <div className="inline-row">
                  <input
                    type="datetime-local"
                    value={interviewDate}
                    onChange={(event) => setInterviewDate(event.target.value)}
                  />
                  <button disabled={busy || !interviewDate} onClick={handleScheduleInterview}>
                    Confirm Interview
                  </button>
                </div>
              </div>
            ) : null}

            {hasInterviewScheduled ? (
              <p className="muted">
                Interview scheduled for <strong>{result.interview_date}</strong>. Open the interview only when you are ready to begin the real session.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
