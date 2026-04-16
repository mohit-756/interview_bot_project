import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, UserX, CheckCircle2, Plus, Calendar, BarChart3, Sparkles, TrendingUp } from "lucide-react";
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 page-enter-delay-2">
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartCard title="Hiring Funnel" subtitle="Applied → shortlisted → interview completed → selected" accent="blue">
              {!chartReadyFunnel.length ? <div className="text-center py-12 text-slate-500 dark:text-slate-400">No funnel data yet</div> : <div className="ats-chart-box tall"><ResponsiveContainer width="100%" height={200}><BarChart data={chartReadyFunnel} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div>}
            </ChartCard>

            <ChartCard title="Top Skills Distribution" subtitle="Most frequently matched skills">
              {!chartReadySkills.length ? <div className="text-center py-12 text-slate-500 dark:text-slate-400">No skill data</div> : <>
                <div className="ats-chart-box" style={{height: "200px"}}><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip /><Pie data={chartReadySkills} dataKey="count" nameKey="skill" outerRadius={60} innerRadius={30}>{chartReadySkills.map((entry) => <Cell key={entry.skill} fill={entry.fill} />)}</Pie></PieChart></ResponsiveContainer></div>
                <div className="space-y-2 mt-3 max-h-[150px] overflow-y-auto pr-2">{chartReadySkills.slice(0, 5).map((item) => <div key={item.skill} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.skill}</span><span className="text-sm font-bold text-slate-900 dark:text-white">{item.count}</span></div>)}</div>
              </>}
            </ChartCard>
          </div>

          <ChartCard title="Average Score per JD" subtitle="Compare ATS score trends across job descriptions" accent="green">
            {!chartReadyJdScores.length ? <div className="text-center py-12 text-slate-500 dark:text-slate-400">No JD score data</div> : <div className="ats-chart-box" style={{height: "250px"}}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartReadyJdScores}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={60} /><YAxis /><Tooltip /><Bar dataKey="score" radius={[10, 10, 0, 0]} fill="#10b981" /></BarChart></ResponsiveContainer></div>}
          </ChartCard>

          <ChartCard title="Top Ranked Candidates" subtitle="Final weighted ATS score sorted across current applications.">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2">
              {!ranked.length ? <div className="col-span-3 text-center py-8 text-slate-500 dark:text-slate-400">No ranked candidates yet</div> : ranked.map((candidate) => {
                const score = Math.round(Number(candidate.finalAIScore || candidate.score || 0));
                const scoreColor = score >= 80 ? "green" : score >= 65 ? "blue" : "red";
                return (
                  <div key={candidate.result_id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 card-hover-lift">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">#{candidate.rank || "-"} {candidate.name}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{candidate.candidate_uid}</p>
                      </div>
                      <StatusBadge status={candidate.stage || candidate.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 flex-1">
                        <p className="text-slate-400 text-xs uppercase font-bold">Final Score</p>
                        <p className="font-black text-blue-600 mt-0.5">{score}%</p>
                        <div className="score-bar mt-2"><div className={`score-bar-fill ${scoreColor}`} style={{ width: `${score}%` }} /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        <div className="lg:col-span-1">
          <ChartCard title="Pipeline Overview" subtitle="Application stage distribution" accent="yellow">
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {pipeline.length ? pipeline.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                  <div className="flex items-center gap-2"><StatusBadge status={item} /><span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span></div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{item.count}</span>
                </div>
              )) : <div className="text-center py-8 text-slate-500 dark:text-slate-400">No pipeline data</div>}
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
