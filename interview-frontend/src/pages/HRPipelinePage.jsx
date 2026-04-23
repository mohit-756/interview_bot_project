import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, RefreshCw, ThumbsDown, ThumbsUp, Users, Calendar, CheckCircle, XCircle, Filter, Search } from "lucide-react";
import ScoreBadge from "../components/ScoreBadge";
import PageHeader from "../components/PageHeader";
import { hrApi } from "../services/api";
import { ATS_STAGE_DEFINITIONS as PIPELINE_STAGES, normalizeStageKey } from "../utils/stages";

function CandidateCard({ candidate, onQuickAction, quickActionLoadingId, showJob = false }) {
  const score = Math.round(Number(candidate.finalAIScore || candidate.score || 0));
  const isLoading = quickActionLoadingId === candidate.result_id;
  const jobTitle = candidate?.assignedJd?.title || candidate?.job?.title || candidate?.role || "-";

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900 dark:text-white truncate">{candidate.name || "Unnamed"}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{candidate.email}</p>
        </div>
        {showJob && (
          <div className="w-40 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{jobTitle}</p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-lg text-sm font-bold min-w-[60px] text-center ${score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : score >= 65 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {score}%
          </span>
          {isLoading ? (
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => onQuickAction(candidate, 'shortlisted')} className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg text-emerald-600 transition-colors" title="Shortlist">
                <ThumbsUp size={18} />
              </button>
              <button onClick={() => onQuickAction(candidate, 'rejected')} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 transition-colors" title="Reject">
                <ThumbsDown size={18} />
              </button>
              <Link to={`/hr/candidates/${candidate.candidate_uid}`} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 transition-colors" title="View Details">
                <Eye size={18} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STAGE_ICONS = {
  applied: Users,
  screening: Filter,
  shortlisted: ThumbsUp,
  interview_scheduled: Calendar,
  interview_completed: CheckCircle,
  selected: CheckCircle,
  rejected: XCircle,
};

const STAGE_COLORS = {
  applied: { bg: "bg-slate-100 dark:bg-slate-800", border: "border-slate-300 dark:border-slate-700", text: "text-slate-600 dark:text-slate-300", pill: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" },
  screening: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400", pill: "bg-blue-200 dark:bg-blue-800 text-blue-600 dark:text-blue-300" },
  shortlisted: { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-600 dark:text-emerald-400", pill: "bg-emerald-200 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300" },
  interview_scheduled: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700", text: "text-amber-600 dark:text-amber-400", pill: "bg-amber-200 dark:bg-amber-800 text-amber-600 dark:text-amber-300" },
  interview_completed: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", text: "text-blue-600 dark:text-blue-400", pill: "bg-blue-200 dark:bg-blue-800 text-blue-600 dark:text-blue-300" },
  selected: { bg: "bg-purple-50 dark:bg-purple-900/20", border: "border-purple-300 dark:border-purple-700", text: "text-purple-600 dark:text-purple-400", pill: "bg-purple-200 dark:bg-purple-800 text-purple-600 dark:text-purple-300" },
  rejected: { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-300 dark:border-red-700", text: "text-red-600 dark:text-red-400", pill: "bg-red-200 dark:bg-red-800 text-red-600 dark:text-red-300" },
};

function StageIcon({ stage, colors }) {
  if (!stage) return null;
  const Icon = STAGE_ICONS[stage];
  if (!Icon) return <Users size={14} className={colors?.text} />;
  return <Icon size={14} className={colors?.text} />;
}

function getCandidateJdId(candidate) {
  const jdId = candidate?.assignedJd?.id ?? candidate?.job?.id ?? null;
  return jdId == null ? "" : String(jdId);
}

function CandidateRow({ candidate, onQuickAction, quickActionLoadingId }) {
  const currentStage = normalizeStageKey(candidate?.status?.key);
  const isUpdating = quickActionLoadingId === candidate?.result_id;
  const stageColors = STAGE_COLORS[currentStage] || STAGE_COLORS.applied;

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{candidate?.name || "Unnamed"}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{candidate?.candidate_uid || "No ID"}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <ScoreBadge score={candidate?.finalAIScore || 0} />
      </td>
      <td className="px-4 py-3">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${stageColors.bg} ${stageColors.border} ${stageColors.text}`}>
          {candidate?.status?.label || currentStage}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        {candidate?.assignedJd?.title || candidate?.role || "—"}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
        {candidate?.created_at ? new Date(candidate.created_at).toLocaleDateString() : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to={`/hr/candidates/${candidate?.candidate_uid}`} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500 transition-all" title="View Details">
            <Eye size={14} />
          </Link>
          <button type="button" disabled={isUpdating || currentStage === "shortlisted"} onClick={(event) => { event.stopPropagation(); onQuickAction(candidate, "shortlisted"); }} className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all disabled:opacity-50" title="Shortlist">
            <ThumbsUp size={14} />
          </button>
          <button type="button" disabled={isUpdating || currentStage === "rejected"} onClick={(event) => { event.stopPropagation(); onQuickAction(candidate, "rejected"); }} className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all disabled:opacity-50" title="Reject">
            <ThumbsDown size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function HRPipelinePage() {
  const [candidates, setCandidates] = useState([]);
  const [availableJds, setAvailableJds] = useState([]);
  const [selectedJdId, setSelectedJdId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingResultId, setUpdatingResultId] = useState(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState(null);
  const stageSidebarRef = useRef(null);

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
    let result = candidates;
    if (selectedJdId !== "all") {
      result = result.filter((candidate) => getCandidateJdId(candidate) === String(selectedJdId));
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((candidate) => 
        candidate?.name?.toLowerCase().includes(query) ||
        candidate?.candidate_uid?.toLowerCase().includes(query) ||
        candidate?.assignedJd?.title?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [candidates, selectedJdId, searchQuery]);

  const groupedCandidates = useMemo(() => {
    const groups = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, []]));
    for (const candidate of filteredCandidates) {
      const stageKey = normalizeStageKey(candidate?.status?.key);
      if (groups[stageKey]) {
        groups[stageKey].push(candidate);
      }
    }
    return groups;
  }, [filteredCandidates]);

  const totalCandidates = filteredCandidates.length;
  const stageCounts = useMemo(() => {
    const counts = {};
    PIPELINE_STAGES.forEach((stage) => { counts[stage.key] = 0; });
    filteredCandidates.forEach((candidate) => {
      const key = normalizeStageKey(candidate?.status?.key);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [filteredCandidates]);

  const totalPages = Math.max(1, Math.ceil(totalCandidates / itemsPerPage));
  const paginatedCandidates = filteredCandidates.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => { setPage(1); }, [selectedJdId, itemsPerPage, searchQuery]);

  function updateCandidateStageLocally(candidateId, nextStage) {
    const normalizedStage = normalizeStageKey(nextStage);
    setCandidates((current) => current.map((item) => item.result_id === candidateId ? {
      ...item,
      status: {
        key: normalizedStage,
        label: PIPELINE_STAGES.find((stage) => stage.key === normalizedStage)?.label || normalizedStage,
        tone: PIPELINE_STAGES.find((stage) => stage.key === normalizedStage)?.tone || "secondary",
      },
    } : item));
  }

  async function persistStageChange(candidate, nextStage, notePrefix = "Updated from HR pipeline") {
    const normalizedStage = normalizeStageKey(nextStage);
    const currentStage = normalizeStageKey(candidate?.status?.key);
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

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-500 dark:text-slate-400">Loading pipeline...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">HR Pipeline</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage candidates through hiring stages</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
          </div>
          {/* JD Filter */}
          <select value={selectedJdId} onChange={(event) => setSelectedJdId(event.target.value)} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Jobs ({totalCandidates})</option>
            {availableJds.map((jd) => {
              const jdCount = candidates.filter(c => getCandidateJdId(c) === String(jd.id)).length;
              return <option key={jd.id} value={jd.id}>{jd.title} ({jdCount})</option>;
            })}
          </select>
          <Link to="/hr/candidates" className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
            <Eye size={14} className="inline mr-1" /> List
          </Link>
          <button type="button" onClick={loadCandidates} className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stage Cards - Larger Dashboard Style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {PIPELINE_STAGES.map((stage) => {
          const IconComponent = STAGE_ICONS[stage.key] || Users;
          const count = stageCounts[stage.key] || 0;
          const colors = STAGE_COLORS[stage.key] || STAGE_COLORS.applied;
          const isActive = selectedStage === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => count > 0 ? setSelectedStage(isActive ? null : stage.key) : null}
              className={`p-4 rounded-xl border-2 transition-all ${isActive ? `${colors.border} ${colors.bg}` : 'border-transparent bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700'} ${count === 0 ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <div className={`p-2 w-fit rounded-lg mb-2 ${colors.bg}`}>
                <IconComponent size={20} className={colors.text} />
              </div>
              <p className={`text-base font-semibold ${isActive ? colors.text : 'text-slate-700 dark:text-slate-300'}`}>{stage.label}</p>
              <p className={`text-2xl font-bold ${isActive ? colors.text : 'text-slate-900 dark:text-white'}`}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">{error}</div>}
      {updatingResultId && <p className="text-sm text-slate-500 dark:text-slate-400">Updating...</p>}

      {/* Pipeline View - All Candidates by Default */}
      {!totalCandidates ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Users size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-lg text-slate-900 dark:text-white font-medium">{selectedJdId === "all" ? "No candidates yet" : "No candidates for this job"}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Candidates will appear once applications come in.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">All Candidates</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{totalCandidates} total candidate{totalCandidates !== 1 ? 's' : ''}{selectedJdId !== "all" ? ` for ${availableJds.find(j => j.id === selectedJdId)?.title || 'selected job'}` : ''}</p>
              </div>
              {selectedStage && (
                <button onClick={() => setSelectedStage(null)} className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          {/* Column Headers */}
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <div className="flex-1">Candidate</div>
              <div className="w-40 text-center">Job Applied</div>
              <div className="w-20 text-center">Score</div>
              <div className="w-28 text-center">Actions</div>
            </div>
          </div>

          {/* Candidates List */}
          <div className="p-6">
            <div className="space-y-3">
              {(selectedStage ? groupedCandidates[selectedStage] : filteredCandidates)?.map((candidate) => (
                <CandidateCard key={candidate.result_id} candidate={candidate} onQuickAction={handleQuickAction} quickActionLoadingId={updatingResultId} showJob={true} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}