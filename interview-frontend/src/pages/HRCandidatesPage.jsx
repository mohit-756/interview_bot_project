import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight, Eye, Trash2, ArrowUpDown, GitCompareArrows } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import { hrApi } from "../services/api";
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
        const query = searchTerm.toLowerCase();
        const matchesSearch = !query || name.includes(query) || email.includes(query) || candidateUid.includes(query);
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
      })
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }, [allCandidates, searchTerm, statusFilter, jdFilter, minScore, maxScore, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const paginatedCandidates = filteredCandidates.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, jdFilter, minScore, maxScore, sortConfig]);
  useEffect(() => {
    setSelectedForCompare((prev) => (Array.isArray(prev) ? prev : []).filter((id) => filteredCandidates.some((candidate) => normalizeId(candidate?.result_id) === id)));
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
    const header = ["Candidate ID", "Name", "Email", "Assigned JD", "Rank", "Match %", "Final Score", "Recommendation", "Stage"];
    const rows = filteredCandidates.map((candidate) => [
      candidate?.candidate_uid || "",
      candidate?.name || "",
      candidate?.email || "",
      candidate?.assignedJd?.title || candidate?.role || "–",
      candidate?.rank || "–",
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

  function handleCompareNavigate() {
    if (selectedForCompare.length < 2) return;
    navigate(`/hr/compare?ids=${selectedForCompare.join(",")}`);
  }

  if (loading && !allCandidates.length) return <p className="center muted py-12">Loading candidates...</p>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Directory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Review ATS scores, assigned JDs, pipeline stages, recommendations, and compare top candidates.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={handleExportCsv} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"><Download size={20} /><span>Export CSV</span></button>
          <button type="button" onClick={() => loadAllCandidates()} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none"><RefreshCw size={18} /><span>Refresh</span></button>
          <button type="button" onClick={handleCompareNavigate} disabled={selectedForCompare.length < 2} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"><GitCompareArrows size={18} /><span>Compare ({selectedForCompare.length})</span></button>
        </div>
      </div>

      {error ? <p className="alert error">{error}</p> : null}

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative lg:col-span-2"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" /><input type="text" placeholder="Search by name, email, or ID..." className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
          <select className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Stage: All</option><option value="applied">Applied</option><option value="screening">Screening</option><option value="shortlisted">Shortlisted</option><option value="interview_scheduled">Interview Scheduled</option><option value="interview_completed">Interview Completed</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select>
          <select className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" value={jdFilter} onChange={(event) => setJdFilter(event.target.value)}><option value="all">Assigned JD: All</option>{jdOptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}</select>
          <input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="Min score" className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" />
          <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="Max score" className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white" />
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Showing {paginatedCandidates.length} of {filteredCandidates.length} candidates</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Compare</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Candidate</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Assigned JD</th>
                <th className="px-6 py-5 min-w-[110px]"><SortButton column="resumeScore" label="Match %" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[110px] bg-blue-50/20 dark:bg-blue-900/10"><SortButton column="finalAIScore" label="Final Score" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Recommendation</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Stage</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {!paginatedCandidates.length ? <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No candidates available.</td></tr> : paginatedCandidates.map((candidate) => {
                const resultId = normalizeId(candidate?.result_id);
                const selectable = Boolean(resultId);
                const checked = selectable && selectedForCompare.includes(resultId);
                const candidateName = candidate?.name || "Unnamed candidate";
                const candidateUid = candidate?.candidate_uid || "No ID";
                const assignedJdTitle = candidate?.assignedJd?.title || candidate?.role || "Not assigned";
                return <tr key={candidateUid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-all group"><td className="px-6 py-4"><input type="checkbox" checked={checked} onChange={() => toggleCompareSelection(candidate)} disabled={!selectable || (!checked && selectedForCompare.length >= 3)} /></td><td className="px-6 py-4"><div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white truncate">{candidateName}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{candidateUid}</p><p className="text-xs text-slate-500 dark:text-slate-400 truncate">{candidate?.email || "No email"}</p></div></td><td className="px-6 py-4"><div className="space-y-2"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{assignedJdTitle}</p><select value="" onChange={(e) => e.target.value && handleAssignJd(candidate?.candidate_uid, e.target.value)} className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"><option value="">Assign to JD</option>{jdOptions.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}</select></div></td><td className="px-6 py-4"><div className="space-y-1"><ScoreBadge score={candidate?.matchPercent || 0} /><p className="text-[11px] text-slate-500 dark:text-slate-400">Match: {candidate?.matchPercent || 0}%</p></div></td><td className="px-6 py-4 bg-blue-50/20 dark:bg-blue-900/5"><ScoreBadge score={candidate?.finalAIScore || 0} className="scale-110 shadow-sm" /></td><td className="px-6 py-4"><StatusBadge status={candidate?.finalDecision} /></td><td className="px-6 py-4"><StatusBadge status={candidate?.interviewStatus} /></td><td className="px-6 py-4 text-right"><div className="flex items-center justify-end space-x-2"><Link to={`/hr/candidates/${candidateUid}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"><Eye size={18} /></Link><select value="" onChange={(e) => e.target.value && handleStageUpdate(candidate?.result_id, e.target.value)} className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"><option value="">Move</option><option value="screening">Screening</option><option value="shortlisted">Shortlisted</option><option value="interview_scheduled">Interview Scheduled</option><option value="interview_completed">Interview Completed</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select><button type="button" onClick={() => handleDeleteCandidate(candidateUid)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"><Trash2 size={18} /></button></div></td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-slate-50/30 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between"><p className="text-sm font-medium text-slate-500">Showing <span className="text-slate-900 dark:text-white">{paginatedCandidates.length}</span> per page</p><div className="flex items-center space-x-2"><button type="button" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"><ChevronLeft size={20} /></button><div className="flex items-center space-x-1 px-4"><span className="text-sm font-black text-slate-900 dark:text-white">Page {safePage}</span><span className="text-sm text-slate-400">of {totalPages}</span></div><button type="button" disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"><ChevronRight size={20} /></button></div></div>
      </div>
    </div>
  );
}
