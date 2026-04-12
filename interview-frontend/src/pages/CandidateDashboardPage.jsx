import { useEffect, useMemo, useState } from "react";
import { Upload, CheckCircle2, AlertCircle, ArrowRight, FileSearch, Clock, Calendar, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import StepChecklist from "../components/StepChecklist";
import { candidateApi } from "../services/api";

function routeFromInterviewLink(interviewLink) {
  if (!interviewLink) return "";
  try {
    const url = new URL(interviewLink);
    let path = url.pathname;
    if (url.hash && url.hash.startsWith("#/")) {
      path = url.hash.replace(/^#/, "");
    }
    console.log("[ROUTE] interviewLink:", interviewLink, "-> route:", path);
    return path;
  } catch (e) {
    console.log("[ROUTE] Error:", e.message);
    return interviewLink;
  }
}

function SkillMatchTable({ explanation, selectedJd }) {
  const weights = selectedJd?.weights_json || {};
  const matchedSet = new Set((explanation?.matched_skills || []).map((s) => s.toLowerCase()));
  const allSkills = Object.keys(weights).length > 0
    ? Object.entries(weights).map(([skill, weight]) => ({ skill, weight: Number(weight), found: matchedSet.has(skill.toLowerCase()) }))
    : [ ...(explanation?.matched_skills || []).map((s) => ({ skill: s, weight: "—", found: true })), ...(explanation?.missing_skills || []).map((s) => ({ skill: s, weight: "—", found: false })) ];
  if (!allSkills.length) return null;
  const overallScore = Math.round(Number(explanation?.final_resume_score || explanation?.weighted_skill_score || 0));
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"><table className="w-full text-sm border-collapse"><thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Skill</th><th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">JD Weight</th><th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Found in Resume</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{allSkills.map(({ skill, weight, found }) => <tr key={skill} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"><td className="px-4 py-3 font-medium text-slate-900 dark:text-white capitalize">{skill}</td><td className="px-4 py-3 text-center">{weight !== "—" ? <span className="inline-block w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">{weight}</span> : <span className="text-slate-400">—</span>}</td><td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">{found ? "Yes" : "No"}</td></tr>)}</tbody><tfoot><tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700"><td className="px-4 py-3 font-bold text-slate-900 dark:text-white" colSpan={2}>Overall Score</td><td className="px-4 py-3 text-center font-black text-lg text-blue-600 dark:text-blue-400">{overallScore} / 100</td></tr></tfoot></table></div>
  );
}

export default function CandidateDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [message, setMessage] = useState("");

  const selectedJd = useMemo(() => (dashboard?.available_jds || []).find((jd) => jd.id === dashboard?.selected_jd_id) || null, [dashboard]);
  const result = dashboard?.result || null;
  const explanation = result?.explanation || {};
  const resumeAdvice = dashboard?.resume_advice || null;
  const interviewRoute = routeFromInterviewLink(result?.interview_link);
  const interviewReady = Boolean(result?.interview_ready && interviewRoute);
  const interviewCompleted = Boolean(result?.interview_completed || result?.stage?.key === "interview_completed");
  const finalDecision = result?.final_decision || null;
  const canScheduleInterview = Boolean(result?.shortlisted) && !interviewCompleted && !finalDecision;
  const showStartInterview = interviewReady && !interviewCompleted && !finalDecision;
  const interviewSessionStatus = String(result?.interview_session_status || "").toLowerCase();
  const parsedResume = dashboard?.candidate?.parsed_resume || {};
  const scoreBreakdown = result?.score_breakdown || {};

  async function loadDashboard(jobId) {
    setLoading(true); setError("");
    try {
      const response = await candidateApi.dashboard(jobId);
      setDashboard(response);
      setMessage("");
      if (response?.result?.interview_date) setScheduleDate(String(response.result.interview_date).slice(0, 16));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadDashboard(); }, []);

  async function handleSelectJd(e) {
    const jdId = Number(e.target.value);
    try { await candidateApi.selectJd(jdId); await loadDashboard(jdId); }
    catch (e) { setError(e.message); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    console.log("[UPLOAD] File selected:", file?.name, "selected_jd_id:", dashboard?.selected_jd_id);
    if (!file || !dashboard?.selected_jd_id) {
      console.log("[UPLOAD] Aborting - no file or no JD selected");
      return;
    }
    setUploading(true); setError(""); setMessage("");
    try {
      console.log("[UPLOAD] Calling API...");
      const response = await candidateApi.uploadResume(file, dashboard.selected_jd_id);
      console.log("[UPLOAD] Response received:", response);
      setDashboard(response);
      setMessage("Resume uploaded and scored successfully.");
    } catch (e) { 
      console.error("[UPLOAD] Error:", e.message);
      setError(e.message); 
    }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function handleScheduleInterview() {
    if (!result?.id || !scheduleDate) { setError("Pick a date first."); return; }
    setScheduling(true); setError(""); setMessage("");
    try {
      const response = await candidateApi.scheduleInterview(result.id, scheduleDate);
      setDashboard((c) => c ? { ...c, result: response.result } : c);
      setMessage(response.message || "Interview scheduled.");
    } catch (e) { setError(e.message); }
    finally { setScheduling(false); }
  }

  const steps = [
    { title: "JD selected", description: selectedJd ? selectedJd.title : "Select a role to apply", completed: Boolean(selectedJd) },
    { title: "Resume uploaded", description: dashboard?.candidate?.resume_path ? "Resume stored" : "Upload your resume", completed: Boolean(dashboard?.candidate?.resume_path) },
    { title: "AI screening", description: result ? `${Math.round(Number((result?.final_score ?? result?.score) || 0))}% ATS score` : "Pending", completed: Boolean(result) },
    { title: "Interview stage", description: interviewCompleted ? "Interview submitted" : interviewReady ? "Ready to start" : canScheduleInterview ? "Schedule interview" : "Pending", completed: Boolean(interviewReady || interviewCompleted || finalDecision) },
  ];

  if (loading) return <p className="center muted">Loading workspace...</p>;
  if (error && !dashboard) return <p className="alert error">{error}</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 page-enter">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Workspace</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track your ATS stage, score breakdown, recommendation, and interview progress.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => loadDashboard(dashboard?.selected_jd_id)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center space-x-2"><RefreshCw size={16} /><span>Refresh</span></button>
          {showStartInterview && <Link to={interviewRoute} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30 flex items-center space-x-2"><span>{interviewSessionStatus === "in_progress" ? "Resume Interview" : "Start Interview"}</span><ArrowRight size={18} /></Link>}
        </div>
      </div>

      {error && <p className="alert error">{error}</p>}
      {message && <p className="alert success">{message}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 page-enter-delay-1">
        <div className="card card-hover-lift status-border-left blue">
          <p className="eyebrow">Current stage</p>
          <div className="mt-2">{result?.stage ? <StatusBadge status={result.stage} /> : <StatusBadge status="applied" />}</div>
          <p className="muted mt-3">Your application pipeline status</p>
        </div>
        <div className="card card-hover-lift status-border-left green">
          <p className="eyebrow">Final score</p>
          <h3>{Math.round(Number((result?.final_score ?? result?.score) || 0))}%</h3>
          <div className="score-bar mt-3">
            <div className={`score-bar-fill ${Math.round(Number((result?.final_score ?? result?.score) || 0)) >= 80 ? "green" : Math.round(Number((result?.final_score ?? result?.score) || 0)) >= 65 ? "blue" : "red"}`} style={{ width: `${Math.min(Math.round(Number((result?.final_score ?? result?.score) || 0)), 100)}%` }} />
          </div>
          <p className="muted mt-2">Weighted ATS score</p>
        </div>
        <div className="card card-hover-lift status-border-left purple">
          <p className="eyebrow">Recommendation</p>
          <h3>{result?.recommendation || "Pending"}</h3>
          <p className="muted">Current ATS recommendation</p>
        </div>
        <div className="card card-hover-lift status-border-left yellow">
          <p className="eyebrow">Interview status</p>
          <h3>{interviewCompleted ? "Completed" : showStartInterview ? "Ready" : canScheduleInterview ? "Schedule" : "Pending"}</h3>
          <p className="muted">Next interview step</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 page-enter-delay-2">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900 dark:text-white">Apply for Role</h2><p className="text-slate-500 dark:text-slate-400 mt-1">Select a JD then upload your resume.</p></div><select id="selected_jd_id" name="selected_jd_id" value={dashboard?.selected_jd_id || ""} onChange={handleSelectJd} className="w-full md:w-80 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"><option value="" disabled>Select a JD</option>{(dashboard?.available_jds || []).map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}</select></div>
            <div className="p-8"><label className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-10 transition-all cursor-pointer group ${uploading ? "border-blue-400 bg-blue-50/30" : dashboard?.selected_jd_id ? "border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/30" : "border-slate-200 dark:border-slate-800 opacity-60"}`}><input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading || !dashboard?.selected_jd_id} />{uploading ? <div className="text-center"><Clock size={32} className="text-blue-600 animate-spin mx-auto mb-3" /><h4 className="text-lg font-bold text-slate-900 dark:text-white">Uploading and scoring...</h4></div> : <div className="text-center"><Upload size={32} className="text-slate-400 group-hover:text-blue-600 mx-auto mb-3 transition-colors" /><h4 className="text-lg font-bold text-slate-900 dark:text-white">{dashboard?.selected_jd_id ? "Click to upload resume" : "Select a JD first"}</h4><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">PDF, DOCX, or TXT</p></div>}</label></div>
          </div>

          {result && <div className="space-y-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><div className="flex items-center justify-between mb-6 flex-wrap gap-3"><h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center"><FileSearch className="text-blue-600 mr-3" size={24} />Resume vs JD — Skill Match</h3><div className="flex items-center gap-2 flex-wrap"><StatusBadge status={result.stage} /><StatusBadge status={result.shortlisted ? "Shortlisted" : "Rejected"} className="text-sm px-4 py-1.5" /></div></div><SkillMatchTable explanation={explanation} selectedJd={selectedJd} />{Array.isArray(explanation?.reasons) && explanation.reasons.length > 0 && <div className="mt-6 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"><h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Why this score</h4><ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">{explanation.reasons.map((r) => <li key={r} className="flex items-start"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 mr-3 flex-shrink-0" />{r}</li>)}</ul></div>}</div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center"><Sparkles className="text-blue-600 mr-2" size={18} />ATS Score Breakdown</h4><div className="space-y-4 text-sm">{[["Resume / JD Match", scoreBreakdown.resume_jd_match_score], ["Skills Match", scoreBreakdown.skills_match_score], ["Interview Score", scoreBreakdown.interview_performance_score], ["Communication", scoreBreakdown.communication_behavior_score]].map(([label, val]) => {const pct = Math.round(Number(val || 0)); return (<div key={label}><div className="flex items-center justify-between mb-1.5"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="font-bold text-slate-900 dark:text-white">{pct}%</span></div><div className="score-bar"><div className={`score-bar-fill ${pct >= 80 ? "green" : pct >= 65 ? "blue" : pct >= 40 ? "yellow" : "red"}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div></div>);})}</div></div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center"><CheckCircle2 className="text-emerald-500 mr-2" size={18} />Parsed Resume Snapshot</h4><p className="text-sm text-slate-600 dark:text-slate-300"><strong>Summary:</strong> {parsedResume.summary || "No summary extracted."}</p><div className="mt-4 flex flex-wrap gap-2">{(parsedResume.skills || []).length ? parsedResume.skills.map((item) => <span key={item} className="skill-pill">{item}</span>) : <span className="muted">No skills extracted.</span>}</div></div>
            </div>

            {resumeAdvice && <div className="grid md:grid-cols-2 gap-6"><div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center"><CheckCircle2 className="text-emerald-500 mr-2" size={18} />Strengths</h4><ul className="space-y-3">{(resumeAdvice.strengths || []).map((item) => <li key={item} className="flex items-start text-sm text-slate-600 dark:text-slate-300"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 mr-3 flex-shrink-0" />{item}</li>)}{!resumeAdvice.strengths?.length && <li className="text-sm text-slate-500">Upload resume to see advice.</li>}</ul></div><div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><h4 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center"><AlertCircle className="text-amber-500 mr-2" size={18} />Rewrite Tips</h4><ul className="space-y-3">{(resumeAdvice.rewrite_tips || []).map((item) => <li key={item} className="flex items-start text-sm text-slate-600 dark:text-slate-300"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 mr-3 flex-shrink-0" />{item}</li>)}</ul></div></div>}

            {result.shortlisted && !interviewCompleted && !finalDecision && <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-3xl text-white"><h3 className="text-xl font-bold font-display mb-2">Schedule Your Interview</h3><p className="text-blue-100 mb-6">Pick a date and time to unlock your interview link.</p><div className="flex flex-col sm:flex-row gap-3"><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 w-4 h-4" /><input id="interview_date" name="interview_date" type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} disabled={scheduling} className="pl-10 pr-4 py-3 rounded-2xl text-slate-900 bg-white outline-none min-w-[250px]" /></div><button onClick={handleScheduleInterview} disabled={scheduling} className="px-8 py-3 rounded-2xl bg-white text-blue-600 font-black hover:scale-[1.01] transition-all shadow-xl disabled:opacity-60">{scheduling ? "Scheduling..." : result.interview_date ? "Reschedule" : "Schedule Interview"}</button></div>{result.interview_date && <p className="mt-4 text-sm text-blue-100">Scheduled for: <span className="font-bold">{new Date(result.interview_date).toLocaleString()}</span></p>}</div>}
          </div>}
        </div>

        <div className="space-y-6 page-enter-delay-3">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift"><h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6">Application Progress</h4><StepChecklist steps={steps} /></div>
          {selectedJd && <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift"><h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Selected JD</h4><p className="text-lg font-bold text-slate-900 dark:text-white">{selectedJd.title}</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Cutoff {selectedJd.qualify_score}% · {selectedJd.total_questions} questions</p></div>}
          {result && <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift"><h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Next Step Guidance</h4><div className="space-y-3 text-sm text-slate-600 dark:text-slate-300"><div className="question-preview-card">Current stage: {result.stage?.label || "Applied"}</div><div className="question-preview-card">Recommendation: {result.recommendation || "Pending"}</div><div className="question-preview-card">{showStartInterview ? "Your interview is ready to start." : canScheduleInterview ? "Schedule your interview to continue." : interviewCompleted ? "Interview completed — wait for HR review." : "Upload and improve your resume to move ahead."}</div></div></div>}
        </div>
      </div>
    </div>
  );
}
