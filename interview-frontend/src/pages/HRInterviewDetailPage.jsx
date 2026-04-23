import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Camera, Clock, RefreshCw, Sparkles } from "lucide-react";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime } from "../utils/formatters";

function makeFullUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${window.location.origin}${path}`;
}

function scoreColor(score) {
  const n = Number(score);
  if (n >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 60) return "text-blue-600 dark:text-blue-400";
  if (n >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function ScorePill({ score, skipped }) {
  if (skipped) return <span className="text-slate-400 text-xs italic">Skipped</span>;
  if (score === null || score === undefined) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"><Clock size={11} />Pending</span>;
  const n = Math.round(Number(score));
  return <span className={`inline-block font-black text-base ${scoreColor(n)}`}>{n}<span className="text-xs font-normal text-slate-400">/100</span></span>;
}

function EvalStatusBadge({ status }) {
  const map = {
    pending: { label: "Scoring Pending", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" },
    running: { label: "Scoring…", cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" },
    completed: { label: "Scored ✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" },
    failed: { label: "Scoring Failed", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
  };
  const cfg = map[status] || map.pending;
  return <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cfg.cls}`}>{cfg.label}</span>;
}

export default function HRInterviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [reEvalMessage, setReEvalMessage] = useState("");
  const [decision, setDecision] = useState("selected");
  const [notes, setNotes] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [behavioralScore, setBehavioralScore] = useState("");
  const [communicationScore, setCommunicationScore] = useState("");
  const [redFlags, setRedFlags] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await hrApi.interviewDetail(id);
      setData(response);
      const hr = response.hr_review;
      if (hr) {
        setNotes(hr.notes || "");
        setFinalScore(hr.final_score ?? "");
        setBehavioralScore(hr.behavioral_score ?? "");
        setCommunicationScore(hr.communication_score ?? "");
        setRedFlags(hr.red_flags || "");
      }
      if (response?.interview?.status === "rejected") setDecision("rejected");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleFinalize() {
    const confirmMsg = `Are you sure you want to ${decision === "selected" ? "SELECT" : "REJECT"} this candidate?\n\nThis action will mark the interview as finalized and update their pipeline status. You can still review and edit later.`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setError("");
    try {
      await hrApi.finalizeInterview(id, { decision, notes, final_score: finalScore ? Number(finalScore) : null, behavioral_score: behavioralScore ? Number(behavioralScore) : null, communication_score: communicationScore ? Number(communicationScore) : null, red_flags: redFlags.trim() || null });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReEvaluate() {
    setReEvaluating(true);
    setReEvalMessage("");
    setError("");
    try {
      const resp = await hrApi.reEvaluateInterview(id);
      setReEvalMessage(resp.message || "Re-evaluation started. Refresh in ~30 seconds.");
    } catch (e) {
      setError(e.message);
    } finally {
      setReEvaluating(false);
    }
  }

  async function handleSendFeedback() {
    setSendingFeedback(true);
    setFeedbackMessage("");
    setError("");
    try {
      const resp = await hrApi.sendFeedbackEmail(id);
      setFeedbackMessage(resp.message || "Feedback email sent successfully.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingFeedback(false);
    }
  }

  const suspiciousEvents = useMemo(() => (data?.events || []).filter((e) => e.suspicious), [data?.events]);
  const { avgLLMScore, pendingCount } = useMemo(() => {
    const questions = data?.questions || [];
    const scores = questions.filter((q) => !q.skipped).map((q) => Number(q.evaluation?.overall_answer_score ?? q.llm_score ?? q.ai_answer_score)).filter((v) => !isNaN(v) && v > 0);
    const pending = questions.filter((q) => !q.skipped && (q.llm_score === null || q.llm_score === undefined)).length;
    return { avgLLMScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, pendingCount: pending };
  }, [data?.questions]);

  if (loading) return <p className="center muted">Loading interview...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data?.interview) return <p className="muted">Not found.</p>;

  const { interview, questions, events, hr_review, section_summary } = data;
  const evalStatus = interview.llm_eval_status || "pending";
  const canReEvaluate = evalStatus !== "running" && pendingCount > 0;
  const summary = interview.evaluation_summary || {};

  return (
    <div className="space-y-8 pb-12">
      <PageHeader title={`Interview — ${interview.candidate?.name || "Candidate"}`} subtitle={`${interview.job?.title || "Role"} · Application ${interview.application_id || interview.interview_id}`} actions={<div className="flex items-center gap-3 flex-wrap">{canReEvaluate && <button type="button" onClick={handleReEvaluate} disabled={reEvaluating} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-60 transition-all"><RefreshCw size={16} className={reEvaluating ? "animate-spin" : ""} />{reEvaluating ? "Starting…" : "Re-run AI Scoring"}</button>}<button type="button" onClick={handleSendFeedback} disabled={sendingFeedback} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:opacity-60 transition-all"><Sparkles size={16} />{sendingFeedback ? "Sending..." : "Send Feedback Email"}</button><EvalStatusBadge status={evalStatus} /><StatusBadge status={interview.stage} /><button type="button" className="subtle-button" onClick={() => navigate(-1)}>Back</button></div>} />

      {error && <p className="alert error">{error}</p>}
      {reEvalMessage && <p className="rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 px-4 py-3 text-sm font-medium">{reEvalMessage}</p>}
      {feedbackMessage && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm font-medium">{feedbackMessage}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Status" value={interview.status} hint="Current outcome" />
        <MetricCard label="Avg AI score" value={avgLLMScore !== null ? `${avgLLMScore}%` : "Pending"} hint={pendingCount > 0 ? `${pendingCount} answer(s) awaiting scoring` : "Across all answers"} color={pendingCount > 0 ? "yellow" : "blue"} />
        <MetricCard label="Questions" value={String(questions?.length || 0)} hint="Total asked" />
        <MetricCard label="Proctor flags" value={String(suspiciousEvents.length)} hint="Needs review" color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card"><p className="eyebrow">Interview score</p><h3>{Math.round(Number(summary.overall_interview_score || 0))}%</h3><p className="muted">Interview-level summary</p></div>
        <div className="card"><p className="eyebrow">Communication</p><h3>{Math.round(Number(summary.communication_score || 0))}%</h3><p className="muted">Clarity and confidence</p></div>
        <div className="card"><p className="eyebrow">Recommendation</p><h3>{summary.hiring_recommendation || "Pending"}</h3><p className="muted">Current ATS recommendation</p></div>
        <div className="card"><p className="eyebrow">Suspicious events</p><h3>{suspiciousEvents.length}</h3><p className="muted">Proctoring review items</p></div>
      </div>

      {Object.keys(section_summary || {}).length > 0 && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Object.entries(section_summary).map(([section, score]) => <MetricCard key={section} label={`${section} section`} value={`${Math.round(Number(score))}%`} hint="Average score" color="purple" />)}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Sparkles className="text-blue-600" size={20} />
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Analysis</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Summary & Recommendation</h3>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-900/10 dark:to-blue-900/5 p-4 border border-blue-200/50 dark:border-blue-800/50">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Hiring Recommendation</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-200">{summary.hiring_recommendation || "Pending AI analysis"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Key Strengths</p>
              {(summary.strengths_summary || []).length ? (
                <ul className="space-y-1">
                  {(summary.strengths_summary || []).map((s, i) => (
                    <li key={i} className="text-sm text-emerald-700 dark:text-emerald-400 flex gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 italic">No strengths analyzed yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Areas for Improvement</p>
              {(summary.weaknesses_summary || []).length ? (
                <ul className="space-y-1">
                  {(summary.weaknesses_summary || []).map((w, i) => (
                    <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex gap-2">
                      <span className="text-amber-500 font-bold">!</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 italic">No areas identified yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <AlertTriangle className="text-amber-500" size={20} />
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proctoring Monitor</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Suspicious Events</h3>
            </div>
          </div>
          {suspiciousEvents.length ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{suspiciousEvents.length} flag{suspiciousEvents.length !== 1 ? 's' : ''} recorded during this interview:</p>
              {suspiciousEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/50">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">{(event.event_type || "").replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{formatDateTime(event.created_at)}</p>
                </div>
              ))}
              {suspiciousEvents.length > 5 && (
                <p className="text-xs text-slate-500 text-center pt-2">+ {suspiciousEvents.length - 5} more flag{suspiciousEvents.length - 5 !== 1 ? 's' : ''}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/10 p-4 border border-emerald-200/50 dark:border-emerald-800/50 text-center">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ No suspicious proctoring events were recorded.</p>
              <p className="text-xs text-emerald-600/75 dark:text-emerald-500/75 mt-1">Interview integrity confirmed.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Questions, Answers & AI Review</h3><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Each answer includes score, reference answer, strengths, weaknesses, and improvement suggestion.</p></div>
        <div className="space-y-4 p-6">{(!questions || !questions.length) && <p className="text-center text-slate-500">No questions recorded.</p>}{(questions || []).map((q, idx) => <div key={q.id} className={`question-preview-card ${q.skipped ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-4 flex-wrap"><div><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Question {idx + 1} | {q.difficulty || "N/A"} | {q.section || "N/A"}</p><p className="text-sm font-bold text-slate-900 dark:text-white">{q.text}</p></div><ScorePill score={q.evaluation?.overall_answer_score ?? q.llm_score ?? q.ai_answer_score} skipped={q.skipped} /></div><div className="grid md:grid-cols-2 gap-6 mt-4"><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Candidate answer</p><p className="text-sm text-slate-600 dark:text-slate-300">{q.answer_text || "(skipped)"}</p></div><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reference answer</p><p className="text-sm text-slate-600 dark:text-slate-300">{q.reference_answer || "—"}</p></div></div><div className="grid md:grid-cols-4 gap-4 mt-4">{[["Relevance", q.evaluation?.relevance], ["Technical", q.evaluation?.technical_correctness], ["Clarity", q.evaluation?.clarity], ["Communication", q.evaluation?.confidence_communication]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 px-4 py-3"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p><p className="text-lg font-black text-slate-900 dark:text-white">{value != null ? `${Math.round(Number(value))}%` : "—"}</p></div>)}</div><div className="grid md:grid-cols-3 gap-4 mt-4"><div><p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Strengths</p>{(q.evaluation?.strengths || []).length ? q.evaluation.strengths.map((item, index) => <p key={`s-${index}`} className="text-sm text-slate-600 dark:text-slate-300">• {item}</p>) : <p className="text-sm text-slate-500">—</p>}</div><div><p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Weaknesses</p>{(q.evaluation?.weaknesses || []).length ? q.evaluation.weaknesses.map((item, index) => <p key={`w-${index}`} className="text-sm text-slate-600 dark:text-slate-300">• {item}</p>) : <p className="text-sm text-slate-500">—</p>}</div><div><p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Suggestion</p><p className="text-sm text-slate-600 dark:text-slate-300">{q.evaluation?.improvement_suggestion || q.feedback || q.llm_feedback || "—"}</p></div></div></div>)}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-900 dark:text-white">Proctoring Events</h3><p className="text-sm text-slate-500 mt-1">{suspiciousEvents.length} suspicious event{suspiciousEvents.length !== 1 ? "s" : ""} flagged</p></div>{suspiciousEvents.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold"><AlertTriangle size={16} />Review required</div>}</div>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th><th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Event Type</th><th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Flag</th><th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Faces</th><th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Score</th><th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Snapshot</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{(!events || !events.length) && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No proctoring events recorded.</td></tr>}{(events || []).map((ev) => <tr key={ev.id} className={`transition-colors ${ev.suspicious ? "bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"}`}><td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDateTime(ev.created_at)}</td><td className="px-5 py-3 font-medium text-slate-900 dark:text-white capitalize">{(ev.event_type || "").replace(/_/g, " ")}</td><td className="px-5 py-3 text-center">{ev.suspicious ? <XCircle size={18} className="text-red-500 mx-auto" /> : <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />}</td><td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300">{ev.meta_json?.faces_count ?? "—"}</td><td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300">{ev.score != null ? Number(ev.score).toFixed(2) : "—"}</td><td className="px-5 py-3 text-center">{ev.image_url ? <a href={makeFullUrl(ev.image_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"><Camera size={14} />View</a> : <span className="text-slate-400 text-xs">—</span>}</td></tr>)}</tbody></table></div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">HR Decision</h3>
        {hr_review?.final_score != null && <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm text-slate-600 dark:text-slate-300">Current: Final {hr_review.final_score ?? "—"} · Behavioral {hr_review.behavioral_score ?? "—"} · Communication {hr_review.communication_score ?? "—"}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div><label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Decision</label><select value={decision} onChange={(e) => setDecision(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white"><option value="selected">Selected</option><option value="rejected">Rejected</option></select></div>{[["Final score", finalScore, setFinalScore],["Behavioral", behavioralScore, setBehavioralScore],["Communication", communicationScore, setCommunicationScore]].map(([label, val, setter]) => <div key={label}><label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">{label}</label><input type="number" min={0} max={100} placeholder="0–100" value={val} onChange={(e) => setter(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white" /></div>)}</div>
        <div className="space-y-3 mb-5"><textarea rows={2} placeholder="Red flags / suspicious behaviour notes" value={redFlags} onChange={(e) => setRedFlags(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white resize-none" /><textarea rows={3} placeholder="Final interview notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white resize-none" /></div>
        <button type="button" disabled={saving} onClick={handleFinalize} className={`px-8 py-3 rounded-xl font-bold text-white transition-all disabled:opacity-60 ${decision === "selected" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>{saving ? "Saving..." : `Save — ${decision === "selected" ? "Select" : "Reject"} Candidate`}</button>
      </div>
    </div>
  );
}
