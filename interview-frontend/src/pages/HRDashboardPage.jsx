import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

function normalizeSkillWeights(skillMap) {
  const next = {};
  Object.entries(skillMap || {}).forEach(([key, value]) => {
    if (!key) return;
    next[key] = Number(value || 0);
  });
  return next;
}

function AnalyticsSection({ analytics }) {
  const overview = analytics?.overview || {};
  const pipeline = analytics?.pipeline || [];

  return (
    <>
      <section className="metric-grid">
        <MetricCard label="Active candidates" value={String(overview.active_candidates || 0)} hint="Unique candidates in this workspace" />
        <MetricCard label="Applications" value={String(overview.total_applications || 0)} hint="Across selected JD scope" />
        <MetricCard label="Avg resume score" value={formatPercent(overview.avg_resume_score)} hint="Current screening average" />
        <MetricCard label="Shortlist rate" value={formatPercent(overview.shortlist_rate)} hint="How many applications pass cutoff" />
      </section>

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h3>Candidate movement</h3>
          </div>
        </div>
        <div className="pipeline-grid">
          {pipeline.map((item) => (
            <article key={item.key} className="pipeline-card">
              <StatusBadge status={item} />
              <strong>{item.count}</strong>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function SkillInsightSection({ title, items, emptyText }) {
  return (
    <section className="card stack">
      <div className="title-row">
        <div>
          <p className="eyebrow">Signals</p>
          <h3>{title}</h3>
        </div>
      </div>
      {!items?.length && <p className="muted">{emptyText}</p>}
      {!!items?.length && (
        <div className="stack-sm">
          {items.map((item) => (
            <div key={item.skill} className="split-row">
              <span className="skill-pill">{item.skill}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function JDUploadSection({
  busy,
  cutoffScore,
  educationRequirement,
  experienceRequirement,
  extractedSkills,
  jdFile,
  jdQuestionCount,
  jdTitle,
  onChangeCutoff,
  onChangeEducation,
  onChangeExperience,
  onChangeFile,
  onChangeQuestionCount,
  onChangeTitle,
  onConfirm,
  onExtractedSkillChange,
  onUpload,
}) {
  return (
    <section className="card stack">
      <div className="title-row">
        <div>
          <p className="eyebrow">JD setup</p>
          <h3>Upload new role</h3>
        </div>
      </div>

      <div className="section-grid">
        <input type="text" placeholder="JD title" value={jdTitle} onChange={(event) => onChangeTitle(event.target.value)} />
        <input type="file" onChange={(event) => onChangeFile(event.target.files?.[0] || null)} />
        <select value={educationRequirement} onChange={(event) => onChangeEducation(event.target.value)}>
          <option value="">Education: None</option>
          <option value="bachelor">Bachelor's</option>
          <option value="master">Master's</option>
          <option value="phd">PhD</option>
        </select>
        <input type="number" placeholder="Experience years" value={experienceRequirement} onChange={(event) => onChangeExperience(event.target.value)} />
        <input type="number" min="0" max="100" placeholder="Shortlist cutoff %" value={cutoffScore} onChange={(event) => onChangeCutoff(event.target.value)} />
        <input type="number" min="3" max="20" placeholder="Question count" value={jdQuestionCount} onChange={(event) => onChangeQuestionCount(event.target.value)} />
      </div>

      <div className="inline-row">
        <button disabled={busy || !jdFile} onClick={onUpload}>
          {busy ? "Uploading..." : "Upload JD"}
        </button>
      </div>

      {!!extractedSkills && (
        <div className="stack">
          <h4>Review extracted skills</h4>
          {Object.entries(extractedSkills).map(([skill, score]) => (
            <div className="inline-row" key={skill}>
              <input value={skill} readOnly />
              <input type="number" value={score} onChange={(event) => onExtractedSkillChange(skill, event.target.value)} />
            </div>
          ))}
          <button disabled={busy} onClick={onConfirm}>
            Confirm JD
          </button>
        </div>
      )}
    </section>
  );
}

function JDConfigSection({
  busy,
  questionCountDraft,
  cutoffDraft,
  selectedJob,
  skillDraft,
  onQuestionCountChange,
  onCutoffChange,
  onSkillChange,
  onSave,
}) {
  if (!selectedJob) return null;

  return (
    <section className="card stack">
      <div className="title-row">
        <div>
          <p className="eyebrow">JD tuning</p>
          <h3>{selectedJob.jd_title || "Selected JD"}</h3>
        </div>
      </div>

      <div className="metric-grid compact">
        <MetricCard label="Cutoff score" value={formatPercent(cutoffDraft)} hint="Current shortlist threshold" />
        <MetricCard label="Question count" value={String(questionCountDraft || 8)} hint="Interview runtime target" />
        <MetricCard label="Experience requirement" value={String(selectedJob.experience_requirement || 0)} hint="Years expected" />
      </div>

      <div className="inline-row">
        <input type="number" min="0" max="100" value={cutoffDraft} onChange={(event) => onCutoffChange(event.target.value)} placeholder="Shortlist cutoff %" />
        <input type="number" min="3" max="20" value={questionCountDraft} onChange={(event) => onQuestionCountChange(event.target.value)} placeholder="Question count" />
      </div>

      <div className="stack-sm">
        {Object.entries(skillDraft).map(([skill, score]) => (
          <div className="inline-row" key={skill}>
            <input value={skill} readOnly />
            <input type="number" value={score} onChange={(event) => onSkillChange(skill, event.target.value)} />
          </div>
        ))}
      </div>

      <button disabled={busy} onClick={onSave}>
        Save JD settings
      </button>
    </section>
  );
}

function ShortlistedCandidatesSection({ busy, candidates, technicalScores, onScoreChange, onScoreSubmit }) {
  return (
    <section className="card stack">
      <div className="title-row">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h3>Shortlisted candidates</h3>
        </div>
        <Link to="/hr/interviews" className="button-link subtle-button">
          Open interview reviews
        </Link>
      </div>

      {!candidates?.length && <p className="muted">No shortlisted candidates yet.</p>}
      {!!candidates?.length && (
        <table className="table">
          <thead>
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Score</th>
              <th>Interview score</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((item) => {
              const result = item.result || {};
              const interviewScoring = result.explanation?.interview_scoring || null;
              return (
                <tr key={result.id}>
                  <td>{item.candidate?.candidate_uid || "Pending"}</td>
                  <td>
                    <div className="stack-sm">
                      <strong>{item.candidate?.name}</strong>
                      <span className="muted">{item.candidate?.email}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{formatPercent(result.score)}</td>
                  <td>
                    <div className="stack-sm">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Technical score"
                        value={technicalScores[result.id] || ""}
                        onChange={(event) => onScoreChange(result.id, event.target.value)}
                      />
                      <button disabled={busy} onClick={() => onScoreSubmit(result.id)}>
                        Save interview score
                      </button>
                      {interviewScoring ? (
                        <span className="muted">
                          Final {formatPercent(interviewScoring.final_score)} ({interviewScoring.recommendation})
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>{formatDateTime(item.candidate?.created_at)}</td>
                  <td>
                    <Link to={`/hr/candidates/${item.candidate?.candidate_uid}`} className="button-link subtle-button">
                      View detail
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function HRDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const [jdFile, setJdFile] = useState(null);
  const [jdTitle, setJdTitle] = useState("");
  const [educationRequirement, setEducationRequirement] = useState("");
  const [experienceRequirement, setExperienceRequirement] = useState("");
  const [jdCutoffScore, setJdCutoffScore] = useState("65");
  const [jdQuestionCount, setJdQuestionCount] = useState("8");
  const [extractedSkills, setExtractedSkills] = useState(null);
  const [skillDraft, setSkillDraft] = useState({});
  const [cutoffDraft, setCutoffDraft] = useState("65");
  const [questionCountDraft, setQuestionCountDraft] = useState("8");
  const [technicalScores, setTechnicalScores] = useState({});

  const selectedJobId = data?.selected_job_id || null;
  const selectedJob = useMemo(
    () => (data?.jobs || []).find((job) => job.id === selectedJobId) || null,
    [data?.jobs, selectedJobId],
  );

  async function loadDashboard(jobId) {
    setLoading(true);
    setError("");
    try {
      const dashboard = await hrApi.dashboard(jobId);
      setData(dashboard);
      setSkillDraft(normalizeSkillWeights(dashboard?.latest_jd?.skill_scores || {}));
      setCutoffDraft(String(dashboard?.latest_jd?.cutoff_score ?? 65));
      setQuestionCountDraft(String(dashboard?.latest_jd?.question_count ?? 8));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleUploadJd() {
    if (!jdFile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.uploadJd({
        file: jdFile,
        jdTitle,
        educationRequirement,
        experienceRequirement,
        cutoffScore: Number(jdCutoffScore || 65),
        questionCount: Number(jdQuestionCount || 8),
      });
      setExtractedSkills(normalizeSkillWeights(response.ai_skills || {}));
      setNotice("JD uploaded. Review extracted skills and confirm.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmJd() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.confirmJd(extractedSkills || {});
      setNotice(response.message || "JD confirmed.");
      setExtractedSkills(null);
      setJdFile(null);
      setJdTitle("");
      await loadDashboard(response.job_id);
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSkillWeights() {
    if (!selectedJob?.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.updateSkillWeights(skillDraft, selectedJob.id, {
        cutoffScore: Number(cutoffDraft || 65),
        questionCount: Number(questionCountDraft || 8),
      });
      setNotice(response.message || "Skill weights updated.");
      await loadDashboard(selectedJob.id);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleInterviewScoreSubmit(resultId) {
    const value = Number(technicalScores[resultId] || 0);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.submitInterviewScore(resultId, value);
      setNotice(`Interview score saved. Final ${formatPercent(response.final_score)} (${response.recommendation})`);
      await loadDashboard(selectedJobId);
    } catch (scoreError) {
      setError(scoreError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBackupDownload() {
    setDownloadingBackup(true);
    setError("");
    try {
      await hrApi.downloadLocalBackup();
      setNotice("Local backup downloaded.");
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDownloadingBackup(false);
    }
  }

  if (loading) return <p className="center muted">Loading HR dashboard...</p>;

  return (
    <div className="stack">
      <PageHeader
        title="HR Control Center"
        subtitle="Manage local JDs, candidate pipeline, interview scoring, and backup/export."
        actions={
          <>
            <Link to="/hr/candidates" className="button-link subtle-button">
              Candidate Manager
            </Link>
            <Link to="/hr/interviews" className="button-link subtle-button">
              Interview Reviews
            </Link>
            <button type="button" className="subtle-button" disabled={downloadingBackup} onClick={handleBackupDownload}>
              {downloadingBackup ? "Preparing backup..." : "Download Local Backup"}
            </button>
            <button type="button" onClick={() => loadDashboard(selectedJobId)}>
              Refresh
            </button>
          </>
        }
      />

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">JD focus</p>
            <h3>Workspace scope</h3>
          </div>
        </div>
        {!!data?.jobs?.length && (
          <div className="stack-sm">
            <label htmlFor="jd-selector">View JD</label>
            <select id="jd-selector" value={selectedJobId || ""} onChange={(event) => loadDashboard(Number(event.target.value))}>
              {data.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.jd_title || job.jd_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!data?.jobs?.length && <p className="muted">Upload a JD to begin screening and interview management.</p>}
      </section>

      <AnalyticsSection analytics={data?.analytics} />

      <div className="two-column-grid">
        <SkillInsightSection
          title="Most missed skills"
          items={data?.analytics?.top_missing_skills}
          emptyText="Missing skill trends will appear after more resume evaluations."
        />
        <SkillInsightSection
          title="Most matched skills"
          items={data?.analytics?.top_matched_skills}
          emptyText="Matched skill trends will appear after more resume evaluations."
        />
      </div>

      <JDUploadSection
        busy={busy}
        cutoffScore={jdCutoffScore}
        educationRequirement={educationRequirement}
        experienceRequirement={experienceRequirement}
        extractedSkills={extractedSkills}
        jdFile={jdFile}
        jdQuestionCount={jdQuestionCount}
        jdTitle={jdTitle}
        onChangeCutoff={setJdCutoffScore}
        onChangeEducation={setEducationRequirement}
        onChangeExperience={setExperienceRequirement}
        onChangeFile={setJdFile}
        onChangeQuestionCount={setJdQuestionCount}
        onChangeTitle={setJdTitle}
        onConfirm={handleConfirmJd}
        onExtractedSkillChange={(skill, value) =>
          setExtractedSkills((prev) => ({
            ...prev,
            [skill]: Number(value || 0),
          }))
        }
        onUpload={handleUploadJd}
      />

      <JDConfigSection
        busy={busy}
        questionCountDraft={questionCountDraft}
        cutoffDraft={cutoffDraft}
        selectedJob={selectedJob}
        skillDraft={skillDraft}
        onQuestionCountChange={setQuestionCountDraft}
        onCutoffChange={setCutoffDraft}
        onSkillChange={(skill, value) =>
          setSkillDraft((prev) => ({
            ...prev,
            [skill]: Number(value || 0),
          }))
        }
        onSave={handleUpdateSkillWeights}
      />

      <ShortlistedCandidatesSection
        busy={busy}
        candidates={data?.shortlisted_candidates || []}
        technicalScores={technicalScores}
        onScoreChange={(resultId, value) =>
          setTechnicalScores((prev) => ({
            ...prev,
            [resultId]: value,
          }))
        }
        onScoreSubmit={handleInterviewScoreSubmit}
      />
    </div>
  );
}
