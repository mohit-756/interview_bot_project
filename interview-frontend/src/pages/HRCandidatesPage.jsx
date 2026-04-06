import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight, Eye, Trash2, ArrowUpDown, GitCompareArrows, CheckSquare, Layers, Users, UserCheck, UserPlus, Calendar, CheckCircle, UserMinus, XCircle } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import { hrApi } from "../services/api";
import { ATS_STAGE_DEFINITIONS, ATS_STAGE_OPTIONS } from "../utils/stages";
import { cn } from "../utils/utils";

function SortButton({ column, label, sortKey, onSort }) {
  return (
    <button type="button" onClick={() => onSort(column)} className="flex items-center space-x-1 hover:text-blue-600 transition-colors uppercase tracking-wider font-bold">
      <span>{label}</span>
      <ArrowUpDown size={12} className={cn(sortKey === column ? "text-blue-600" : "text-slate-400 opacity-50")} />
    </button>
  );
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function HRCandidatesPage() {
  const navigate = useNavigate();
  const [allCandidates, setAllCandidates] = useState([]);
  const [availableJds, setAvailableJds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jdFilter, setJdFilter] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "finalAIScore", direction: "desc" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [selectedForBulk, setSelectedForBulk] = useState([]);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const itemsPerPage = 10;

  const loadAllCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let pageNumber = 1;
      let hasMore = true;
      let candidates = [];

      while (hasMore) {
        const response = await hrApi.listCandidates({ page: pageNumber, sort: "highest_score" });
        candidates = candidates.concat(response.candidates || []);
        hasMore = response.has_next;
        pageNumber += 1;
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
      setAllCandidates(Array.isArray(candidates) ? candidates : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllCandidates(); }, [loadAllCandidates]);

  const jdOptions = useMemo(() => Array.isArray(availableJds) ? availableJds : [], [availableJds]);

  const filteredCandidates = useMemo(() => {
    return (Array.isArray(allCandidates) ? allCandidates : [])
      .filter((candidate) => {
        const name = String(candidate?.name || "").toLowerCase();
        const email = String(candidate?.email || "").toLowerCase();
        const candidateUid = String(candidate?.candidate_uid || "").toLowerCase();
        const role = String(candidate?.role || "").toLowerCase();
        const query = searchTerm.toLowerCase();
        const matchesSearch = !query || name.includes(query) || email.includes(query) || candidateUid.includes(query) || role.includes(query);
        const matchesStatus = statusFilter === "all" || candidate?.interviewStatus?.key === statusFilter;
        const assignedJdId = String(candidate?.assignedJd?.id || candidate?.job?.id || "");
        const matchesJd = jdFilter === "all" || assignedJdId === String(jdFilter);
        const finalScore = Number(candidate?.finalAIScore || 0);
        const matchesMin = minScore === "" || finalScore >= Number(minScore);
        const matchesMax = maxScore === "" || finalScore <= Number(maxScore);
        return matchesSearch && matchesStatus && matchesJd && matchesMin && matchesMax;
      })
      .sort((left, right) => {
        const leftValue = Number(left?.[sortConfig.key] || 0);
        const rightValue = Number(right?.[sortConfig.key] || 0);
        if (leftValue < rightValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (leftValue > rightValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
  }, [allCandidates, searchTerm, statusFilter, jdFilter, minScore, maxScore, sortConfig]);

  const stageCounts = useMemo(() => {
    const counts = {};
    ATS_STAGE_DEFINITIONS.forEach((stage) => { counts[stage.key] = 0; });
    allCandidates.forEach((candidate) => {
      const key = candidate?.interviewStatus?.key || "applied";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [allCandidates]);

  const totalCandidates = allCandidates.length;
  const filteredCount = filteredCandidates.length;

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const paginatedCandidates = filteredCandidates.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, jdFilter, minScore, maxScore, sortConfig]);
  useEffect(() => {
    setSelectedForCompare((prev) => (Array.isArray(prev) ? prev : []).filter((id) => filteredCandidates.some((candidate) => normalizeId(candidate?.result_id) === id)));
    setSelectedForBulk((prev) => (Array.isArray(prev) ? prev : []).filter((id) => filteredCandidates.some((candidate) => normalizeId(candidate?.result_id) === id)));
  }, [filteredCandidates]);

  const requestSort = (key) => {
    let direction = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") direction = "asc";
    setSortConfig({ key, direction });
  };

  async function handleDeleteCandidate(candidateUid) {
    if (!window.confirm("Are you sure you want to delete this candidate?")) return;
    try {
      await hrApi.deleteCandidate(candidateUid);
      await loadAllCandidates();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete candidate.");
    }
  }

  async function handleStageUpdate(resultId, stage) {
    const safeResultId = normalizeId(resultId);
    if (!safeResultId || !stage) return;
    try {
      await hrApi.updateCandidateStage(safeResultId, { stage, note: `Updated from candidate table to ${stage}.` });
      await loadAllCandidates();
    } catch (updateError) {
      setError(updateError.message || "Failed to update stage.");
    }
  }

  async function handleBulkStageUpdate(stage) {
    const safeStage = String(stage || bulkStage || "").trim();
    if (!safeStage || !selectedForBulk.length) return;
    setBulkLoading(true);
    setError("");
    try {
      await Promise.all(selectedForBulk.map((resultId) => hrApi.updateCandidateStage(resultId, { stage: safeStage, note: `Bulk updated from candidate table to ${safeStage}.` })));
      setSelectedForBulk([]);
      setBulkStage("");
      await loadAllCandidates();
    } catch (updateError) {
      setError(updateError.message || "Failed to update selected candidates.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleAssignJd(candidateUid, jdId) {
    if (!candidateUid || !jdId) return;
    try {
      await hrApi.assignCandidateToJd(candidateUid, Number(jdId));
      await loadAllCandidates();
    } catch (assignError) {
      setError(assignError.message || "Failed to assign candidate to JD.");
    }
  }

  function handleExportCsv() {
    const header = ["Candidate ID", "Name", "Email", "Assigned JD", "Match %", "Final Score", "Recommendation", "Stage"];
    const rows = filteredCandidates.map((candidate) => [
      candidate?.candidate_uid || "",
      candidate?.name || "",
      candidate?.email || "",
      candidate?.assignedJd?.title || candidate?.role || "–",
      candidate?.matchPercent || 0,
      candidate?.finalAIScore || 0,
      candidate?.recommendationTag || "–",
      candidate?.interviewStatus?.label || "–",
    ]);
    const csvContent = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "candidates.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleCompareSelection(candidate) {
    const resultId = normalizeId(candidate?.result_id);
    if (!resultId) return;

    setSelectedForCompare((prev) => {
      const normalizedPrev = (Array.isArray(prev) ? prev : []).filter(Boolean);
      if (normalizedPrev.includes(resultId)) return normalizedPrev.filter((id) => id !== resultId);
      if (normalizedPrev.length >= 3) return [...normalizedPrev.slice(1), resultId];
      return [...normalizedPrev, resultId];
    });
  }

  function toggleBulkSelection(candidate) {
    const resultId = normalizeId(candidate?.result_id);
    if (!resultId) return;
    setSelectedForBulk((prev) => prev.includes(resultId) ? prev.filter((id) => id !== resultId) : [...prev, resultId]);
  }

  function toggleSelectAllCurrentPage() {
    const pageIds = paginatedCandidates.map((candidate) => normalizeId(candidate?.result_id)).filter(Boolean);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedForBulk.includes(id));
    setSelectedForBulk((prev) => {
      const prevSet = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => prevSet.delete(id));
      } else {
        pageIds.forEach((id) => prevSet.add(id));
      }
      return Array.from(prevSet);
    });
  }

  function handleCompareNavigate() {
    if (selectedForCompare.length < 2) return;
    navigate(`/hr/compare?ids=${selectedForCompare.join(",")}`);
  }

  const pageIds = paginatedCandidates.map((candidate) => normalizeId(candidate?.result_id)).filter(Boolean);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedForBulk.includes(id));

  if (loading && !allCandidates.length) return <p className="center muted py-12">Loading candidates...</p>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 page-enter">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Directory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Review ATS scores, assigned JDs, pipeline stages, recommendations, compare candidates, and apply bulk actions safely.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={handleExportCsv} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"><Download size={20} /><span>Export CSV</span></button>
          <button type="button" onClick={() => loadAllCandidates()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none"><RefreshCw size={18} /><span>Refresh</span></button>
          <button type="button" onClick={handleCompareNavigate} disabled={selectedForCompare.length < 2} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"><GitCompareArrows size={18} /><span>Compare ({selectedForCompare.length})</span></button>
        </div>
      </div>

      {error ? <p className="alert error">{error}</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="card p-4 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <Users size={20} className="text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total</p>
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-300">{totalCandidates}</h3>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <UserCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Shortlisted</p>
            <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{stageCounts.shortlisted || 0}</h3>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <Calendar size={20} className="text-purple-600 dark:text-purple-400" />
          <div>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Interview Scheduled</p>
            <h3 className="text-xl font-bold text-purple-700 dark:text-purple-300">{stageCounts.interview_scheduled || 0}</h3>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CheckCircle size={20} className="text-slate-600 dark:text-slate-300" />
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Interview Completed</p>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">{stageCounts.interview_completed || 0}</h3>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <CheckCircle size={20} className="text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Selected</p>
            <h3 className="text-xl font-bold text-amber-700 dark:text-amber-300">{stageCounts.selected || 0}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input type="text" placeholder="Search by name, email, ID..." className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <select className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Stage: All</option>
              {ATS_STAGE_OPTIONS.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
            
            <select className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={jdFilter} onChange={(event) => setJdFilter(event.target.value)}>
              <option value="all">JD: All</option>
              {jdOptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
            </select>
            
            <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Min" className="w-20 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" />
            <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="Max" className="w-20 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" />
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden lg:block" />

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
              <CheckSquare size={16} />
              <span className="hidden sm:inline">Bulk:</span>
            </div>
            <button type="button" onClick={() => handleBulkStageUpdate("shortlisted")} disabled={!selectedForBulk.length || bulkLoading} className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-40 transition-all">Shortlist</button>
            <button type="button" onClick={() => handleBulkStageUpdate("rejected")} disabled={!selectedForBulk.length || bulkLoading} className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40 transition-all">Reject</button>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white">
              <option value="">Move to...</option>
              {ATS_STAGE_OPTIONS.filter((stage) => stage.value !== "applied").map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
            </select>
            {selectedForBulk.length > 0 && <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-bold">{selectedForBulk.length}</span>}
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Showing {paginatedCandidates.length} of {filteredCandidates.length} candidates</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"><ChevronLeft size={16} /></button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Page {safePage} of {totalPages}</span>
            <button type="button" disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black"><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllCurrentPage} /></th>
                <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Candidate</th>
                <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Assigned JD</th>
                <th className="px-4 py-3 min-w-[90px]"><SortButton column="resumeScore" label="Match %" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-4 py-3 min-w-[90px]"><SortButton column="finalAIScore" label="Final Score" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Stage</th>
                <th className="px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {!paginatedCandidates.length ? <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No candidates available.</td></tr> : paginatedCandidates.map((candidate) => {
                const resultId = normalizeId(candidate?.result_id);
                const compareSelectable = Boolean(resultId);
                const compareChecked = compareSelectable && selectedForCompare.includes(resultId);
                const bulkChecked = compareSelectable && selectedForBulk.includes(resultId);
                const candidateName = candidate?.name || "Unnamed candidate";
                const candidateUid = candidate?.candidate_uid || "No ID";
                const assignedJdTitle = candidate?.assignedJd?.title || candidate?.role || "Not assigned";
                const appCount = candidate?.application_count || 1;
                const isMultiApplicant = appCount > 1;
                return <tr key={candidateUid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-all group">
                  <td className="px-4 py-3"><input type="checkbox" checked={bulkChecked} onChange={() => toggleBulkSelection(candidate)} disabled={!compareSelectable} /></td>
                  <td className="px-4 py-3"><input type="checkbox" checked={compareChecked} onChange={() => toggleCompareSelection(candidate)} disabled={!compareSelectable || (!compareChecked && selectedForCompare.length >= 3)} /></td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{candidateName}</p>
                        {isMultiApplicant && <span title={`Applied to ${appCount} positions`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold"><Layers size={10} />{appCount}</span>}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{candidateUid}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{candidate?.email || "No email"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{assignedJdTitle}</p>
                      <select value="" onChange={(e) => e.target.value && handleAssignJd(candidate?.candidate_uid, e.target.value)} className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <option value="">Assign JD</option>
                        {jdOptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={candidate?.matchPercent || 0} /></td>
                  <td className="px-4 py-3"><ScoreBadge score={candidate?.finalAIScore || 0} /></td>
                  <td className="px-4 py-3">{candidate?.recommendationTag || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={candidate?.interviewStatus} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/hr/candidates/${candidate?.candidate_uid}`} className="text-blue-600 hover:underline text-sm font-medium">View</Link>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
