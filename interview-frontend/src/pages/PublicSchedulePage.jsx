import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { useParams } from "react-router-dom";
import { candidateApi } from "../services/api";

export default function PublicSchedulePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadPage() {
      setLoading(true);
      setError("");
      try {
        const response = await candidateApi.publicScheduleDetail(token);
        setData(response);
        if (response?.result?.interview_date) {
          setScheduleDate(String(response.result.interview_date).slice(0, 16));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadPage();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!scheduleDate) {
      setError("Please choose a date and time.");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await candidateApi.publicScheduleInterview(token, scheduleDate);
      setMessage(response.message || "Interview scheduled successfully.");
      setData((current) => current ? { ...current, result: response.result } : current);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="center muted">Loading scheduling page...</p>;
  if (error && !data) return <p className="alert error">{error}</p>;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Interview Scheduling</p>
          <h1 className="text-3xl font-black mt-2">Choose Your Interview Slot</h1>
          <p className="text-blue-100 mt-3">
            {data?.candidate?.name || "Candidate"}, pick your preferred date and time for the {data?.job?.title || "interview"}.
          </p>
        </div>

        <div className="p-8 space-y-6">
          {error && <p className="alert error">{error}</p>}
          {message && <p className="alert success">{message}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <CalendarDays size={16} />
                <span>Role</span>
              </div>
              <p className="mt-2 font-bold text-slate-900 dark:text-white">{data?.job?.title || "Interview"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Clock size={16} />
                <span>Status</span>
              </div>
              <p className="mt-2 font-bold text-slate-900 dark:text-white">
                {data?.result?.interview_date ? "Scheduled" : "Waiting for your selection"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Interview date and time</span>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black transition-all disabled:opacity-60"
            >
              {submitting ? "Scheduling..." : "Confirm Interview Slot"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
