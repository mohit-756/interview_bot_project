import { useCallback, useEffect, useMemo, useState } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, UserX, CheckCircle2, Plus, BarChart3, Sparkles, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import MetricCard from "../components/MetricCard";
import CandidateTable from "../components/CandidateTable";
import StatusBadge from "../components/StatusBadge";
import PageHeader from "../components/PageHeader";
import { hrApi } from "../services/api";

const CHART_COLORS = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];
const EMPTY_LIST = [];

function ChartCard({ title, subtitle, accent, children }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${accent ? `chart-card-accent ${accent}` : ""}`}>
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p> : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function HRDashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [ranked, setRanked] = useState([]);
  const [candidatesData, setCandidatesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [tableError, setTableError] = useState("");

  const overview = dashboard?.analytics?.overview || {};
  const pipeline = dashboard?.analytics?.pipeline ?? EMPTY_LIST;
  const funnel = dashboard?.analytics?.funnel ?? EMPTY_LIST;
  const scorePerJd = dashboard?.analytics?.avg_score_per_jd ?? EMPTY_LIST;
  const topSkills = dashboard?.analytics?.top_matched_skills ?? EMPTY_LIST;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setDashboardError("");
    try {
      const [dashboardResponse, rankedResponse] = await Promise.all([
        hrApi.dashboard(),
        hrApi.rankedCandidates({ limit: 5 }),
      ]);
      setDashboard(dashboardResponse);
      setRanked(rankedResponse?.candidates || []);
    } catch (loadError) {
      setDashboardError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setTableLoading(true);
    setTableError("");
    try {
      const response = await hrApi.listCandidates({ page: 1, sort: "highest_score" });
      setCandidatesData(response);
    } catch (loadError) {
      setTableError(loadError.message);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  async function handleDeleteCandidate(candidate) {
    try {
      await hrApi.deleteCandidate(candidate.uid || candidate.candidate_uid);
      await loadCandidates();
      await loadDashboard();
    } catch (deleteError) {
      setDashboardError(deleteError.message);
    }
  }

  function handleScheduleCandidate(candidate) {
    navigate(`/hr/candidates/${candidate.uid || candidate.candidate_uid}`);
  }

  const chartReadyFunnel = useMemo(() => funnel.map((item) => ({ name: item.label, value: item.count, fill: CHART_COLORS[0] })), [funnel]);
  const chartReadyJdScores = useMemo(() => scorePerJd.map((item) => ({ name: item.job_title, score: Math.round(Number(item.avg_score || 0)), count: item.candidate_count || 0 })), [scorePerJd]);
  const chartReadySkills = useMemo(() => topSkills.map((item, index) => ({ ...item, fill: CHART_COLORS[index % CHART_COLORS.length] })), [topSkills]);

  if (loading && !dashboard) return <p className="center muted">Loading HR dashboard...</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Dashboard"
        subtitle="Production-style ATS analytics, rankings, funnel health, and recent candidate activity."
        actions={(
          <>
            <button type="button" onClick={() => navigate("/hr/compare")} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
              Compare Candidates
            </button>
            <button type="button" onClick={() => navigate("/hr/candidates")} className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white px-5 py-2.5 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30">
              <Plus size={20} />
              <span>Manage Candidates</span>
            </button>
          </>
        )}
      />

      {dashboardError ? <p className="alert error">{dashboardError}</p> : null}
      {tableError ? <p className="alert error">{tableError}</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 page-enter-delay-1">
        <MetricCard title="Total Candidates" value={overview.total_candidates || 0} icon={Users} color="blue" />
        <MetricCard title="Shortlisted" value={overview.shortlisted_count || 0} icon={UserCheck} color="green" />
        <MetricCard title="Rejected" value={overview.rejected_count || 0} icon={UserX} color="red" />
        <MetricCard title="Interview Completed" value={overview.completed_interviews || 0} icon={CheckCircle2} color="yellow" />
        <MetricCard title="Selection Rate" value={`${Math.round(Number(overview.selection_rate || 0))}%`} icon={Sparkles} color="purple" />
        <MetricCard title="Interview Success" value={`${Math.round(Number(overview.interview_success_rate || 0))}%`} icon={TrendingUp} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 page-enter-delay-2">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartCard title="Hiring Funnel" subtitle="Applied → shortlisted → interview completed → selected" accent="blue">
              {!chartReadyFunnel.length ? <p className="muted">No funnel data yet.</p> : <div className="ats-chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartReadyFunnel} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div>}
            </ChartCard>

            <ChartCard title="Selection Quality" subtitle="Core ATS conversion indicators" accent="purple">
              <div className="metric-grid compact">
                <MetricCard title="Avg Score" value={`${Math.round(Number(overview.avg_interview_score || 0))}%`} icon={BarChart3} color="purple" />
                <MetricCard title="Selection Rate" value={`${Math.round(Number(overview.selection_rate || 0))}%`} icon={Sparkles} color="blue" />
                <MetricCard title="Interview Success" value={`${Math.round(Number(overview.interview_success_rate || 0))}%`} icon={TrendingUp} color="green" />
                <MetricCard title="Interview Completion" value={`${Math.round(Number(overview.interview_completion_rate || 0))}%`} icon={CheckCircle2} color="yellow" />
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Average Score per JD" subtitle="Compare ATS score trends across job descriptions" accent="green">
            {!chartReadyJdScores.length ? <p className="muted">No JD score data yet.</p> : <div className="ats-chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartReadyJdScores}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={60} /><YAxis /><Tooltip /><Bar dataKey="score" radius={[10, 10, 0, 0]} fill="#10b981" /></BarChart></ResponsiveContainer></div>}
          </ChartCard>

          <ChartCard title="Top Ranked Candidates" subtitle="Final weighted ATS score sorted across current applications.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!ranked.length ? <p className="text-sm text-slate-500 dark:text-slate-400">No ranked candidates yet.</p> : ranked.map((candidate) => {
                const score = Math.round(Number(candidate.finalAIScore || candidate.score || 0));
                const scoreColor = score >= 80 ? "green" : score >= 65 ? "blue" : "red";
                return (
                  <div key={candidate.result_id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 card-hover-lift">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">#{candidate.rank || "-"} {candidate.name}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{candidate.candidate_uid}</p>
                      </div>
                      <StatusBadge status={candidate.stage || candidate.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                        <p className="text-slate-400 text-xs uppercase font-bold">Final Score</p>
                        <p className="font-black text-blue-600 mt-0.5">{score}%</p>
                        <div className="score-bar mt-2"><div className={`score-bar-fill ${scoreColor}`} style={{ width: `${score}%` }} /></div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2"><p className="text-slate-400 text-xs uppercase font-bold">Recommendation</p><p className="font-bold text-slate-900 dark:text-white mt-0.5">{candidate.recommendationTag || "N/A"}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        <div className="space-y-6">
          <ChartCard title="Pipeline Breakdown" subtitle="Stage-wise application distribution" accent="yellow">
            <div className="space-y-3">
              {pipeline.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                  <div className="flex items-center gap-2"><StatusBadge status={item} /><span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span></div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{item.count}</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Top Skills Distribution" subtitle="Most frequently matched skills across current candidates">
            {!chartReadySkills.length ? <p className="muted">No skill trends yet.</p> : <div className="ats-chart-box"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip /><Pie data={chartReadySkills} dataKey="count" nameKey="skill" outerRadius={80} innerRadius={40}>{chartReadySkills.map((entry) => <Cell key={entry.skill} fill={entry.fill} />)}</Pie></PieChart></ResponsiveContainer></div>}
            {chartReadySkills.length ? <div className="space-y-2 mt-3">{chartReadySkills.map((item) => <div key={item.skill} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.skill}</span><span className="text-sm font-bold text-slate-900 dark:text-white">{item.count}</span></div>)}</div> : null}
          </ChartCard>

          <ChartCard title="Recommendation Highlights" subtitle="Top AI-recommended applications">
            <div className="space-y-3">
              {(dashboard?.analytics?.top_ranked_candidates || []).length ? dashboard.analytics.top_ranked_candidates.map((item) => {
                const score = Math.round(Number(item.final_score || 0));
                return (
                  <div key={item.result_id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 card-hover-lift">
                    <p className="font-bold text-slate-900 dark:text-white">{item.candidate_name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.job_title || "JD"}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.recommendation || "N/A"}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <p className="text-xs font-black text-blue-600">{score}%</p>
                      <div className="score-bar flex-1"><div className={`score-bar-fill ${score >= 80 ? "green" : score >= 65 ? "blue" : "red"}`} style={{ width: `${score}%` }} /></div>
                    </div>
                  </div>
                );
              }) : <p className="text-sm text-slate-500 dark:text-slate-400">No recommendation highlights yet.</p>}
            </div>
          </ChartCard>

          <ChartCard title="Quick Actions" subtitle="Common HR tasks">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate("/hr/candidates")} className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all text-left">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400">View All Candidates</p>
                <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">Browse candidate pool</p>
              </button>
              <button onClick={() => navigate("/hr/interviews")} className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all text-left">
                <p className="text-sm font-bold text-green-700 dark:text-green-400">View Interviews</p>
                <p className="text-xs text-green-500 dark:text-green-500 mt-1">See scheduled interviews</p>
              </button>
              <button onClick={() => navigate("/hr/jds")} className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-all text-left">
                <p className="text-sm font-bold text-purple-700 dark:text-purple-400">Manage JDs</p>
                <p className="text-xs text-purple-500 dark:text-purple-500 mt-1">Job descriptions</p>
              </button>
              <button onClick={() => navigate("/hr/compare")} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all text-left">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Compare</p>
                <p className="text-xs text-amber-500 dark:text-amber-500 mt-1">Side-by-side view</p>
              </button>
            </div>
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Recent Candidates" subtitle="ATS list view preview with ranking and recommendations.">
        {tableLoading ? <p className="center muted py-8">Loading candidates...</p> : <CandidateTable candidates={candidatesData?.candidates || []} onDeleteCandidate={handleDeleteCandidate} onScheduleCandidate={handleScheduleCandidate} />}
      </ChartCard>
    </div>
  );
}
