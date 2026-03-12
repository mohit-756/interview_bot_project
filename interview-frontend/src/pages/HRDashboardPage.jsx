import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Users, 
  UserCheck, 
  UserX, 
  Calendar, 
  CheckCircle2, 
  Search, 
  Filter, 
  Plus
} from "lucide-react";
import MetricCard from "../components/MetricCard";
import CandidateTable from "../components/CandidateTable";
import { mockCandidates, mockStats } from "../data/mockData";

export default function HRDashboardPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [candidates, setCandidates] = useState(mockCandidates);

  const filteredCandidates = useMemo(() => candidates.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.interviewStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }), [candidates, searchTerm, statusFilter]);

  function handleDeleteCandidate(candidate) {
    setCandidates((currentCandidates) => currentCandidates.filter((entry) => entry.uid !== candidate.uid));
  }

  function handleScheduleCandidate(candidate) {
    navigate(`/hr/candidates/${candidate.uid}`);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">HR Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Monitor your recruitment pipeline and candidate performance.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/hr/candidates")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none"
        >
          <Plus size={20} />
          <span>Manage Candidates</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard 
          title="Total Candidates" 
          value={mockStats.totalCandidates} 
          icon={Users} 
          trend="up" 
          trendValue="12%" 
          color="blue" 
        />
        <MetricCard 
          title="Shortlisted" 
          value={mockStats.shortlisted} 
          icon={UserCheck} 
          trend="up" 
          trendValue="8%" 
          color="green" 
        />
        <MetricCard 
          title="Rejected" 
          value={mockStats.rejected} 
          icon={UserX} 
          trend="down" 
          trendValue="5%" 
          color="red" 
        />
        <MetricCard 
          title="Interviews Scheduled" 
          value={mockStats.interviewsScheduled} 
          icon={Calendar} 
          color="purple" 
        />
        <MetricCard 
          title="Interviews Completed" 
          value={mockStats.interviewsCompleted} 
          icon={CheckCircle2} 
          color="yellow" 
        />
      </div>

      {/* Main Content Area */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent Candidates</h2>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search candidates..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative w-full sm:w-40">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <select 
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none dark:text-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
          </div>
        </div>
        
        <CandidateTable
          candidates={filteredCandidates}
          onDeleteCandidate={handleDeleteCandidate}
          onScheduleCandidate={handleScheduleCandidate}
        />
        
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">Showing {filteredCandidates.length} of {candidates.length} candidates</p>
          <div className="flex items-center space-x-2">
            <button className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50" disabled>Previous</button>
            <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
