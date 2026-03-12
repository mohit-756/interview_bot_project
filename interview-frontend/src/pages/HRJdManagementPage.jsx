import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

export default function HRJdManagementPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function loadJds() {
    setLoading(true);
    setError("");
    try {
      const response = await hrApi.dashboard();
      setData(response);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJds();
  }, [reloadKey]);

  async function handleToggleJdStatus(jobId, currentActive) {
    setBusy(true);
    setError("");
    try {
      // Note: This endpoint may need to be created in the backend
      // For now, we'll assume it exists or provide a placeholder message
      await hrApi.updateJdStatus(jobId, !currentActive);
      setReloadKey((prev) => prev + 1);
    } catch (toggleError) {
      setError(toggleError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="center muted">Loading JD management...</p>;

  const jobs = data?.jobs || [];

  return (
    <div className="stack">
      <PageHeader
        title="JD Management"
        subtitle="View, manage, and configure all Job Descriptions in your workspace."
        actions={
          <>
            <Link to="/hr" className="button-link subtle-button">
              Back to Dashboard
            </Link>
            <button type="button" onClick={() => setReloadKey((prev) => prev + 1)}>
              Refresh
            </button>
          </>
        }
      />

      {error && <p className="alert error">{error}</p>}

      <section className="card stack">
        <div className="title-row">
          <div>
            <p className="eyebrow">Overview</p>
            <h3>Job Descriptions</h3>
          </div>
        </div>

        {!jobs.length && <p className="muted">No JDs created yet. Upload your first JD from the dashboard.</p>}
        {!!jobs.length && (
          <>
            <section className="metric-grid">
              <MetricCard label="Total JDs" value={String(jobs.length)} hint="Across this workspace" />
              <MetricCard
                label="Active JDs"
                value={String(jobs.filter((j) => j.is_active !== false).length)}
                hint="Available for candidates"
              />
            </section>

            <table className="table">
              <thead>
                <tr>
                  <th>JD Title</th>
                  <th>Cutoff Score</th>
                  <th>Questions</th>
                  <th>Candidates</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.jd_title || job.jd_name || "Untitled"}</strong>
                    </td>
                    <td>{formatPercent(job.cutoff_score)}</td>
                    <td>{job.question_count || 8}</td>
                    <td>{job.candidate_count || 0}</td>
                    <td>
                      <StatusBadge
                        status={{
                          tone: job.is_active !== false ? "success" : "secondary",
                          label: job.is_active !== false ? "Active" : "Inactive",
                        }}
                      />
                    </td>
                    <td>{formatDateTime(job.created_at)}</td>
                    <td>
                      <div className="inline-row">
                        <Link to={`/hr?job_id=${job.id}`} className="button-link subtle-button">
                          View
                        </Link>
                        <button
                          type="button"
                          className="subtle-button"
                          disabled={busy}
                          onClick={() => handleToggleJdStatus(job.id, job.is_active)}
                        >
                          {job.is_active !== false ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
