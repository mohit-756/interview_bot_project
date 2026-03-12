import React, { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { 
  Camera, 
  Mic, 
  Wifi, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  ShieldCheck,
  Video,
  Settings
} from "lucide-react";
import { cn } from "../utils/utils";

export default function PreCheck() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  
  const [checks, setChecks] = useState({
    camera: { status: 'pending', label: 'Camera access' },
    mic: { status: 'pending', label: 'Microphone access' },
    internet: { status: 'granted', label: 'Internet connection' },
  });

  const [isChecking, setIsChecking] = useState(false);

  const startCheck = async () => {
    setIsChecking(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setChecks({
        camera: { status: 'granted', label: 'Camera access' },
        mic: { status: 'granted', label: 'Microphone access' },
        internet: { status: 'granted', label: 'Internet connection' },
      });
    } catch {
      setChecks({
        camera: { status: 'denied', label: 'Camera access' },
        mic: { status: 'denied', label: 'Microphone access' },
        internet: { status: 'granted', label: 'Internet connection' },
      });
    } finally {
      setIsChecking(false);
    }
  };

  const allGranted = Object.values(checks).every(c => c.status === 'granted');

  return (
    <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center py-12">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Left: Instructions & Checks */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center space-x-2 text-blue-600 mb-4">
              <ShieldCheck size={24} />
              <span className="text-sm font-black uppercase tracking-widest">System Check</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white font-display leading-tight">
              Ready to start your interview?
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg">
              Before we begin, please ensure your camera and microphone are working correctly. This ensures a smooth interview experience.
            </p>
          </div>

          <div className="space-y-4">
            {Object.entries(checks).map(([key, check]) => (
              <div key={key} className={cn(
                "flex items-center justify-between p-5 rounded-2xl border transition-all",
                check.status === 'granted' 
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400"
                  : check.status === 'denied'
                  ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50 text-red-700 dark:text-red-400"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
              )}>
                <div className="flex items-center space-x-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    check.status === 'granted' ? "bg-emerald-100 dark:bg-emerald-800" : "bg-slate-100 dark:bg-slate-800"
                  )}>
                    {key === 'camera' && <Camera size={20} />}
                    {key === 'mic' && <Mic size={20} />}
                    {key === 'internet' && <Wifi size={20} />}
                  </div>
                  <span className="font-bold">{check.label}</span>
                </div>
                {check.status === 'granted' && <CheckCircle2 size={24} />}
                {check.status === 'denied' && <AlertCircle size={24} />}
              </div>
            ))}
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button 
              onClick={startCheck}
              disabled={isChecking}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-black py-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 shadow-sm"
            >
              {isChecking ? "Checking..." : "Run System Check"}
            </button>
            <button 
              disabled={!allGranted}
              onClick={() => navigate(`/interview/${resultId}/live`)}
              className={cn(
                "flex-[1.5] py-4 rounded-2xl font-black flex items-center justify-center space-x-2 transition-all shadow-xl shadow-blue-200 dark:shadow-none",
                allGranted ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
              )}
            >
              <span>Start Interview</span>
              <Play size={18} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Right: Video Preview */}
        <div className="space-y-6">
          <div className="relative aspect-video bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800">
            {checks.camera.status === 'granted' ? (
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Video size={32} />
                </div>
                <p className="text-sm font-bold uppercase tracking-widest">No Video Feed</p>
              </div>
            )}
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Preview</span>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/50">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center mb-3">
              <Settings className="mr-2" size={16} />
              Interview Requirements
            </h4>
            <ul className="space-y-2 text-xs text-blue-700 dark:text-blue-400 font-medium">
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full" />
                <span>Sit in a well-lit and quiet room</span>
              </li>
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full" />
                <span>Ensure your face is clearly visible</span>
              </li>
              <li className="flex items-center space-x-2">
                <div className="w-1 h-1 bg-blue-400 rounded-full" />
                <span>Avoid wearing headphones if possible for AI clarity</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
