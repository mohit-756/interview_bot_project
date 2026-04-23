import { useEffect, useMemo, useState, useId } from "react";
import { Upload, CheckCircle2, AlertCircle, ArrowRight, FileSearch, Clock, Calendar, RefreshCw, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import StepChecklist from "../components/StepChecklist";
import { candidateApi } from "../services/api";
import HelpSupportButton from "../components/HelpSupportButton";
import { useAnnounce } from "../hooks/useAccessibility";
import {
  formatInterviewDateTimeLocal,
  getGoogleCalendarDateRange,
  resolveInterviewDateTime,
  toDateTimeLocalInputValue,
} from "../utils/formatters";

function CollapseSection({ title, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const buttonId = useId();
  const contentId = useId();

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        id={buttonId}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="font-bold text-slate-900 dark:text-white">{title}</span>
        <span aria-hidden="true">
          {isOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
        </span>
      </button>
      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!isOpen}
        className="p-4"
      >
        {children}
      </div>
    </div>
  );
}

function routeFromInterviewLink(interviewLink) {
  if (!interviewLink) return "";
  try {
    const url = new URL(interviewLink);
    let path = url.pathname;
    if (url.hash && url.hash.startsWith("#/")) {
      path = url.hash.replace(/^#/, "");
    }
    if (url.search) {
      path = `${path}${url.search}`;
    }
    return path;
  } catch (e) {
    return interviewLink;
  }
}

function SkillMatchTable({ explanation, selectedJd }) {
  const weights = selectedJd?.weights_json || {};
  const matchedSet = new Set((explanation?.matched_skills || []).map((s) => s.toLowerCase()));
  const allSkills = Object.keys(weights).length > 0
    ? Object.entries(weights).map(([skill, weight]) => ({ skill, weight: Number(weight), found: matchedSet.has(skill.toLowerCase()) }))
    : [...(explanation?.matched_skills || []).map((s) => ({ skill: s, weight: "—", found: true })), ...(explanation?.missing_skills || []).map((s) => ({ skill: s, weight: "—", found: false }))];
  if (!allSkills.length) return null;
  const overallScore = Math.round(Number(explanation?.final_resume_score || explanation?.weighted_skill_score || 0));

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm border-collapse" aria-label="Skill match comparison">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Skill</th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">JD Weight</th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Found in Resume</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {allSkills.map(({ skill, weight, found }) => (
            <tr key={skill} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white capitalize">{skill}</td>
              <td className="px-4 py-3 text-center">
                {weight !== "—" ? (
                  <span className="inline-block w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center" aria-label={`Weight: ${weight}`}>{weight}</span>
                ) : (
                  <span className="text-slate-400" aria-hidden="true">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                <span className={found ? "text-emerald-600" : "text-red-600"}>
                  {found ? "Yes" : "No"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
            <td className="px-4 py-3 font-bold text-slate-900 dark:text-white" colSpan={2}>Overall Score</td>
            <td className="px-4 py-3 text-center font-black text-lg text-blue-600 dark:text-blue-400" aria-label={`Overall score: ${overallScore} out of 100`}>{overallScore} / 100</td>
          </tr>
        </tfoot>
      </table>
    </div>
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
  const [showAllDetails, setShowAllDetails] = useState(false);

  const { announce } = useAnnounce();
  const jdSelectId = useId();
  const fileInputId = useId();
  const dateInputId = useId();

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
  const scheduledInterviewDate = resolveInterviewDateTime(result);
  const calendarDateRange = getGoogleCalendarDateRange(scheduledInterviewDate);
  const interviewScheduledLabel = formatInterviewDateTimeLocal(result, "Not scheduled");
  const googleCalendarHref = calendarDateRange
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      "Interview - " + (selectedJd?.title || "Quadrant Technologies")
    )}&dates=${calendarDateRange.startUtc}/${calendarDateRange.endUtc}&details=${encodeURIComponent(
      "Join Link: " + (result?.interview_link || "")
    )}`
    : "";

  async function loadDashboard(jobId) {
    setLoading(true); setError("");
    try {
      const response = await candidateApi.dashboard(jobId);
      setDashboard(response);
      setMessage("");
      setScheduleDate(toDateTimeLocalInputValue(response?.result));
      announce("Dashboard loaded successfully");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadDashboard(); }, []);

  async function handleSelectJd(e) {
    const jdId = Number(e.target.value);
    announce(`Selected job: ${e.target.options[e.target.selectedIndex].text}`);
    try { await candidateApi.selectJd(jdId); await loadDashboard(jdId); }
    catch (e) { setError(e.message); announce(`Error: ${e.message}`, "assertive"); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !dashboard?.selected_jd_id) return;
    setUploading(true); setError(""); setMessage("");
    try {
      announce("Uploading resume...");
      const response = await candidateApi.uploadResume(file, dashboard.selected_jd_id);
      setDashboard(response);
      setMessage("Resume uploaded and scored successfully.");
      announce("Resume uploaded and scored successfully");
    } catch (e) {
      setError(e.message);
      announce(`Upload error: ${e.message}`, "assertive");
    }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function handleScheduleInterview() {
    if (!result?.id || !scheduleDate) { setError("Pick a date first."); return; }
    setScheduling(true); setError(""); setMessage("");
    try {
      announce("Scheduling interview...");
      const response = await candidateApi.scheduleInterview(result.id, scheduleDate);
      setDashboard((c) => c ? { ...c, result: response.result } : c);
      setMessage(response.message || "Interview scheduled.");
      announce("Interview scheduled successfully");
    } catch (e) { setError(e.message); announce(`Error: ${e.message}`, "assertive"); }
    finally { setScheduling(false); }
  }

  const steps = [
    { title: "Job Description", description: selectedJd ? selectedJd.title : "Select a role to apply", completed: Boolean(selectedJd) },
    { title: "Resume uploaded", description: dashboard?.candidate?.resume_path ? "Resume stored" : "Upload your resume", completed: Boolean(dashboard?.candidate?.resume_path) },
    { title: "AI Screening", description: result ? `${Math.round(Number((result?.final_score ?? result?.score) || 0))}% Application Tracking System score` : "Pending", completed: Boolean(result) },
    { title: "Interview stage", description: interviewCompleted ? "Interview submitted" : interviewReady ? "Ready to start" : canScheduleInterview ? "Schedule interview" : "Pending", completed: Boolean(interviewReady || interviewCompleted || finalDecision) },
  ];

  if (loading) return (
    <div role="status" aria-label="Loading dashboard" className="center muted">
      <p>Loading workspace...</p>
    </div>
  );
  if (error && !dashboard) return (
    <div role="alert" className="alert error">
      <p>{error}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 page-enter">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Workspace</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track your Application Tracking System stage, score breakdown, recommendation, and interview progress.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {showStartInterview && (
            <Link
              to={interviewRoute}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30 flex items-center space-x-2"
            >
              <span>{interviewSessionStatus === "in_progress" ? "Resume Interview" : "Start Interview"}</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" className="alert error">
          <p>{error}</p>
        </div>
      )}
      {message && (
        <div role="status" className="alert success">
          <p>{message}</p>
        </div>
      )}

      <main id="main-content" className="grid grid-cols-1 md:grid-cols-4 gap-4 page-enter-delay-1">
        <article className="card card-hover-lift status-border-left blue">
          <p className="eyebrow">Current stage</p>
          <div className="mt-2">{result?.stage ? <StatusBadge status={result.stage} /> : <StatusBadge status="applied" />}</div>
          <p className="muted mt-3">Your application pipeline status</p>
        </article>
        <article className="card card-hover-lift status-border-left green">
          <p className="eyebrow">Final score</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{Math.round(Number((result?.final_score ?? result?.score) || 0))}%</h2>
          <div className="score-bar mt-3" role="progressbar" aria-valuenow={Math.round(Number((result?.final_score ?? result?.score) || 0))} aria-valuemin="0" aria-valuemax="100">
            <div className={`score-bar-fill ${Math.round(Number((result?.final_score ?? result?.score) || 0)) >= 80 ? "green" : Math.round(Number((result?.final_score ?? result?.score) || 0)) >= 65 ? "blue" : "red"}`} style={{ width: `${Math.min(Math.round(Number((result?.final_score ?? result?.score) || 0)), 100)}%` }} />
          </div>
          <p className="muted mt-2">Overall match score</p>
        </article>
        <article className="card card-hover-lift status-border-left purple">
          <p className="eyebrow">Recommendation</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{result?.recommendation || "Pending"}</h2>
          <p className="muted">System recommendation</p>
        </article>
        <article className="card card-hover-lift status-border-left yellow">
          <p className="eyebrow">Interview status</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{interviewCompleted ? "Completed" : showStartInterview ? "Ready" : canScheduleInterview ? "Schedule" : "Pending"}</h2>
          <p className="muted">Next interview step</p>
        </article>
      </main>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 page-enter-delay-2">
        <div className="lg:col-span-2 space-y-8">
          <section aria-labelledby="apply-heading" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 id="apply-heading" className="text-2xl font-bold text-slate-900 dark:text-white">Apply for Role</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Select a Job Description then upload your resume.</p>
              </div>
              <label htmlFor={jdSelectId} className="sr-only">Select a Job</label>
              <select
                id={jdSelectId}
                value={dashboard?.selected_jd_id || ""}
                onChange={handleSelectJd}
                className="w-full md:w-80 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                <option value="" disabled>Select a Job</option>
                {(dashboard?.available_jds || []).map((jd) => (
                  <option key={jd.id} value={jd.id}>{jd.title}</option>
                ))}
              </select>
            </div>
            <div className="p-8">
              <label
                htmlFor={fileInputId}
                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-10 transition-all cursor-pointer group ${uploading ? "border-blue-400 bg-blue-50/30" : dashboard?.selected_jd_id ? "border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/30" : "border-slate-200 dark:border-slate-800 opacity-60"}`}
              >
                <input
                  id={fileInputId}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading || !dashboard?.selected_jd_id}
                  aria-describedby="file-upload-hint"
                />
                {uploading ? (
                  <div className="text-center">
                    <Clock size={32} className="text-blue-600 animate-spin mx-auto mb-3" aria-hidden="true" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">Uploading and scoring...</h4>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload size={32} className="text-slate-400 group-hover:text-blue-600 mx-auto mb-3 transition-colors" aria-hidden="true" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{dashboard?.selected_jd_id ? "Click to upload resume" : "Select a Job first"}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">PDF, DOCX, or TXT</p>
                  </div>
                )}
                <span id="file-upload-hint" className="sr-only">
                  {dashboard?.selected_jd_id ? "Upload your resume in PDF, DOCX, or TXT format to continue with your application" : "Please select a job first before uploading your resume"}
                </span>
              </label>
            </div>
          </section>

          {result && (
            <div className="space-y-6">
              <CollapseSection title="Resume vs Job Description — Skill Match" defaultOpen={true}>
                <div className="flex items-center gap-2 mb-4">
                  <StatusBadge status={result.stage} />
                  <StatusBadge status={result.shortlisted ? "Shortlisted" : "Rejected"} />
                </div>
                <SkillMatchTable explanation={explanation} selectedJd={selectedJd} />
                {Array.isArray(explanation?.reasons) && explanation.reasons.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <h5 className="font-bold text-slate-900 dark:text-white mb-2">Why this score</h5>
                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      {explanation.reasons.map((r, i) => <li key={i} className="flex items-start"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 mr-2 flex-shrink-0" aria-hidden="true" />{r}</li>)}
                    </ul>
                  </div>
                )}
              </CollapseSection>

              <div className="grid md:grid-cols-2 gap-6">
                <CollapseSection title="Score Breakdown" defaultOpen={false}>
                  <div className="space-y-4 text-sm">
                    {[["Resume / JD Match", scoreBreakdown.resume_jd_match_score], ["Skills Match", scoreBreakdown.skills_match_score], ["Interview Score", scoreBreakdown.interview_performance_score], ["Communication", scoreBreakdown.communication_behavior_score]].map(([label, val]) => {
                      const pct = Math.round(Number(val || 0));
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-slate-500 dark:text-slate-400">{label}</span>
                            <span className="font-bold text-slate-900 dark:text-white">{pct}%</span>
                          </div>
                          <div className="score-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                            <div className={`score-bar-fill ${pct >= 80 ? "green" : pct >= 65 ? "blue" : pct >= 40 ? "yellow" : "red"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapseSection>
                <CollapseSection title="Parsed Resume">
                  <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Summary:</strong> {parsedResume.summary || "No summary extracted."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{(parsedResume.skills || []).length ? parsedResume.skills.map((item) => <span key={item} className="skill-pill">{item}</span>) : <span className="muted">No skills extracted.</span>}</div>
                </CollapseSection>
              </div>

              {resumeAdvice && (
                <CollapseSection title="Resume Advice">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div><h5 className="font-bold text-emerald-600 dark:text-emerald-400 mb-3">Strengths</h5><ul className="space-y-2">{(resumeAdvice.strengths || []).map((item, i) => <li key={i} className="flex items-start text-sm text-slate-600 dark:text-slate-300"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 mr-2 flex-shrink-0" aria-hidden="true" />{item}</li>)}</ul></div>
                    <div><h5 className="font-bold text-amber-600 dark:text-amber-400 mb-3">Rewrite Tips</h5><ul className="space-y-2">{(resumeAdvice.rewrite_tips || []).map((item, i) => <li key={i} className="flex items-start text-sm text-slate-600 dark:text-slate-300"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2 flex-shrink-0" aria-hidden="true" />{item}</li>)}</ul></div>
                  </div>
                </CollapseSection>
              )}

              {result.shortlisted && !interviewCompleted && !finalDecision && (
                <section aria-labelledby="schedule-heading" className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-3xl text-white">
                  <h3 id="schedule-heading" className="text-xl font-bold font-display mb-2">Schedule Your Interview</h3>
                  <p className="text-blue-100 mb-6">Pick a date and time to unlock your interview link.</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 w-4 h-4" aria-hidden="true" />
                      <label htmlFor={dateInputId} className="sr-only">Interview date and time</label>
                      <input
                        id={dateInputId}
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        disabled={scheduling}
                        className="pl-10 pr-4 py-3 rounded-2xl text-slate-900 bg-white outline-none min-w-[250px]"
                      />
                    </div>
                    <button
                      onClick={handleScheduleInterview}
                      disabled={scheduling}
                      aria-busy={scheduling}
                      className="px-8 py-3 rounded-2xl bg-white text-blue-600 font-black hover:scale-[1.01] transition-all shadow-xl disabled:opacity-60"
                    >
                      {scheduling ? "Scheduling..." : scheduledInterviewDate ? "Reschedule" : "Schedule Interview"}
                    </button>
                  </div>
                  {scheduledInterviewDate && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <p className="text-sm text-blue-100">Scheduled for: <span className="font-bold">{interviewScheduledLabel}</span></p>
                      {googleCalendarHref && (
                        <a
                          href={googleCalendarHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
                        >
                          <span>Add to Google Calendar</span>
                        </a>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-6 page-enter-delay-3">
          <section aria-labelledby="progress-heading" className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift">
            <h4 id="progress-heading" className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6">Application Progress</h4>
            <StepChecklist steps={steps} />
          </section>
          {selectedJd && (
            <section aria-labelledby="selected-job-heading" className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift">
              <h4 id="selected-job-heading" className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Selected Job</h4>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedJd.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Cutoff {selectedJd.qualify_score}% · {selectedJd.total_questions} questions</p>
            </section>
          )}
          {result && (
            <section aria-labelledby="guidance-heading" className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm card-hover-lift">
              <h4 id="guidance-heading" className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Next Step Guidance</h4>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="question-preview-card">Current stage: {result.stage?.label || "Applied"}</div>
                <div className="question-preview-card">Recommendation: {result.recommendation || "Pending"}</div>
                <div className="question-preview-card">{showStartInterview ? "Your interview is ready to start." : canScheduleInterview ? "Schedule your interview to continue." : interviewCompleted ? "Interview completed — wait for HR review." : "Upload and improve your resume to move ahead."}</div>
              </div>
            </section>
          )}
        </aside>
      </div>
      <HelpSupportButton supportEmail="support@quadranttech.com" />

      <div aria-live="polite" aria-atomic="true" className="sr-announcer" />
    </div>
  );
}