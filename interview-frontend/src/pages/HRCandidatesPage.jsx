import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { formatDateTime, formatPercent } from "../utils/formatters";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Rejected" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "completed", label: "Completed" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "score_desc", label: "Score High to Low" },
];

export default function HRCandidatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryKey = searchParams.toString();
  const activeQuery = useMemo(
    () => ({
      q: searchParams.get("q") || "",
      status: searchParams.get("status") || "all",
      sort: searchParams.get("sort") || "newest",
      page: Number(searchParams.get("page") || "1"),
    }),
    [queryKey],
  );

  const [draftQ, setDraftQ] = useState(activeQuery.q);
  const [draftStatus, setDraftStatus] = useState(activeQuery.status);
  const [draftSort, setDraftSort] = useState(activeQuery.sort);

  useEffect(() => {
    setDraftQ(activeQuery.q);
    setDraftStatus(activeQuery.status);
    setDraftSort(activeQuery.sort);
  }, [activeQuery.q, activeQuery.status, activeQuery.sort]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await hrApi.listCandidates(activeQuery);
        setData(response);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeQuery, reloadKey]);

  function updateQuery(nextValues) {
    const params = new URLSearchParams();
    const q = nextValues.q ?? activeQuery.q;
    const status = nextValues.status ?? activeQuery.status;
    const sort = nextValues.sort ?? activeQuery.sort;
    const page = String(nextValues.page ?? activeQuery.page ?? 1);

    if (q) params.set("q", q);
    if (status && status !== "all") params.set("status", status);
    if (sort && sort !== "newest") params.set("sort", sort);
    if (page !== "1") params.set("page", page);
    setSearchParams(params);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    updateQuery({
      q: draftQ.trim(),
      status: draftStatus,
      sort: draftSort,
      page: 1,
    });
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget?.candidate_uid) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await hrApi.deleteCandidate(deleteTarget.candidate_uid);
      setNotice(response.message || "Candidate deleted");
      setDeleteTarget(null);
      setReloadKey((current) => current + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <p className="center muted">Loading candidates...</p>;

  const candidates = data?.candidates || [];

  return (
    <div className="stack">
      <PageHeader
        title="Candidate Manager"
        subtitle="Search, sort, review, and clean up locally stored candidate records."
        actions={
          <>
            <Link to="/hr" className="button-link subtle-button">
              Back to HR Dashboard
            </Link>
            <button type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Refresh
            </button>
          </>
        }
      />

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      <section className="metric-grid">
        <MetricCard label="Results found" value={String(data?.total_results ?? 0)} hint="Current filtered view" />
        <MetricCard label="Current page" value={String(data?.page || 1)} hint={`Of ${data?.total_pages || 1} pages`} />
        <MetricCard label="Status filter" value={STATUS_OPTIONS.find((item) => item.value === activeQuery.status)?.label || "All"} hint="Applied to this table" />
      </section>

      <section className="card stack">
        <form className="stack-sm" onSubmit={handleSearchSubmit}>
          <div className="section-grid">
            <input
              type="search"
              placeholder="Search Candidate ID, name, email, or status"
              value={draftQ}
              onChange={(event) => setDraftQ(event.target.value)}
            />
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={draftSort} onChange={(event) => setDraftSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit">Apply filters</button>
          </div>
        </form>
      </section>

      <section className="card stack">
        {!candidates.length && <p className="muted">No candidates match the current filters.</p>}
        {!!candidates.length && (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.candidate_uid}>
                    <td>{candidate.candidate_uid || "Pending"}</td>
                    <td>{candidate.name}</td>
                    <td>{candidate.email}</td>
                    <td><StatusBadge status={candidate.status} /></td>
                    <td>{formatPercent(candidate.score)}</td>
                    <td>{formatDateTime(candidate.created_at)}</td>
                    <td>
                      <div className="inline-row">
                        <Link to={`/hr/candidates/${candidate.candidate_uid}`} className="button-link subtle-button">
                          View
                        </Link>
                        <button type="button" className="danger-button" onClick={() => setDeleteTarget(candidate)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination-row">
              <button type="button" disabled={!data?.has_prev} onClick={() => updateQuery({ page: Math.max(1, activeQuery.page - 1) })}>
                Prev
              </button>
              <span className="muted">
                Page {data?.page || 1} of {data?.total_pages || 1}
              </span>
              <button type="button" disabled={!data?.has_next} onClick={() => updateQuery({ page: activeQuery.page + 1 })}>
                Next
              </button>
            </div>
          </>
        )}
      </section>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-candidate-title">
            <h3 id="delete-candidate-title">Delete Candidate</h3>
            <p className="muted">
              Delete {deleteTarget.name} ({deleteTarget.candidate_uid}) and all related interview records?
            </p>
            <div className="inline-row">
              <button type="button" className="danger-button" disabled={deleting} onClick={handleDeleteConfirmed}>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button type="button" className="subtle-button" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
