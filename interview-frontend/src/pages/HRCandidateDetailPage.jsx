import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Mail, Calendar, Sparkles, Save } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";

function downloadHref(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

export default function HRCandidateDetailPage() {
  const { candidateUid } = useParams();
  const [data, setData] = useState(null);
  const [availableJds, setAvailableJds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const loadCandidate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, jds] = await Promise.all([hrApi.candidateDetail(candidateUid), hrApi.listJds()]);
      const safeJds = Array.isArray(jds)
        ? jds
        : Array.isArray(jds?.jobs)
          ? jds.jobs
          : Array.isArray(jds?.jds)
            ? jds.jds
            : [];
      setData(response);
      setAvailableJds(safeJds);
      setNotes(response?.candidate?.hrNotes || response?.applications?.[0]?.hrNotes || "");
    } catch (loadError) {
      setError(loadError.message || "Failed to load candidate details.");
    } finally {
      setLoading(false);
    }
  }, [candidateUid]);

  useEffect(() => { loadCandidate(); }, [loadCandidate]);

  const candidate = data?.candidate || null;
  const latestApplication = data?.applications?.[0] || null;
  const parsedResume = candidate?.parsedResume || {};
  const stageHistory = latestApplication?.stage_history || [];
  const interviewSummary = latestApplication?.latest_session?.evaluation_summary || {};
  const scoreBreakdown = latestApplication?.score_breakdown || {};
  const assignedJdLabel = candidate?.assignedJd?.title || latestApplication?.job?.title || "Not assigned yet";
  const summaryItems = useMemo(() => [
    { label: "Assigned JD", value: assignedJdLabel },
    { label: "Current stage", value: candidate?.currentStage?.label || "Unknown" },
    { label: "Match %", value: `${Math.round(Number(candidate?.matchPercent || 0))}%` },
    { label: "Final score", value: `${Math.round(Number(candidate?.finalAIScore || 0))}%` },
    { label: "Recommendation", value: candidate?.recommendationTag || "N/A" },
  ], [assignedJdLabel, candidate]);

  async function handleStageUpdate(resultId, stage) {
    if (!resultId || !stage) return;
    try {
      await hrApi.updateCandidateStage(resultId, { stage, note: `Updated from detail page to ${stage}.` });
      await loadCandidate();
    } catch (updateError) {
      setError(updateError.message || "Failed to update stage.");
    }
  }

  async function handleAssignJd(jdId) {
    if (!jdId) return;
    try {
      await hrApi.assignCandidateToJd(candidateUid, Number(jdId));
      await loadCandidate();
    } catch (assignError) {
      setError(assignError.message || "Failed to assign candidate to JD.");
    }
  }

  async function handleSaveNotes() {
    if (!latestApplication?.result_id) return;
    setSavingNotes(true);
    setError("");
    try {
      await hrApi.updateCandidateNotes(latestApplication.result_id, notes);
      await loadCandidate();
    } catch (saveError) {
      setError(saveError.message || "Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) return <p className="center muted">Loading candidate detail...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!candidate) return <p className="muted">Candidate not found.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link to="/hr/candidates" className="flex items-center space-x-2 text-slate-500 hover:text-blue-600 transition-colors font-medium"><ArrowLeft size={20} /><span>Back to Candidates</span></Link>
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/hr/compare" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Compare Candidates</Link>
          {candidate?.resume_path ? <a href={downloadHref(candidate.resume_path)} target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center space-x-2"><Download size={20} /><span>Open Resume</span></a> : null}
        </div>
      </div>

      {error ? <p className="alert error">{error}</p> : null}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700" />
        <div className="px-8 pb-8">
          <div className="relative flex flex-col md:flex-row md:items-end -mt-12 md:space-x-8">
            <div className="w-32 h-32 rounded-3xl border-4 border-white dark:border-slate-900 overflow-hidden shadow-lg bg-slate-100 flex items-center justify-center">
              <img src={candidate?.avatar} alt={candidate?.name || "Candidate"} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 mt-6 md:mt-0 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center space-x-3 flex-wrap"><h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">{candidate?.name || "Candidate"}</h1><StatusBadge status={candidate?.currentStage} /><StatusBadge status={candidate?.finalDecision} /></div>
                <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">{candidate?.role || "Role not available"} | {candidate?.candidate_uid || candidateUid}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-medium"><Mail size={16} className="mr-2" />{candidate?.email || "No email"}</div>
                <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-medium"><Calendar size={16} className="mr-2" />{candidate?.created_at ? new Date(candidate.created_at).toLocaleDateString() : "Unknown date"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {summaryItems.map((item) => <div key={item.label} className="card"><p className="eyebrow">{item.label}</p><h3>{item.value}</h3></div>)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Candidate summary</p><h3>ATS review snapshot</h3></div></div>
            <div className="candidate-summary-grid">
              <div className="question-preview-card"><strong>Assigned JD</strong><p className="muted mt-2">{assignedJdLabel}</p></div>
              <div className="question-preview-card"><strong>Current stage</strong><p className="muted mt-2">{candidate?.currentStage?.label || "Unknown"}</p></div>
              <div className="question-preview-card"><strong>Recommendation</strong><p className="muted mt-2">{candidate?.recommendationTag || "No recommendation yet"}</p></div>
              <div className="question-preview-card"><strong>Candidate summary</strong><p className="muted mt-2">{parsedResume?.summary || candidate?.resume_text || "No candidate summary available."}</p></div>
            </div>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">ATS score breakdown</p><h3>Why this candidate is ranked this way</h3></div></div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="question-preview-card"><strong>Resume / JD Match:</strong> {Math.round(Number(scoreBreakdown?.resume_jd_match_score || candidate?.resumeScore || 0))}%</div>
              <div className="question-preview-card"><strong>Skills Match:</strong> {Math.round(Number(scoreBreakdown?.skills_match_score || candidate?.skillMatchScore || 0))}%</div>
              <div className="question-preview-card"><strong>Interview Score:</strong> {Math.round(Number(scoreBreakdown?.interview_performance_score || candidate?.interviewScore || 0))}%</div>
              <div className="question-preview-card"><strong>Communication:</strong> {Math.round(Number(scoreBreakdown?.communication_behavior_score || candidate?.communicationScore || 0))}%</div>
            </div>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Parsed resume</p><h3>Structured profile</h3></div></div>
            <div className="grid md:grid-cols-2 gap-6">
              <div><strong>Summary</strong><p className="muted mt-2">{parsedResume?.summary || "No summary extracted."}</p></div>
              <div><strong>Skills</strong><div className="mt-2 flex flex-wrap gap-2">{safeList(parsedResume?.skills).length ? safeList(parsedResume.skills).map((skill) => <span key={skill} className="skill-pill">{skill}</span>) : <span className="muted">No skills extracted.</span>}</div></div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div><strong>Education</strong>{safeList(parsedResume?.education).length ? safeList(parsedResume.education).map((item) => <div key={item} className="question-preview-card mt-2">{item}</div>) : <p className="muted mt-2">No education extracted.</p>}</div>
              <div><strong>Certifications</strong>{safeList(parsedResume?.certifications).length ? safeList(parsedResume.certifications).map((item) => <div key={item} className="question-preview-card mt-2">{item}</div>) : <p className="muted mt-2">No certifications extracted.</p>}</div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div><strong>Projects</strong>{safeList(parsedResume?.projects).length ? safeList(parsedResume.projects).map((item) => <div key={item} className="question-preview-card mt-2">{item}</div>) : <p className="muted mt-2">No projects extracted.</p>}</div>
              <div><strong>Experience</strong>{safeList(parsedResume?.experience).length ? safeList(parsedResume.experience).map((item) => <div key={item} className="question-preview-card mt-2">{item}</div>) : <p className="muted mt-2">No experience extracted.</p>}</div>
            </div>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Interview summary</p><h3>Latest interview snapshot</h3></div>{latestApplication?.latest_session?.id ? <Link to={`/hr/interviews/${latestApplication.latest_session.id}`} className="button-link subtle-button">Open Interview Review</Link> : null}</div>
            {latestApplication?.latest_session ? <><div className="grid md:grid-cols-3 gap-4"><div className="question-preview-card"><strong>Interview score:</strong> {Math.round(Number(interviewSummary?.overall_interview_score || 0))}%</div><div className="question-preview-card"><strong>Communication:</strong> {Math.round(Number(interviewSummary?.communication_score || 0))}%</div><div className="question-preview-card"><strong>Recommendation:</strong> {interviewSummary?.hiring_recommendation || "N/A"}</div></div><p><strong>Strengths:</strong> {safeList(interviewSummary?.strengths_summary).join(" ") || "No interview data yet."}</p><p><strong>Weaknesses:</strong> {safeList(interviewSummary?.weaknesses_summary).join(" ") || "No interview data yet."}</p></> : <p className="muted">No interview data yet.</p>}
          </div>
        </div>

        <div className="space-y-8">
          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">HR workflow</p><h3>Stage and JD controls</h3></div></div>
            <StatusBadge status={candidate?.currentStage} />
            {latestApplication?.result_id ? <select value="" onChange={(e) => e.target.value && handleStageUpdate(latestApplication.result_id, e.target.value)}><option value="">Move stage</option><option value="screening">Screening</option><option value="shortlisted">Shortlisted</option><option value="interview_scheduled">Interview Scheduled</option><option value="interview_completed">Interview Completed</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select> : null}
            <select value="" onChange={(e) => e.target.value && handleAssignJd(e.target.value)}>
              <option value="">Assign to JD</option>
              {availableJds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
            </select>
            <p className="muted text-sm">Current assigned JD: {assignedJdLabel}</p>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">HR notes</p><h3>Private recruiter notes</h3></div></div>
            <textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add hiring notes, follow-up points, or internal comments..." />
            <button type="button" onClick={handleSaveNotes} disabled={savingNotes || !latestApplication?.result_id} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60"><Save size={16} />{savingNotes ? "Saving..." : "Save Notes"}</button>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Stage history</p><h3>Timeline</h3></div></div>
            {safeList(stageHistory).length ? safeList(stageHistory).map((item) => <div key={item.id} className="timeline-item"><div className="timeline-dot" /><div className="timeline-content"><div className="flex items-center justify-between gap-2 flex-wrap"><StatusBadge status={item.stage} /><span className="muted text-sm">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span></div><p className="muted mt-2">{item.note || "No note"}</p></div></div>) : <p className="muted">No stage history available yet.</p>}
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Advice</p><h3>Recommendation summary</h3></div><Sparkles className="text-blue-600" size={18} /></div>
            {safeList(data?.resume_advice?.next_steps).length ? safeList(data.resume_advice.next_steps).map((item) => <div key={item} className="question-preview-card">{item}</div>) : <p className="muted">No recommendation summary available.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
