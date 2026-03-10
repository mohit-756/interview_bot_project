import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import ResumeAdvicePanel from "../components/ResumeAdvicePanel";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

export default function HRCandidateDetailPage() {
  const { candidateUid } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await hrApi.candidateDetail(candidateUid);
      setData(response);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [candidateUid]);

  async function handleDelete() {
    if (!candidateUid) return;
    setDeleting(true);
    setError("");
    try {
      const response = await hrApi.deleteCandidate(candidateUid);
      setNotice(response.message || "Candidate deleted");
      navigate("/hr/candidates", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  async function handleGenerateQuestions() {
    if (!data?.candidate?.id) return;
    setGeneratingQuestions(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.generateCandidateQuestions(data.candidate.id);
      setNotice(`Generated ${response.total_questions} questions for practice and interview preparation.`);
      await load();
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setGeneratingQuestions(false);
    }
  }

  if (loading) return <p className="center muted">Loading candidate details...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data?.candidate) return <p className="muted">Candidate not found.</p>;

  const candidate = data.candidate;
  const applications = data.applications || [];
  const skillGap = data.skill_gap || null;
  const matchedSkills = skillGap?.matched_skills || [];
  const missingSkills = skillGap?.missing_skills || [];

  return (
    <div className="stack">
      <PageHeader
        title="Candidate Detail"
        subtitle="Review application history, skill gap, question bank, and resume advice."
        actions={
          <>
            <Link to="/hr/candidates" className="button-link subtle-button">
              Back to Candidate Manager
            </Link>
            <button type="button" className="subtle-button" disabled={generatingQuestions} onClick={handleGenerateQuestions}>
              {generatingQuestions ? "Generating..." : "Generate Questions"}
            </button>
            <button type="button" className="danger-button" onClick={() => setShowDeleteModal(true)}>
              Delete Candidate
            </button>
          </>
        }
      />

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      <section className="metric-grid">
        <MetricCard label="Candidate ID" value={candidate.candidate_uid || "Pending"} hint="Local profile identifier" />
        <MetricCard label="Current score" value={formatPercent(candidate.current_score)} hint="Latest visible application score" />
        <MetricCard label="Applications" value={String(applications.length)} hint="Across this HR workspace" />
        <MetricCard label="Created at" value={formatDateTime(candidate.created_at)} hint={candidate.email} />
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Profile</p>
            <h3>{candidate.name}</h3>
          </div>
          <StatusBadge status={candidate.current_status} />
        </div>
        <p><strong>Email:</strong> {candidate.email}</p>
        <p><strong>Resume path:</strong> {candidate.resume_path || "Not uploaded"}</p>
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Applications</p>
            <h3>Application history</h3>
          </div>
        </div>

        {!applications.length && <p className="muted">No applications found.</p>}
        {!!applications.length && (
          <table className="table">
            <thead>
              <tr>
                <th>Application ID</th>
                <th>Job</th>
                <th>Status</th>
                <th>Score</th>
                <th>Interview</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.result_id}>
                  <td>{application.application_id || "N/A"}</td>
                  <td>{application.job?.title || "Unknown role"}</td>
                  <td><StatusBadge status={application.status} /></td>
                  <td>{formatPercent(application.score)}</td>
                  <td>
                    {application.latest_session?.id ? (
                      <Link to={`/hr/interviews/${application.latest_session.id}`} className="button-link subtle-button">
                        Open review
                      </Link>
                    ) : (
                      <span className="muted">{application.interview_date || "Not scheduled"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Skill gap</p>
            <h3>Current fit overview</h3>
          </div>
        </div>

        {!skillGap && <p className="muted">No job-linked skill gap is available for this candidate yet.</p>}
        {!!skillGap && (
          <>
            <p className="muted">
              Comparing resume against {skillGap.job_title} (Job #{skillGap.job_id}) with match rate {formatPercent(skillGap.match_percentage)}.
            </p>
            <div className="inline-row">
              {matchedSkills.map((skill) => (
                <span key={`matched-${skill}`} className="skill-pill success">
                  {skill}
                </span>
              ))}
              {missingSkills.map((skill) => (
                <span key={`missing-${skill}`} className="skill-pill danger">
                  {skill}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <ResumeAdvicePanel advice={data.resume_advice} title="Resume improvement guidance" />

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Generated bank</p>
            <h3>Interview question preview</h3>
          </div>
        </div>

        {!data.generated_questions?.length && (
          <p className="muted">No generated questions stored yet. Use "Generate Questions" to build a JD-specific bank.</p>
        )}
        {!!data.generated_questions?.length && (
          <>
            <p className="muted">
              {data.generated_questions_meta?.total_questions || data.generated_questions.length} questions generated for {data.generated_questions_meta?.jd_title || "this candidate"}.
            </p>
            <div className="stack-sm">
              {data.generated_questions.map((question) => (
                <article key={`${question.index}-${question.text}`} className="question-preview-card">
                  <div className="inline-row">
                    <span className="skill-pill subtle">#{question.index}</span>
                    <span className="skill-pill">{question.type}</span>
                    <span className="skill-pill subtle">{question.topic}</span>
                    <span className="skill-pill subtle">{question.difficulty}</span>
                  </div>
                  <p>{question.text}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {applications[0]?.explanation?.reasons?.length ? (
        <section className="card stack-sm">
          <div className="title-row">
            <div>
              <p className="eyebrow">Screening notes</p>
              <h3>Latest AI rationale</h3>
            </div>
          </div>
          <p className="muted">{applications[0].explanation.reasons.join(" ")}</p>
        </section>
      ) : null}

      {showDeleteModal && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-candidate-detail-title">
            <h3 id="delete-candidate-detail-title">Delete Candidate</h3>
            <p className="muted">
              Delete {candidate.name} ({candidate.candidate_uid}) and all related interview records?
            </p>
            <div className="inline-row">
              <button type="button" className="danger-button" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button type="button" className="subtle-button" disabled={deleting} onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
