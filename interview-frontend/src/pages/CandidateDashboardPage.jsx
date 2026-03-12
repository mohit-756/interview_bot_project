import React, { useState } from "react";
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Play, 
  FileSearch,
  Star,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import StepChecklist from "../components/StepChecklist";
import { mockCandidates } from "../data/mockData";
import { cn } from "../utils/utils";

export default function CandidateDashboardPage() {
  const [step, setStep] = useState(1); // 1: Upload, 2: Analysis
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const candidate = mockCandidates[0]; // Alex Johnson

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      
      // Simulate upload progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsUploading(false);
            setStep(2);
          }, 500);
        }
      }, 200);
    }
  };

  const steps = [
    { title: "Personal Details", description: "Basic info provided", completed: true },
    { title: "Resume Upload", description: "Upload your latest CV", completed: step > 1 },
    { title: "AI Analysis", description: "Resume match scoring", completed: step > 1 },
    { title: "Interview Ready", description: "Prepare for AI round", completed: false },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Candidate Workspace</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your application and prepare for interviews.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/candidate/practice" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center space-x-2">
            <Play size={18} className="text-blue-600" />
            <span>Practice Mode</span>
          </Link>
          <Link to="/interview/INT-001" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center space-x-2">
            <span>Start Real Interview</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          
          {step === 1 ? (
            /* Resume Upload Section */
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Apply for Role</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">You are applying for the <span className="font-bold text-blue-600">Full Stack Developer</span> position.</p>
              </div>
              
              <div className="p-8 space-y-8">
                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                    <input type="text" defaultValue={candidate.name} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Email Address</label>
                    <input type="email" defaultValue={candidate.email} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                  </div>
                </div>

                {/* Drag & Drop Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Upload Resume (PDF/DOCX)</label>
                  <label className={cn(
                    "relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer group",
                    isUploading ? "border-blue-400 bg-blue-50/30" : "border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/30"
                  )}>
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                    
                    {isUploading ? (
                      <div className="text-center w-full max-w-xs">
                        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Clock size={32} className="text-blue-600 animate-spin" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Analyzing Resume...</h4>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                          <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-bold">{uploadProgress}% complete</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-all">
                          <Upload size={32} />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Click to upload or drag and drop</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Support PDF, DOCX, TXT (Max 5MB)</p>
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex justify-end pt-4">
                  <button className="px-8 py-3.5 bg-slate-200 dark:bg-slate-800 text-slate-400 rounded-xl font-bold cursor-not-allowed" disabled>
                    Submit Application
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Analysis Result Section */
            <div className="space-y-8">
              {/* Score Overview */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center font-display">
                    <FileSearch className="text-blue-600 mr-3" size={28} />
                    AI Resume Analysis Result
                  </h3>
                  <StatusBadge status="Shortlisted" className="text-sm px-4 py-1.5" />
                </div>
                
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="flex flex-col items-center justify-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 dark:border-blue-800/50">
                    <div className="text-5xl font-black text-blue-600 mb-2">{candidate.resumeScore}%</div>
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest">Match Score</p>
                  </div>
                  
                  <div className="md:col-span-2 space-y-6">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Matching Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {candidate.skills.map(skill => (
                          <span key={skill} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold border border-emerald-100 dark:border-emerald-800/50">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Missing Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {candidate.missingSkills.map(skill => (
                          <span key={skill} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold border border-red-100 dark:border-red-800/50">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                    <Star className="text-yellow-500 mr-2" size={20} />
                    Key Strengths Found
                  </h4>
                  <ul className="space-y-4">
                    {candidate.strengths.map((s, i) => (
                      <li key={i} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 mr-3 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                    <AlertCircle className="text-blue-500 mr-2" size={20} />
                    Areas to Improve
                  </h4>
                  <ul className="space-y-4">
                    {candidate.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2.5 mr-3 flex-shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Next Steps Card */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-3xl shadow-lg text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-bold font-display">Ready for the Interview?</h3>
                    <p className="text-blue-100 mt-2 max-w-md">Your resume analysis is complete. You can now proceed to the live AI interview round.</p>
                  </div>
                  <Link to="/interview/INT-001" className="bg-white text-blue-600 px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 hover:scale-105 transition-all">
                    Start Interview
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Flow */}
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-8">Application Progress</h4>
            <StepChecklist steps={steps} />
          </div>

          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6">Need Help?</h4>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                <h5 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Practice First</h5>
                <p className="text-xs text-slate-500 dark:text-slate-400">Try our AI practice mode to get comfortable before the real round.</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                <h5 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Interview Tips</h5>
                <p className="text-xs text-slate-500 dark:text-slate-400">Check our guide on how to ace an automated AI interview.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
