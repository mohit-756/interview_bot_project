import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, RefreshCw, ThumbsDown, ThumbsUp, Users, UserCheck, UserPlus, Calendar, CheckCircle, UserMinus, XCircle } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import { hrApi } from "../services/api";
import { ATS_STAGE_DEFINITIONS as PIPELINE_STAGES, normalizeStageKey } from "../utils/stages";

const STAGE_ICONS = {
  applied: UserPlus,
  screening: Users,
  shortlisted: UserCheck,
  interview_scheduled: Calendar,
  interview_completed: CheckCircle,
  selected: CheckCircle,
  rejected: XCircle,
};

const STAGE_COLORS = {
  primary: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  success: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
  danger: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  secondary: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
  dark: "bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600",
};

function getCandidateJdId(candidate) {
  const jdId = candidate?.assignedJd?.id ?? candidate?.job?.id ?? null;
  return jdId == null ? "" : String(jdId);
}

function CandidateCard({ candidate, onQuickAction, quickActionLoadingId }) {
  const currentStage = normalizeStageKey(candidate?.interviewStatus?.key);
  const isUpdating = quickActionLoadingId === candidate?.result_id;

  return (
    <div className="pipeline-card">
      <div className="pipeline-card-header">
        <div>
          <h4>{candidate?.name || "Unnamed candidate"}</h4>
          <p>{candidate?.candidate_uid || "No ID"}</p>
        </div>
        <StatusBadge status={candidate?.finalDecision} />
      </div>
      <div className="pipeline-card-body">
        <div className="pipeline-card-metrics">
          <div>
            <span>Final Score</span>
            <ScoreBadge score={candidate?.finalAIScore || 0} />
          </div>
          <div>
            <span>Match %</span>
            <strong>{candidate?.matchPercent || 0}%</strong>
          </div>
        </div>
        <p><strong>Recommendation:</strong> {candidate?.recommendationTag || "N/A"}</p>
        <p><strong>Assigned JD:</strong> {candidate?.assignedJd?.title || candidate?.role || "Not assigned"}</p>
      </div>
      <div className="pipeline-card-footer pipeline-card-actions">
        <Link to={`/hr/candidates/${candidate?.candidate_uid}`} className="pipeline-action-button pipeline-action-link"><Eye size={14} /><span>View</span></Link>
        <button type="button" disabled={isUpdating || currentStage === "shortlisted"} onClick={(event) => { event.stopPropagation(); onQuickAction(candidate, "shortlisted"); }} className="pipeline-action-button"><ThumbsUp size={14} /><span>Shortlist</span></button>
        <button type="button" disabled={isUpdating || currentStage === "rejected"} onClick={(event) => { event.stopPropagation(); onQuickAction(candidate, "rejected"); }} className="pipeline-action-button danger"><ThumbsDown size={14} /><span>Reject</span></button>
      </div>
    </div>
  );
}

