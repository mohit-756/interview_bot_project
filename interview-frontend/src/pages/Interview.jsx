import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  Send,
  MessageSquare,
  CheckCircle2,
  Activity
} from "lucide-react";
import { cn } from "../utils/utils";

export default function Interview() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes per question
  const [totalTimeLeft, setTotalTimeLeft] = useState(900); // 15 minutes total
  const [transcripts, setTranscripts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const videoRef = useRef(null);

  const questions = [
    "Tell me about a challenging project you've worked on recently. What was your role and how did you handle difficulties?",
    "How do you stay updated with the latest trends and technologies in full-stack development?",
    "Describe your experience with React and state management libraries like Redux or Zustand.",
    "How do you approach testing in your development workflow?",
    "Why do you want to join our team as a Full Stack Developer?"
  ];

  useEffect(() => {
    const videoElement = videoRef.current;
    let mediaStream = null;

    // Start camera
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        mediaStream = stream;
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      })
      .catch(err => console.error("Media error:", err));

    // Timers
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
      setTotalTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      // Add answer to transcripts
      if (answer) {
        setTranscripts((currentTranscripts) => [
          ...currentTranscripts,
          { q: questions[currentQuestionIndex], a: answer },
        ]);
      }
      setCurrentQuestionIndex((index) => index + 1);
      setAnswer("");
      setTimeLeft(120);
    } else {
      setIsSubmitting(true);
      setTimeout(() => {
        navigate(`/interview/${resultId}/completed`);
      }, 1500);
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      // Mock transcription
      const mockText = "In my previous role, I led the migration of a monolithic application to a microservices architecture using React and Node.js...";
      let i = 0;
      const interval = setInterval(() => {
        setAnswer(mockText.slice(0, i));
        i += 3;
        if (i > mockText.length) clearInterval(interval);
      }, 50);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans p-4 lg:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
        
        {/* Main Content: Question & Answer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Info */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 w-10 h-10 rounded-xl flex items-center justify-center font-bold">
                {currentQuestionIndex + 1}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Question {currentQuestionIndex + 1} of {questions.length}</h4>
                <p className="text-slate-900 dark:text-white font-bold mt-1">Live Interview Session</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Question Timer</p>
                <p className={cn("text-xl font-black font-mono", timeLeft < 20 ? "text-red-500 animate-pulse" : "text-slate-900 dark:text-white")}>
                  {formatTime(timeLeft)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Time</p>
                <p className="text-xl font-black font-mono text-slate-900 dark:text-white">{formatTime(totalTimeLeft)}</p>
              </div>
            </div>
          </div>

          {/* Question Box */}
          <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 transition-all duration-300 group-hover:w-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-display leading-tight">
              {questions[currentQuestionIndex]}
            </h2>
          </div>

          {/* Answer Area */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center">
                <MessageSquare className="mr-2 text-blue-600" size={18} />
                Your Response (Speech-to-Text)
              </h4>
              <div className="flex items-center space-x-2">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  isRecording ? "bg-red-500 animate-pulse" : "bg-slate-300"
                )} />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {isRecording ? "Listening..." : "Microphone Idle"}
                </span>
              </div>
            </div>

            <textarea
              className="w-full h-48 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-6 text-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none font-medium leading-relaxed"
              placeholder="Your answer will appear here as you speak..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={toggleRecording}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center space-x-3 px-8 py-4 rounded-2xl font-black transition-all",
                    isRecording 
                      ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200" 
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200"
                  )}
                >
                  {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
                  <span>{isRecording ? "Stop Recording" : "Start Speaking"}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => setAnswer("")}
                  className="flex-1 sm:flex-none px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Clear
                </button>
                <button 
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-3 px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black transition-all shadow-lg shadow-indigo-200"
                >
                  <span>{currentQuestionIndex === questions.length - 1 ? (isSubmitting ? "Finishing..." : "Finish Interview") : "Next Question"}</span>
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: Proctoring & Transcripts */}
        <div className="space-y-6">
          {/* Proctoring Feed */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center">
              <Activity className="mr-2 text-emerald-500" size={18} />
              Proctoring Feed
            </h4>
            <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-100 dark:border-slate-800">
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
              <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Rec 02:45</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Video</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-xs font-black text-slate-900 dark:text-white">Active</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audio</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-xs font-black text-slate-900 dark:text-white">Streaming</p>
              </div>
            </div>
          </div>

          {/* Real-time Transcription Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6 flex-1 flex flex-col min-h-[400px]">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center">
              <CheckCircle2 className="mr-2 text-blue-600" size={18} />
              Session Log
            </h4>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {transcripts.length === 0 && (
                <div className="text-center py-12 opacity-30">
                  <MessageSquare size={48} className="mx-auto mb-4" />
                  <p className="text-sm font-bold uppercase tracking-widest">No history yet</p>
                </div>
              )}
              {transcripts.map((t, i) => (
                <div key={i} className="space-y-2 border-l-2 border-slate-100 dark:border-slate-800 pl-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Question {i + 1}</p>
                  <p className="text-xs text-slate-900 dark:text-white font-bold line-clamp-2">{t.q}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-3">"{t.a}"</p>
                </div>
              ))}
              {isRecording && (
                <div className="space-y-2 border-l-2 border-blue-500 pl-4 animate-pulse">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Currently Recording...</p>
                  <p className="text-xs text-slate-400 italic">Transcribing live audio feed...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
