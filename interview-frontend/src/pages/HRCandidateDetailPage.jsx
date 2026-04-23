import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Mail, Calendar, Sparkles, Save, Briefcase } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import { hrApi } from "../services/api";
import { ATS_STAGE_OPTIONS } from "../utils/stages";
import { formatInterviewDateTimeLocal } from "../utils/formatters";

function downloadHref(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const filename = path.split(/[/\\]/).pop();
  return `/uploads/${filename}`;
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function isRawResumeText(text) {
  if (!text || typeof text !== "string") return false;
  const rawPatterns = ["PROFILE SUMMARY", "ybssowaktunya@gmail.com", "linkedin.com/in/"];
  return rawPatterns.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
}

function hasValidSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return false;
  return !skills.some((s) => {
    const str = String(s).toLowerCase();
    return str.includes("profile summary") || str.includes("ybssowuasai") || str.includes("linkedin");
  });
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

  const allApplications = data?.applications || [];
  const hasMultipleApplications = allApplications.length > 1;

  if (loading) return <p className="center muted">Loading candidate detail...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!candidate) return <p className="muted">Candidate not found.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link to="/hr/candidates" className="flex items-center space-x-2 text-slate-500 hover:text-blue-600 transition-colors font-medium"><ArrowLeft size={20} /><span>Back to Candidates</span></Link>
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/hr/compare" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Compare Candidates</Link>
          {candidate?.resume_path ? <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log("Resume path:", candidate?.resume_path); console.log("URL:", downloadHref(candidate.resume_path)); window.open(downloadHref(candidate.resume_path), "_blank"); }} type="button" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center space-x-2"><Download size={20} /><span>Open Resume</span></button> : null}
        </div>
      </div>

      {error ? <p className="alert error">{error}</p> : null}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700" />
        <div className="px-8 pb-8">
          <div className="relative flex flex-col md:flex-row md:items-end -mt-12 md:space-x-8">
            <div className="w-32 h-32 rounded-3xl border-4 border-white dark:border-slate-900 overflow-hidden shadow-lg bg-slate-100 flex items-center justify-center">
              <img src={candidate?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${candidate?.name || 'user'}`} alt={candidate?.name || "Candidate"} className="w-full h-full object-cover" />
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

      {hasMultipleApplications && (
        <div className="card stack">
          <div className="title-row">
            <div>
              <p className="eyebrow">All Applications</p>
              <h3 className="flex items-center gap-2"><Briefcase size={16} />{candidate.name} has applied to {allApplications.length} positions</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">JD</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Resume Score</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Final Score</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Stage</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">HR Decision</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Interview Date</th>
                  <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {allApplications.map((app) => (
                  <tr key={app.result_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-all">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{app.job?.title || "Unknown JD"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={app.resumeScore ?? app.score ?? 0} />
                      <p className="text-[11px] text-slate-500 mt-1">{Math.round(Number(app.resumeScore ?? app.score ?? 0))}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={app.finalAIScore ?? app.final_score ?? 0} />
                      <p className="text-[11px] text-slate-500 mt-1">{Math.round(Number(app.finalAIScore ?? app.final_score ?? 0))}%</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-3">
                      {app.hr_decision ? (
                        <StatusBadge status={{ key: app.hr_decision, label: app.hr_decision.charAt(0).toUpperCase() + app.hr_decision.slice(1), tone: app.hr_decision === "selected" ? "success" : "danger" }} />
                      ) : (
                        <span className="text-xs text-slate-400">Not decided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatInterviewDateTimeLocal(app, "—")}
                    </td>
                    <td className="px-4 py-3">
                      {app.latest_session?.id ? (
                        <Link to={`/hr/interviews/${app.latest_session.id}`} className="text-xs text-blue-600 hover:underline">Review Interview</Link>
                      ) : (
                        <span className="text-xs text-slate-400">No interview yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Interview summary</p><h3>Latest interview snapshot</h3></div>{latestApplication?.latest_session?.id ? <Link to={`/hr/interviews/${latestApplication.latest_session.id}`} className="button-link subtle-button">Open Interview Review</Link> : null}</div>
            {latestApplication?.latest_session ? <>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="question-preview-card"><strong>Technical score:</strong> {Math.round(Number(interviewSummary?.overall_interview_score || 0))}%</div>
                <div className="question-preview-card"><strong>Communication:</strong> {Math.round(Number(interviewSummary?.communication_score || 0))}%</div>
                <div className="question-preview-card"><strong>Recommendation:</strong> {interviewSummary?.hiring_recommendation || "N/A"}</div>
                <div className="question-preview-card"><strong>Session status:</strong> {latestApplication?.latest_session?.status || "N/A"}</div>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="question-preview-card"><p className="eyebrow">Strengths</p><p className="muted">{safeList(interviewSummary?.strengths_summary).join(" ") || "No interview data yet."}</p></div>
                <div className="question-preview-card"><p className="eyebrow">Weaknesses</p><p className="muted">{safeList(interviewSummary?.weaknesses_summary).join(" ") || "No interview data yet."}</p></div>
                <div className="question-preview-card"><p className="eyebrow">Improvement suggestions</p><p className="muted">{safeList(data?.resume_advice?.next_steps).join(" ") || "No improvement suggestions available yet."}</p></div>
              </div>
            </> : <p className="muted">No interview data yet.</p>}
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
            <div className="title-row"><div><p className="eyebrow">Advice</p><h3>Recommendation summary</h3></div><Sparkles className="text-blue-600" size={18} /></div>
            {safeList(data?.resume_advice?.next_steps).length ? safeList(data.resume_advice.next_steps).map((item) => <div key={item} className="question-preview-card">{item}</div>) : <p className="muted">No recommendation summary available.</p>}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">HR notes</p><h3>Private recruiter notes</h3></div></div>
            <textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add hiring notes, follow-up points, or internal comments..." className="w-full" />
            <button type="button" onClick={handleSaveNotes} disabled={savingNotes || !latestApplication?.result_id} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all disabled:opacity-60 w-full"><Save size={16} />{savingNotes ? "Saving..." : "Save Notes"}</button>
          </div>

          <div className="card stack">
            <div className="title-row"><div><p className="eyebrow">Stage history</p><h3>Timeline</h3></div></div>
            <div className="space-y-3">
              {safeList(stageHistory).length ? safeList(stageHistory).map((item, index) => <div key={item.id || `${item.stage}-${index}`} className="timeline-item"><div className="timeline-dot" /><div className="timeline-content"><div className="flex items-center justify-between gap-2 flex-wrap"><StatusBadge status={item.stage} /><span className="muted text-xs">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</span></div><p className="muted text-xs mt-1">{item.note || "Stage updated"}</p></div></div>) : <p className="muted">No stage history available yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
