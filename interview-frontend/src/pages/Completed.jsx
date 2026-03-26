import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Home, BarChart3, ArrowRight, Loader2, AlertCircle, Sparkles, MessageSquare } from "lucide-react";
import { interviewApi } from "../services/api";

export default function Completed() {
  const navigate = useNavigate();
  const { resultId } = useParams();
  const [evaluating, setEvaluating] = useState(() => Boolean(sessionStorage.getItem(`session-id:${resultId}`)));
  const [evaluateFailed, setEvaluateFailed] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const sessionId = sessionStorage.getItem(`session-id:${resultId}`);
    if (!sessionId) return;

    interviewApi
      .evaluate(Number(sessionId))
      .then(async () => {
        setEvaluateFailed(false);
        try {
          const payload = await interviewApi.sessionSummary(Number(sessionId));
          setSummary(payload);
        } catch {
          setSummary(null);
        }
      })
      .catch(async () => {
        setEvaluateFailed(true);
        try {
          const payload = await interviewApi.sessionSummary(Number(sessionId));
          setSummary(payload);
        } catch {
          setSummary(null);
        }
      })
      .finally(() => setEvaluating(false));
  }, [resultId]);

  const interviewSummary = summary?.summary || {};
  const strengths = summary?.strengths || interviewSummary?.strengths_summary || [];
  const weaknesses = summary?.weaknesses || interviewSummary?.weaknesses_summary || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="relative inline-block">
          <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-[32px] flex items-center justify-center mx-auto relative z-10 shadow-xl shadow-emerald-100 dark:shadow-none">
            <CheckCircle2 size={48} />
          </div>
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center font-black">
            OK
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-black text-slate-900 dark:text-white font-display leading-tight">
            Interview Submitted
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Your answers have been recorded. The recruitment team can now review your interview summary, strengths, and progress.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-4 inline-flex items-center gap-3 mx-auto">
          {evaluating ? (
            <>
              <Loader2 size={18} className="text-blue-500 animate-spin" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Scoring your answers with AI...</span>
            </>
          ) : evaluateFailed ? (
            <>
              <AlertCircle size={18} className="text-amber-500" />
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Answer scoring unavailable right now — HR can still review manually.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span className="text-sm text-slate-600 dark:text-slate-300">Answers scored and saved</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card"><p className="eyebrow">Answered</p><h3>{summary?.answered_count ?? "-"}</h3><p className="muted">Out of {summary?.total_questions ?? "-"}</p></div>
          <div className="card"><p className="eyebrow">Interview score</p><h3>{Math.round(Number(interviewSummary?.overall_interview_score || 0))}%</h3><p className="muted">Overall response quality</p></div>
          <div className="card"><p className="eyebrow">Communication</p><h3>{Math.round(Number(interviewSummary?.communication_score || 0))}%</h3><p className="muted">Clarity and confidence</p></div>
          <div className="card"><p className="eyebrow">Recommendation</p><h3>{interviewSummary?.hiring_recommendation || "Under Review"}</h3><p className="muted">Current ATS recommendation</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center"><Sparkles className="text-emerald-500 mr-2" size={18} />Strengths</h3>
            <div className="space-y-3">
              {strengths.length ? strengths.map((item) => <div key={item} className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-sm text-slate-700 dark:text-slate-300">{item}</div>) : <p className="text-sm text-slate-500">Your interview summary is being prepared.</p>}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center"><MessageSquare className="text-amber-500 mr-2" size={18} />Improvement areas</h3>
            <div className="space-y-3">
              {weaknesses.length ? weaknesses.map((item) => <div key={item} className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-sm text-slate-700 dark:text-slate-300">{item}</div>) : <p className="text-sm text-slate-500">No major concerns were captured in the summary.</p>}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl max-w-2xl mx-auto text-left">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">What happens next?</h3>
          <div className="space-y-6">
            {[
              ["1", "Interview submitted", "Your final answers are saved and the session is closed."],
              ["2", "HR review", "Recruiters review your answers, ATS score, and interview summary."],
              ["3", "Pipeline update", "Your dashboard stage will update if you move to the next hiring step."],
            ].map(([num, title, desc]) => (
              <div key={num} className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">{num}</div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button onClick={() => navigate("/candidate")} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"><Home size={20} /><span>Go to Dashboard</span></button>
          <button onClick={() => navigate("/interview/result")} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-200 dark:shadow-none transition-all group"><BarChart3 size={20} /><span>View Application Status</span><ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
        </div>
      </div>
    </div>
  );
}
