import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Search, PlayCircle, CheckCircle, AlertTriangle, Clock, Calendar, ChevronLeft, ChevronRight, X, Info } from "lucide-react";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime } from "../utils/formatters";

export default function HRInterviewListPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [suspiciousModal, setSuspiciousModal] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await hrApi.interviews();
        setData(response.interviews || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((row) => {
      const candidateName = row.candidate?.name || "";
      const candidateEmail = row.candidate?.email || "";
      const jobTitle = row.job?.title || "";
      const applicationId = row.application_id || "";
      return [candidateName, candidateEmail, jobTitle, applicationId, row.status || ""]
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const paginatedRows = filteredRows.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => { setPage(1); }, [search, itemsPerPage]);

  const suspiciousTotal = filteredRows.reduce((sum, row) => sum + Number(row.suspicious_events_count || 0), 0);
  const completedCount = filteredRows.filter((row) => row.status === "completed" || row.status === "selected" || row.status === "rejected").length;

  if (loading) return <p className="center muted">Loading interviews...</p>;

  return (
    <div className="stack page-enter">
      <PageHeader
        title="Interview Reviews"
        subtitle="Review completed sessions, suspicious events, and finalize outcomes."
        actions={
          <Link to="/hr" className="button-link subtle-button">
            Back to HR Dashboard
          </Link>
        }
      />

      {error && <p className="alert error">{error}</p>}

      <section className="metric-grid page-enter-delay-1">
        <MetricCard label="Interviews" value={String(filteredRows.length)} hint="Current filtered sessions" />
        <MetricCard label="Completed" value={String(completedCount)} hint="Ready for final decision" />
        <MetricCard label="Suspicious events" value={String(suspiciousTotal)} hint="Across visible sessions" />
      </section>

      <section className="card stack">
        <div className="section-grid">
          <input type="search" placeholder="Search candidate, email, job, application, or status" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <>
          {!paginatedRows.length && <p className="muted">No interviews found.</p>}
          {!!paginatedRows.length && (
            <table className="table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Candidate</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Events</th>
                  <th>Suspicious</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.interview_id}>
                    <td className="text-sm font-mono text-slate-500">{row.application_id || "N/A"}</td>
                    <td>
                      <div className="stack-sm">
                        <strong>{row.candidate?.name}</strong>
                        <span className="muted text-xs">{row.candidate?.email}</span>
                      </div>
                    </td>
                    <td>{row.job?.title || "Job"}</td>
                    <td>
                      <StatusBadge status={{ key: row.status, label: row.status, tone: row.status === "completed" ? "success" : row.status === "in_progress" ? "primary" : "secondary" }} />
                    </td>
                    <td className="text-sm text-slate-500">{formatDateTime(row.started_at)}</td>
                    <td className="text-center">{row.events_count || 0}</td>
                    <td>
                      {(row.suspicious_events_count ?? 0) > 0 ? (
                        <button 
                          type="button"
                          onClick={() => setSuspiciousModal(row)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
                        >
                          <AlertTriangle size={12} />{row.suspicious_events_count}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-sm">0</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/hr/interviews/${row.interview_id}`} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                        <Eye size={14} />View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredRows.length > itemsPerPage && (
            <div className="p-4 sm:p-5 bg-slate-50/30 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                <span className="text-slate-500">Show</span>
                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }} className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white">
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                </select>
                <span className="text-slate-500">per page</span>
              </div>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-900 transition-all"><ChevronLeft size={14} /></button>
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white px-2">Page {page} / {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-900 transition-all"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      </section>

      {/* Suspicious Events Modal */}
      {suspiciousModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSuspiciousModal(null)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-red-500" size={20} />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Suspicious Events</h3>
              </div>
              <button type="button" onClick={() => setSuspiciousModal(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Candidate: <span className="font-bold">{suspiciousModal.candidate?.name}</span><br />
                <span className="text-slate-500">Job: {suspiciousModal.job?.title}</span>
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                  <AlertTriangle size={14} className="inline mr-1" />
                  {suspiciousModal.suspicious_events_count} suspicious event{suspiciousModal.suspicious_events_count !== 1 ? 's' : ''} detected during interview
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Click "View" to see full details and timeline.</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quick Actions</p>
                <Link 
                  to={`/hr/interviews/${suspiciousModal.interview_id}`}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
                  onClick={() => setSuspiciousModal(null)}
                >
                  <Eye size={16} />View Full Interview & Timeline
                </Link>
                <Link 
                  to={`/hr/proctoring/${suspiciousModal.interview_id}`}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-colors"
                  onClick={() => setSuspiciousModal(null)}
                >
                  <Info size={16} />View Proctoring Timeline
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
