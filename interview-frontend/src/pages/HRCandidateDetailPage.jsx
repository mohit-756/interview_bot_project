import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Download,
  Globe,
  Mail,
  Target,
  XCircle,
  Zap,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { mockCandidates } from "../data/mockData";
import { cn } from "../utils/utils";

export default function HRCandidateDetailPage() {
  const { candidateUid } = useParams();
  const [activeTabId, setActiveTabId] = useState("resume");

  const candidate = mockCandidates.find((entry) => entry.uid === candidateUid) || mockCandidates[0];

  const tabs = [
    { id: "resume", label: "Resume Analysis", icon: Briefcase },
    { id: "interview", label: "Interview Rounds", icon: Calendar },
    { id: "scores", label: "Detailed Scores", icon: Target },
    { id: "notes", label: "Internal Notes", icon: AlertCircle },
  ];
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/hr/candidates" className="flex items-center space-x-2 text-slate-500 hover:text-blue-600 transition-colors font-medium">
          <ArrowLeft size={20} />
          <span>Back to Candidates</span>
        </Link>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center space-x-2">
            <Download size={20} />
            <span>Download PDF</span>
          </button>
          <button className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-none">
            Schedule Next Round
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700"></div>
        <div className="px-8 pb-8">
          <div className="relative flex flex-col md:flex-row md:items-end -mt-12 md:space-x-8">
            <div className="w-32 h-32 rounded-3xl border-4 border-white dark:border-slate-900 overflow-hidden shadow-lg bg-slate-100">
              <img src={candidate.avatar} alt={candidate.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 mt-6 md:mt-0 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">{candidate.name}</h1>
                  <StatusBadge status={candidate.finalDecision} />
                </div>
                <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">
                  {candidate.role} | {candidate.experience} experience
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-medium">
                  <Mail size={16} className="mr-2" />
                  {candidate.email}
                </div>
                <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-medium">
                  <Globe size={16} className="mr-2" />
                  Portfolio
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "flex items-center space-x-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
              activeTabId === tab.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800",
            )}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {activeTabId === "resume" ? (
            <>
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                    <Zap className="text-yellow-500 mr-2" size={24} />
                    AI Resume Match Analysis
                  </h3>
                  <div className="text-right">
                    <span className="text-4xl font-black text-blue-600">{candidate.resumeScore}%</span>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Overall Match</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Top Skills Found</h4>
                    <div className="flex flex-wrap gap-2">
                      {candidate.skills.map((skill) => (
                        <span key={skill} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold border border-emerald-100 dark:border-emerald-800/50">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Missing Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {candidate.missingSkills.map((skill) => (
                        <span key={skill} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold border border-red-100 dark:border-red-800/50">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                    <CheckCircle2 className="text-emerald-500 mr-2" size={20} />
                    Key Strengths
                  </h4>
                  <ul className="space-y-4">
                    {candidate.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 mr-3 flex-shrink-0" />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                    <XCircle className="text-red-500 mr-2" size={20} />
                    Potential Weaknesses
                  </h4>
                  <ul className="space-y-4">
                    {candidate.weaknesses.map((weakness, index) => (
                      <li key={index} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 mr-3 flex-shrink-0" />
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <activeTab.icon size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{activeTab.label} Content</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">This section is currently being populated with mock data.</p>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6">AI Decision Card</h4>
            <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 mb-6">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2">Recommendation</p>
              <h5 className="text-2xl font-black text-blue-800 dark:text-blue-300">Highly Recommended</h5>
              <p className="text-sm text-blue-700 dark:text-blue-400/80 mt-3 leading-relaxed">
                Candidate shows strong technical aptitude in React/Node.js and exceeds the experience requirements for the role.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">Technical Skill</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">9/10</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">Communication</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">8/10</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">Experience Fit</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">10/10</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6">Timeline</h4>
            <div className="space-y-6">
              <div className="relative pl-6 pb-6 border-l-2 border-slate-100 dark:border-slate-800 last:pb-0">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900"></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today, 10:45 AM</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">Application Analyzed by AI</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Result: Highly Recommended (85%)</p>
              </div>
              <div className="relative pl-6 pb-6 border-l-2 border-slate-100 dark:border-slate-800 last:pb-0">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900"></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yesterday</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">Resume Uploaded</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Applied for Full Stack Developer</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