export default function HRPipelinePage() {
  const [candidates, setCandidates] = useState([]);
  const [availableJds, setAvailableJds] = useState([]);
  const [selectedJdId, setSelectedJdId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingResultId, setUpdatingResultId] = useState(null);

  async function loadCandidates() {
    setLoading(true);
    setError("");
    try {
      let page = 1;
      let hasMore = true;
      let allCandidates = [];
      while (hasMore) {
        const response = await hrApi.listCandidates({ page, sort: "highest_score" });
        allCandidates = allCandidates.concat(response?.candidates || []);
        hasMore = Boolean(response?.has_next);
        page += 1;
      }

      const jds = await hrApi.listJds();
      const safeJds = Array.isArray(jds)
        ? jds
        : Array.isArray(jds?.jobs)
          ? jds.jobs
          : Array.isArray(jds?.jds)
            ? jds.jds
            : [];

      setAvailableJds(safeJds);
      setCandidates(Array.isArray(allCandidates) ? allCandidates.filter((item) => item?.result_id) : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load pipeline.");
      setCandidates([]);
      setAvailableJds([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCandidates();
  }, []);

  const filteredCandidates = useMemo(() => {
    if (selectedJdId === "all") return candidates;
    return candidates.filter((candidate) => getCandidateJdId(candidate) === String(selectedJdId));
  }, [candidates, selectedJdId]);

  const groupedCandidates = useMemo(() => {
    const groups = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, []]));
    for (const candidate of filteredCandidates) {
      const stageKey = normalizeStageKey(candidate?.interviewStatus?.key);
      groups[stageKey].push(candidate);
    }
    return groups;
  }, [filteredCandidates]);

  const totalCandidates = filteredCandidates.length;
  const stageCounts = useMemo(() => {
    const counts = {};
    PIPELINE_STAGES.forEach((stage) => { counts[stage.key] = 0; });
    filteredCandidates.forEach((candidate) => {
      const key = normalizeStageKey(candidate?.interviewStatus?.key);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [filteredCandidates]);

  function updateCandidateStageLocally(candidateId, nextStage) {
    const normalizedStage = normalizeStageKey(nextStage);
    setCandidates((current) => current.map((item) => item.result_id === candidateId ? {
      ...item,
      interviewStatus: {
        ...(item.interviewStatus || {}),
        key: normalizedStage,
        label: PIPELINE_STAGES.find((stage) => stage.key === normalizedStage)?.label || normalizedStage,
      },
    } : item));
  }

  async function persistStageChange(candidate, nextStage, notePrefix = "Updated from HR pipeline") {
    const normalizedStage = normalizeStageKey(nextStage);
    const currentStage = normalizeStageKey(candidate?.interviewStatus?.key);
    if (!candidate?.result_id || currentStage === normalizedStage) return;

    const previousCandidates = candidates;
    updateCandidateStageLocally(candidate.result_id, normalizedStage);
    setUpdatingResultId(candidate.result_id);
    setError("");

    try {
      await hrApi.updateCandidateStage(candidate.result_id, { stage: normalizedStage, note: `${notePrefix} to ${normalizedStage}.` });
      await loadCandidates();
    } catch (updateError) {
      setCandidates(previousCandidates);
      setError(updateError.message || "Failed to update candidate stage.");
    } finally {
      setUpdatingResultId(null);
    }
  }

  async function handleQuickAction(candidate, nextStage) {
    await persistStageChange(candidate, nextStage, "Updated from HR pipeline quick action");
  }

  if (loading) return <p className="center muted">Loading HR pipeline...</p>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 page-enter">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">HR Pipeline</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Drag candidates between ATS stages and manage the recruiting pipeline visually.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="pipeline-filter-wrap">
            <label htmlFor="pipeline-jd-filter" className="pipeline-filter-label">JD Filter</label>
            <select id="pipeline-jd-filter" value={selectedJdId} onChange={(event) => setSelectedJdId(event.target.value)} className="pipeline-filter-select">
              <option value="all">All JDs</option>
              {availableJds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
            </select>
          </div>
          <Link to="/hr/candidates" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"><Eye size={18} /><span>Candidate List</span></Link>
          <button type="button" onClick={loadCandidates} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none"><RefreshCw size={18} /><span>Refresh</span></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const IconComponent = STAGE_ICONS[stage.key] || Users;
          const count = stageCounts[stage.key] || 0;
          const colorClass = STAGE_COLORS[stage.tone] || STAGE_COLORS.secondary;
          return (
            <div key={stage.key} className={`card p-4 flex items-center gap-3 ${colorClass} ${count > 0 ? 'border' : ''}`}>
              <IconComponent size={20} className="text-slate-600 dark:text-slate-300" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stage.label}</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{count}</h3>
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="alert error">{error}</p> : null}
      {updatingResultId ? <p className="muted text-sm">Updating stage for result #{updatingResultId}...</p> : null}

      {!totalCandidates ? (
        <section className="card stack empty-state-card">
          <p className="eyebrow">Pipeline</p>
          <h3>{selectedJdId === "all" ? "No candidates available" : "No candidates for selected JD"}</h3>
          <p className="muted">{selectedJdId === "all" ? "Candidates will appear here once applications are available." : "Try another JD or switch back to All JDs."}</p>
        </section>
      ) : (
        <div className="space-y-6">
          {PIPELINE_STAGES.map((stage, index) => {
            const stageCandidates = groupedCandidates[stage.key] || [];
            const IconComponent = STAGE_ICONS[stage.key] || Users;
            const colorClass = STAGE_COLORS[stage.tone] || STAGE_COLORS.secondary;
            const count = stageCounts[stage.key] || 0;
            
            return (
              <div key={stage.key} className={`bg-white dark:bg-slate-900 rounded-2xl border overflow-hidden ${count > 0 ? colorClass : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${count > 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <IconComponent size={18} className={count > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-400"} />
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{stage.label}</h3>
                    <span className="px-2.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-full">{count}</span>
                  </div>
                  {count > 0 && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{count} candidate{count !== 1 ? 's' : ''}</span>}
                </div>
                {count > 0 ? (
                  <div className="p-4 bg-white dark:bg-slate-900">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {stageCandidates.map((candidate) => (
                        <CandidateCard key={candidate.result_id} candidate={candidate} onQuickAction={handleQuickAction} quickActionLoadingId={updatingResultId} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <p className="muted text-sm">No candidates in this stage yet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
