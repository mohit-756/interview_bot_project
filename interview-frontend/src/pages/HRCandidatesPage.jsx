import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Download, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import CandidateTable from "../components/CandidateTable";
import { mockCandidates } from "../data/mockData";

export default function HRCandidatesPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [candidates, setCandidates] = useState(mockCandidates);

  const filteredCandidates = useMemo(() => candidates.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.interviewStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }), [candidates, searchTerm, statusFilter]);

  function handleDeleteCandidate(candidate) {
    setCandidates((currentCandidates) => currentCandidates.filter((entry) => entry.uid !== candidate.uid));
  }

  function handleScheduleCandidate(candidate) {
    navigate(`/hr/candidates/${candidate.uid}`);
  }

  function handleExportCsv() {
    const header = ["ID", "Name", "Email", "Role", "Resume Score", "Interview Status", "Final Decision"];
    const rows = filteredCandidates.map((candidate) => [
      candidate.id,
      candidate.name,
      candidate.email,
      candidate.role,
      candidate.resumeScore,
      candidate.interviewStatus,
      candidate.finalDecision,
    ]);
    const csvContent = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "candidates.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Directory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and review all applicants across all positions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <Download size={20} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setCandidates((currentCandidates) => [
              {
                id: `CAN-${String(currentCandidates.length + 1).padStart(3, "0")}`,
                uid: `user-${String(currentCandidates.length + 1).padStart(3, "0")}`,
                name: "New Candidate",
                email: `new.candidate${currentCandidates.length + 1}@example.com`,
                role: "Frontend Engineer",
                resumeStatus: "Pending",
                resumeScore: 0,
                interviewStatus: "Pending",
                finalDecision: "Pending",
                appliedDate: "2026-03-10",
                experience: "0 years",
                skills: [],
                missingSkills: ["Resume required"],
                strengths: ["Awaiting review"],
                weaknesses: ["Not yet assessed"],
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=New${currentCandidates.length + 1}`,
              },
              ...currentCandidates,
            ])}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none"
          >
            <UserPlus size={20} />
            <span>Add Candidate</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search by ID, name, or email..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-48">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select 
              className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none dark:text-white font-medium"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="Analyzed">Analyzed</option>
              <option value="Pending">Pending</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          
          <select className="px-6 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium">
            <option>Latest Applied</option>
            <option>Score: High to Low</option>
            <option>Score: Low to High</option>
            <option>Name: A-Z</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <CandidateTable
          candidates={filteredCandidates}
          onDeleteCandidate={handleDeleteCandidate}
          onScheduleCandidate={handleScheduleCandidate}
        />
        
        {/* Pagination */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Showing <span className="text-slate-900 dark:text-white">{filteredCandidates.length}</span> candidates
          </p>
          <div className="flex items-center space-x-2">
            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all border border-slate-200 dark:border-slate-800 disabled:opacity-30" disabled>
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center space-x-1">
              <button className="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold shadow-md shadow-blue-100">1</button>
              <button className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold transition-all">2</button>
              <button className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold transition-all">3</button>
            </div>
            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all border border-slate-200 dark:border-slate-800">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
