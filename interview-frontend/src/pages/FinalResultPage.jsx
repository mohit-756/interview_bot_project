import React from "react";
import {
  BarChart3,
  TrendingUp,
  Target, 
  MessageCircle, 
  Zap, 
  CheckCircle2, 
  ArrowLeft,
  Briefcase
} from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { cn } from "../utils/utils";

export default function FinalResultPage() {
  const scores = {
    overall: 84,
    technical: 88,
    communication: 76,
    confidence: 92
  };

  const metrics = [
    { label: "Technical Proficiency", value: scores.technical, icon: Target, color: "blue" },
    { label: "Communication Clarity", value: scores.communication, icon: MessageCircle, color: "purple" },
    { label: "Confidence Level", value: scores.confidence, icon: Zap, color: "yellow" },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link to="/candidate" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all border border-slate-100 dark:border-slate-800">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Interview Performance</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">AI-generated preview of your session results.</p>
          </div>
        </div>
        <StatusBadge status="Completed" className="text-sm px-5 py-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Score Area */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Overall Score Large Card */}
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm p-10 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <TrendingUp size={200} />
            </div>
            
            <div className="w-48 h-48 rounded-full border-[12px] border-slate-100 dark:border-slate-800 flex items-center justify-center relative mb-8">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="45%"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-blue-600"
                  strokeDasharray={`${scores.overall * 2.83} 283`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center">
                <span className="text-6xl font-black text-slate-900 dark:text-white">{scores.overall}</span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Percentile</p>
              </div>
            </div>

            <div className="max-w-md">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Exceptional Performance!</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                Your performance in this interview session ranks in the top 15% of candidates for the Full Stack Developer role. Your technical depth particularly stood out during the problem-solving sections.
              </p>
            </div>
          </div>

          {/* Detailed Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {metrics.map((m) => (
              <div key={m.label} className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-4",
                  m.color === 'blue' ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" :
                  m.color === 'purple' ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600" :
                  "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600"
                )}>
                  <m.icon size={24} />
                </div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-3">{m.label}</h4>
                <div className="flex items-end space-x-2">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">{m.value}%</span>
                  <TrendingUp size={18} className="text-emerald-500 mb-1" />
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className={cn(
                    "h-full rounded-full",
                    m.color === 'blue' ? "bg-blue-600" : m.color === 'purple' ? "bg-purple-600" : "bg-yellow-600"
                  )} style={{ width: `${m.value}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* HR Feedback Preview */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center font-display">
              <CheckCircle2 className="text-emerald-500 mr-2" size={24} />
              AI Hiring Recommendation
            </h3>
            <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/50 mb-6">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Status: Strong Pass</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-500/80 mt-2 leading-relaxed font-medium">
                The candidate demonstrates advanced React knowledge and structured system design thinking. Highly compatible with senior-level development requirements.
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Top Highlights</h4>
              <div className="flex flex-wrap gap-2">
                {['Architectural Thinking', 'Clean Code', 'Scalability Focus', 'Quick Problem Solving'].map(tag => (
                  <span key={tag} className="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold border border-slate-100 dark:border-slate-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-8">Role Insights</h4>
            <div className="flex items-center space-x-4 mb-8">
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Briefcase size={28} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white leading-none">Full Stack Dev</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Product Engineering</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <span>Industry Benchmarking</span>
                  <span>Top 5%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full w-[95%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <span>Role Fit Percentile</span>
                  <span>92nd</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full w-[92%]" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-xl shadow-indigo-100 dark:shadow-none">
            <BarChart3 className="mb-6 opacity-80" size={40} />
            <h3 className="text-xl font-bold font-display leading-tight mb-4">Unlock Full Feedback Report</h3>
            <p className="text-indigo-100 text-sm leading-relaxed mb-6">
              Get detailed insights on every question, including areas of improvement and expert-curated learning paths.
            </p>
            <button className="w-full bg-white text-indigo-600 py-4 rounded-2xl font-black text-sm hover:scale-[1.02] transition-all shadow-lg">
              Upgrade to Premium
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
