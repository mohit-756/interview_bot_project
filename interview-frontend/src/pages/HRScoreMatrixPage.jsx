import React, { useMemo, useState } from "react";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Trash2, 
  ArrowUpDown,
  Table as TableIcon,
  LayoutGrid,
  MoreVertical,
  Users,
  Target,
  BarChart3,
  CheckCircle2,
  FileText
} from "lucide-react";
import { Link } from "react-router-dom";
import { mockCandidates, mockStats } from "../data/mockData";
import StatusBadge from "../components/StatusBadge";
import ScoreBadge from "../components/ScoreBadge";
import ScoreProgressCell from "../components/ScoreProgressCell";
import MetricCard from "../components/MetricCard";
import { cn } from "../utils/utils";

function SortButton({ column, label, sortKey, onSort }) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="flex items-center space-x-1 hover:text-blue-600 transition-colors uppercase tracking-wider font-bold"
    >
      <span>{label}</span>
      <ArrowUpDown size={12} className={cn(sortKey === column ? "text-blue-600" : "text-slate-400 opacity-50")} />
    </button>
  );
}

export default function HRScoreMatrixPage() {
  const [view, setView] = useState("table"); // 'table' or 'matrix'
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "finalAIScore", direction: "desc" });
  const [page, setPage] = useState(1);
  const itemsPerPage = 8;

  // Roles for filter
  const roles = useMemo(() => {
    return ["all", ...new Set(mockCandidates.map(c => c.role))];
  }, []);

  // Filter & Search Logic
  const filteredCandidates = useMemo(() => {
    return mockCandidates
      .filter(c => {
        const matchesSearch = 
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === "all" || c.role === roleFilter;
        const matchesStatus = statusFilter === "all" || c.interviewStatus === statusFilter;
        const matchesDecision = decisionFilter === "all" || c.finalDecision === decisionFilter;
        return matchesSearch && matchesRole && matchesStatus && matchesDecision;
      })
      .sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === "asc" ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
  }, [searchTerm, roleFilter, statusFilter, decisionFilter, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);
  const paginatedCandidates = filteredCandidates.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const requestSort = (key) => {
    let direction = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Score Matrix</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Compare candidates across resume, semantic, and interview evaluation metrics.
          </p>
        </div>
        <div className="flex p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <button 
            onClick={() => setView("table")}
            className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              view === "table" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <TableIcon size={18} />
            <span>Table View</span>
          </button>
          <button 
            onClick={() => setView("matrix")}
            className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              view === "matrix" ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <LayoutGrid size={18} />
            <span>Matrix View</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="Total Candidates" value={mockCandidates.length} icon={Users} color="blue" />
        <MetricCard title="Avg Resume Score" value={`${mockStats.avgResumeScore}%`} icon={FileText} color="purple" />
        <MetricCard title="Avg Interview Score" value={`${mockStats.avgInterviewScore}%`} icon={Target} color="green" />
        <MetricCard title="Top Final Score" value={`${mockStats.topFinalScore}%`} icon={BarChart3} color="yellow" />
        <MetricCard title="Shortlisted Count" value={mockCandidates.filter(c => c.finalDecision === 'Shortlisted').length} icon={CheckCircle2} color="green" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search by name, email, ID..." 
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select 
            className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white capitalize"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            {roles.map(role => <option key={role} value={role}>{role === 'all' ? 'All Roles' : role}</option>)}
          </select>

          <select 
            className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Interview Status: All</option>
            <option value="Completed">Completed</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Not Started">Not Started</option>
          </select>

          <select 
            className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
          >
            <option value="all">Decision: All</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Rejected">Rejected</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest pl-1">
          Showing {paginatedCandidates.length} of {filteredCandidates.length} matching candidates
        </p>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Candidate Info</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Applied Role</th>
                
                {/* Score Columns */}
                <th className="px-6 py-5 min-w-[120px]"><SortButton column="semanticScore" label="Semantic" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[120px]"><SortButton column="resumeScore" label="Resume" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[120px]"><SortButton column="interviewScore" label="Interview" sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[120px]"><SortButton column="communicationScore" label="Comm." sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[120px]"><SortButton column="confidenceScore" label="Conf." sortKey={sortConfig.key} onSort={requestSort} /></th>
                <th className="px-6 py-5 min-w-[120px] bg-blue-50/20 dark:bg-blue-900/10"><SortButton column="finalAIScore" label="Final AI" sortKey={sortConfig.key} onSort={requestSort} /></th>
                
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Decision</th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {paginatedCandidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-all group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden ring-2 ring-transparent group-hover:ring-blue-100 dark:group-hover:ring-blue-900 transition-all">
                        <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{c.role}</p>
                  </td>
                  
                  {/* Score Cells */}
                  <td className="px-6 py-4">
                    {view === 'matrix' ? <ScoreProgressCell score={c.semanticScore} /> : <ScoreBadge score={c.semanticScore} />}
                  </td>
                  <td className="px-6 py-4">
                    {view === 'matrix' ? <ScoreProgressCell score={c.resumeScore} /> : <ScoreBadge score={c.resumeScore} />}
                  </td>
                  <td className="px-6 py-4">
                    {view === 'matrix' ? <ScoreProgressCell score={c.interviewScore} /> : <ScoreBadge score={c.interviewScore} />}
                  </td>
                  <td className="px-6 py-4">
                    {view === 'matrix' ? <ScoreProgressCell score={c.communicationScore} /> : <ScoreBadge score={c.communicationScore} />}
                  </td>
                  <td className="px-6 py-4">
                    {view === 'matrix' ? <ScoreProgressCell score={c.confidenceScore} /> : <ScoreBadge score={c.confidenceScore} />}
                  </td>
                  <td className="px-6 py-4 bg-blue-50/20 dark:bg-blue-900/5">
                    {view === 'matrix' ? <ScoreProgressCell score={c.finalAIScore} /> : <ScoreBadge score={c.finalAIScore} className="scale-110 shadow-sm" />}
                  </td>
                  
                  <td className="px-6 py-4">
                    <StatusBadge status={c.finalDecision} />
                  </td>
                  
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center space-x-2">
                      <Link to={`/hr/candidates/${c.uid}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all">
                        <Eye size={18} />
                      </Link>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all">
                        <Trash2 size={18} />
                      </button>
                      <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-6 bg-slate-50/30 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">
            Showing <span className="text-slate-900 dark:text-white">{paginatedCandidates.length}</span> candidates per page
          </p>
          <div className="flex items-center space-x-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center space-x-1 px-4">
              <span className="text-sm font-black text-slate-900 dark:text-white">Page {page}</span>
              <span className="text-sm text-slate-400">of {totalPages}</span>
            </div>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
