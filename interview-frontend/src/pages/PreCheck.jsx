import React, { useRef, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Camera, Mic, Wifi, CheckCircle2, AlertCircle, Play, ShieldCheck, Video, Settings, AlertTriangle
} from "lucide-react";
import { interviewApi } from "../services/api";
import { cn } from "../utils/utils";

async function attachPreviewStream(videoElement, stream) {
  if (!videoElement) return;
  videoElement.srcObject = stream;
  videoElement.muted = true;
  videoElement.playsInline = true;
  try {
    await videoElement.play();
  } catch {
    await new Promise((resolve) => {
      const timeoutId = window.setTimeout(resolve, 500);
      videoElement.onloadedmetadata = () => { window.clearTimeout(timeoutId); resolve(); };
    });
    try { await videoElement.play(); } catch { /* keep srcObject */ }
  }
}

// PHASE 1 FIX: Check MediaRecorder API support upfront so candidates see
// a clear warning before entering the live interview, not a silent failure mid-session.
function checkMediaRecorderSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "Non-browser environment." };
  if (typeof window.MediaRecorder === "undefined") {
    return { supported: false, reason: "MediaRecorder API is not supported in this browser." };
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  const supported = candidates.some((type) => {
    try { return window.MediaRecorder.isTypeSupported(type); } catch { return false; }
  });
  if (!supported) {
    return { supported: false, reason: "No supported audio recording format found in this browser." };
  }
  return { supported: true, reason: "" };
}

export default function PreCheck() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [checks, setChecks] = useState({
    camera:        { status: "pending", label: "Camera access" },
    mic:           { status: "pending", label: "Microphone access" },
    internet:      { status: "granted", label: "Internet connection" },
    // PHASE 1 FIX: voice recording support check
    voiceRecorder: { status: "pending", label: "Voice recording support" },
  });
  const [isChecking, setIsChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // PHASE 1 FIX: Run MediaRecorder check on mount so we show its status
  // immediately (before the user even clicks "Run System Check").
  useEffect(() => {
    const { supported, reason } = checkMediaRecorderSupport();
    setChecks((prev) => ({
      ...prev,
      voiceRecorder: {
        status: supported ? "granted" : "denied",
        label: "Voice recording support",
        detail: reason,
      },
    }));
  }, []);

  const startCheck = async () => {
    setIsChecking(true);
    setError("");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Always re-check MediaRecorder in case browser state changed
    const recorderCheck = checkMediaRecorderSupport();

    try {
      let stream;
      let micGranted = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        micGranted = false;
      }
      streamRef.current = stream;
      await attachPreviewStream(videoRef.current, stream);
      setChecks({
        camera:        { status: "granted", label: "Camera access" },
        mic:           { status: micGranted ? "granted" : "denied", label: "Microphone access" },
        internet:      { status: "granted", label: "Internet connection" },
        voiceRecorder: {
          status: recorderCheck.supported ? "granted" : "denied",
          label: "Voice recording support",
          detail: recorderCheck.reason,
        },
      });
      if (!micGranted) {
        setError("Camera preview is active, but microphone permission is blocked. Allow mic access for voice answers.");
      }
    } catch {
      setChecks({
        camera:        { status: "denied", label: "Camera access" },
        mic:           { status: "denied", label: "Microphone access" },
        internet:      { status: "granted", label: "Internet connection" },
        voiceRecorder: {
          status: recorderCheck.supported ? "granted" : "denied",
          label: "Voice recording support",
          detail: recorderCheck.reason,
        },
      });
    } finally {
      setIsChecking(false);
    }
  };

  React.useEffect(() => {
    const videoElement = videoRef.current;
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoElement) videoElement.srcObject = null;
    };
  }, []);

  // PHASE 1 FIX: Allow starting if camera is available, even if voice recorder
  // is unsupported (candidate can still type answers). Show a clear warning instead.
  const cameraGranted = checks.camera.status === "granted";
  const voiceUnsupported = checks.voiceRecorder.status === "denied" && checks.voiceRecorder.detail;
  const allGranted = Object.values(checks).every((c) => c.status === "granted");

  return (
    <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center py-12">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12">

        {/* Left: checks */}
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
              Before we begin, ensure your camera, microphone, and browser recording support are active.
            </p>
          </div>

          {error ? <p className="alert error">{error}</p> : null}

          {/* PHASE 1 FIX: voice unsupported banner — shown as warning not blocker */}
          {voiceUnsupported && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Voice recording not supported</p>
                <p className="mt-0.5">{checks.voiceRecorder.detail} You can still type your answers manually. Use Chrome or Edge for full voice support.</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(checks).map(([key, check]) => (
              <div key={key} className={cn(
                "flex items-center justify-between p-5 rounded-2xl border transition-all",
                check.status === "granted"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400"
                  : check.status === "denied"
                  ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50 text-red-700 dark:text-red-400"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
              )}>
                <div className="flex items-center space-x-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                    check.status === "granted" ? "bg-emerald-100 dark:bg-emerald-800" : "bg-slate-100 dark:bg-slate-800")}>
                    {key === "camera" && <Camera size={20} />}
                    {key === "mic" && <Mic size={20} />}
                    {key === "internet" && <Wifi size={20} />}
                    {key === "voiceRecorder" && <Mic size={20} />}
                  </div>
                  <span className="font-bold">{check.label}</span>
                </div>
                {check.status === "granted" && <CheckCircle2 size={24} />}
                {check.status === "denied" && <AlertCircle size={24} />}
              </div>
            ))}
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button onClick={startCheck} disabled={isChecking}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-black py-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 shadow-sm">
              {isChecking ? "Checking..." : "Run System Check"}
            </button>
            {/* PHASE 1 FIX: allow start if camera is available even if voice is unsupported */}
            <button disabled={!cameraGranted || starting} onClick={handleStartInterview}
              className={cn(
                "flex-[1.5] py-4 rounded-2xl font-black flex items-center justify-center space-x-2 transition-all shadow-xl shadow-blue-200 dark:shadow-none",
                cameraGranted ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
              )}>
              <span>{starting ? "Starting..." : "Start Interview"}</span>
              <Play size={18} fill="currentColor" />
            </button>
          </div>
          {!allGranted && cameraGranted && (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Camera is ready. You can start — voice answers are optional; type if mic is unavailable.
            </p>
          )}
        </div>

        {/* Right: video preview */}
        <div className="space-y-6">
          <div className="relative aspect-video bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800">
            <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
            {checks.camera.status !== "granted" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Video size={32} />
                </div>
                <p className="text-sm font-bold uppercase tracking-widest">No Video Feed</p>
              </div>
            ) : null}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Preview</span>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/50">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center mb-3">
              <Settings className="mr-2" size={16} />Interview Requirements
            </h4>
            <ul className="space-y-2 text-xs text-blue-700 dark:text-blue-400 font-medium">
              <li className="flex items-center space-x-2"><div className="w-1 h-1 bg-blue-400 rounded-full" /><span>Sit in a well-lit and quiet room</span></li>
              <li className="flex items-center space-x-2"><div className="w-1 h-1 bg-blue-400 rounded-full" /><span>Ensure your face is clearly visible</span></li>
              <li className="flex items-center space-x-2"><div className="w-1 h-1 bg-blue-400 rounded-full" /><span>Use Chrome or Edge for best voice recording support</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
