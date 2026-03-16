import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Camera, Clock } from "lucide-react";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

function scoreColor(score) {
  const n = Number(score);
  if (n >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 60) return "text-blue-600 dark:text-blue-400";
  if (n >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

// FIX 5: Shows "Pending" when llm_score is null and answer wasn't skipped
function ScorePill({ score, skipped }) {
  if (skipped) return <span className="text-slate-400 text-xs italic">Skipped</span>;
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        <Clock size={11} />
        Pending
      </span>
    );
  }
  const n = Math.round(Number(score));
  return (
    <span className={`inline-block font-black text-base ${scoreColor(n)}`}>
      {n}<span className="text-xs font-normal text-slate-400">/100</span>
    </span>
  );
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

  const load = useCallback(async () => {
    setLoading(true); setError("");
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
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      await hrApi.finalizeInterview(id, {
        decision, notes,
        final_score: finalScore ? Number(finalScore) : null,
        behavioral_score: behavioralScore ? Number(behavioralScore) : null,
        communication_score: communicationScore ? Number(communicationScore) : null,
        red_flags: redFlags.trim() || null,
      });
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const suspiciousEvents = useMemo(() => (data?.events || []).filter((e) => e.suspicious), [data?.events]);

  const { avgLLMScore, pendingCount } = useMemo(() => {
    const questions = data?.questions || [];
    const scores = questions
      .filter((q) => !q.skipped)
      .map((q) => Number(q.llm_score ?? q.ai_answer_score))
      .filter((v) => !isNaN(v) && v > 0);
    const pending = questions.filter((q) => !q.skipped && (q.llm_score === null || q.llm_score === undefined)).length;
    return {
      avgLLMScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      pendingCount: pending,
    };
  }, [data?.questions]);

  if (loading) return <p className="center muted">Loading interview...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data?.interview) return <p className="muted">Not found.</p>;

  const { interview, questions, events, hr_review } = data;

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title={`Interview — ${interview.candidate?.name || "Candidate"}`}
        subtitle={`${interview.job?.title || "Role"} · Application ${interview.application_id || interview.interview_id}`}
        actions={<button type="button" className="subtle-button" onClick={() => navigate(-1)}>Back</button>}
      />

      {error && <p className="alert error">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Status" value={interview.status} hint="Current outcome" />
        <MetricCard
          label="Avg LLM score"
          value={avgLLMScore !== null ? `${avgLLMScore}%` : "Pending"}
          hint={pendingCount > 0 ? `${pendingCount} answer(s) awaiting scoring` : "Across all answers"}
          color={pendingCount > 0 ? "yellow" : "blue"}
        />
        <MetricCard label="Questions" value={String(questions?.length || 0)} hint="Total asked" />
        <MetricCard label="Proctor flags" value={String(suspiciousEvents.length)} hint="Needs review" color="red" />
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl text-sm text-amber-800 dark:text-amber-300">
          <Clock size={16} className="flex-shrink-0" />
          <span>
            <strong>{pendingCount} answer{pendingCount > 1 ? "s" : ""}</strong> {pendingCount > 1 ? "are" : "is"} awaiting AI scoring. This runs automatically when the interview session closes.
          </span>
        </div>
      )}

      {/* Q&A TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Questions, Answers & LLM Scores</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Each answer is scored by AI after the interview completes.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Question</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Answer</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-28">LLM Score</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">AI Feedback</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(!questions || !questions.length) && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No questions recorded.</td></tr>
              )}
              {(questions || []).map((q, idx) => (
                <tr key={q.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${q.skipped ? "opacity-60" : ""}`}>
                  <td className="px-5 py-4 font-bold text-slate-400">{idx + 1}</td>
                  <td className="px-5 py-4 text-slate-900 dark:text-white max-w-xs">
                    <p className="line-clamp-3 leading-relaxed">{q.text}</p>
                    <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${
                      q.difficulty === "hard" ? "bg-red-50 text-red-600" :
                      q.difficulty === "easy" ? "bg-green-50 text-green-600" :
                      "bg-blue-50 text-blue-600"
                    }`}>
                      {q.difficulty || "medium"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-300 max-w-xs">
                    {q.skipped ? (
                      <span className="italic text-slate-400">Skipped</span>
                    ) : (
                      <p className="line-clamp-4 leading-relaxed text-sm">{q.answer_text || "—"}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <ScorePill score={q.llm_score ?? (q.ai_answer_score > 0 ? q.ai_answer_score : null)} skipped={q.skipped} />
                  </td>
                  <td className="px-5 py-4 text-slate-500 dark:text-slate-400 max-w-xs">
                    <p className="text-sm leading-relaxed line-clamp-3">
                      {q.llm_feedback || q.answer_summary || (q.skipped ? "—" : "Pending AI review")}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-center text-slate-500 text-xs">
                    {q.time_taken_seconds != null ? `${q.time_taken_seconds}s` : "—"}
                    {q.allotted_seconds ? <span className="block text-slate-300">/ {q.allotted_seconds}s</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
            {avgLLMScore !== null && (
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                  <td colSpan={3} className="px-5 py-3 font-bold text-slate-900 dark:text-white">
                    Average LLM Score
                    {pendingCount > 0 && (
                      <span className="ml-2 text-xs text-amber-600 font-normal">({pendingCount} pending)</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <ScorePill score={avgLLMScore} skipped={false} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Proctoring TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Proctoring Events</h3>
            <p className="text-sm text-slate-500 mt-1">
              {suspiciousEvents.length} suspicious event{suspiciousEvents.length !== 1 ? "s" : ""} flagged
            </p>
          </div>
          {suspiciousEvents.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold">
              <AlertTriangle size={16} />
              Review required
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Event Type</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Flag</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Faces</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(!events || !events.length) && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No proctoring events recorded.</td></tr>
              )}
              {(events || []).map((ev) => (
                <tr key={ev.id} className={`transition-colors ${ev.suspicious ? "bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"}`}>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDateTime(ev.created_at)}</td>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white capitalize">{(ev.event_type || "").replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 text-center">
                    {ev.suspicious ? <XCircle size={18} className="text-red-500 mx-auto" /> : <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />}
                  </td>
                  <td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300">{ev.meta_json?.faces_count ?? "—"}</td>
                  <td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300">{ev.score != null ? Number(ev.score).toFixed(2) : "—"}</td>
                  <td className="px-5 py-3 text-center">
                    {ev.image_url ? (
                      <a href={ev.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                        <Camera size={14} />View
                      </a>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HR Decision Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">HR Decision</h3>
        {hr_review?.final_score != null && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm text-slate-600 dark:text-slate-300">
            Current: Final {hr_review.final_score ?? "—"} · Behavioral {hr_review.behavioral_score ?? "—"} · Communication {hr_review.communication_score ?? "—"}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Decision</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white">
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {[
            ["Final score", finalScore, setFinalScore],
            ["Behavioral", behavioralScore, setBehavioralScore],
            ["Communication", communicationScore, setCommunicationScore],
          ].map(([label, val, setter]) => (
            <div key={label}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
              <input type="number" min={0} max={100} placeholder="0–100" value={val}
                onChange={(e) => setter(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white" />
            </div>
          ))}
        </div>
        <div className="space-y-3 mb-5">
          <textarea rows={2} placeholder="Red flags / suspicious behaviour notes" value={redFlags} onChange={(e) => setRedFlags(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white resize-none" />
          <textarea rows={3} placeholder="Final interview notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-white resize-none" />
        </div>
        <button type="button" disabled={saving} onClick={handleFinalize}
          className={`px-8 py-3 rounded-xl font-bold text-white transition-all disabled:opacity-60 ${decision === "selected" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
          {saving ? "Saving..." : `Save — ${decision === "selected" ? "Select" : "Reject"} Candidate`}
        </button>
      </div>
    </div>
  );
}
