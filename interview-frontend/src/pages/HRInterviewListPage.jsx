import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Search, PlayCircle, CheckCircle, AlertTriangle, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold">
                          <AlertTriangle size={12} />{row.suspicious_events_count}
                        </span>
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
    </div>
  );
}
