import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Mic, MicOff, Send, MessageSquare, CheckCircle2,
  Activity, AlertTriangle, Eye, EyeOff,
  Volume2, VolumeX, Loader2, Play, Clock, Zap,
  ShieldCheck, BarChart3, TrendingUp, ChevronRight, X, AlertOctagon
} from "lucide-react";
import { interviewApi, proctorApi, baseURL } from "../services/api";
import { cn } from "../utils/utils";
import AnswerFeedback from "../components/AnswerFeedback";
import { useProctoring } from "../hooks/useProctoring";
import HelpSupportButton from "../components/HelpSupportButton";
import { useAnnounce } from "../hooks/useAccessibility";

const SILENCE_THRESHOLD_RMS = 0.01;
const SILENCE_RATIO_THRESHOLD = 0.8;

let sharedAudioContext = null;
function getAudioContext() {
  if (!sharedAudioContext) sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  return sharedAudioContext;
}

async function calculateAudioRMS(audioBlob) {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) sumSquares += channelData[i] * channelData[i];
    return Math.sqrt(sumSquares / channelData.length);
  } catch { return 0; }
}

async function filterSilentChunks(chunks) {
  if (!chunks.length) return { validChunks: [], isMostlySilent: true };
  const rmsValues = await Promise.all(chunks.map(calculateAudioRMS));
  let silentChunks = 0;
  const validChunks = [];
  rmsValues.forEach((rms, i) => {
    if (rms >= SILENCE_THRESHOLD_RMS) validChunks.push(chunks[i]);
    else silentChunks++;
  });
  const silenceRatio = silentChunks / chunks.length;
  return { validChunks, isMostlySilent: silenceRatio >= SILENCE_RATIO_THRESHOLD };
}

function useTTS() {
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);

  const speak = useCallback(async (text, voiceType = "kajal") => {
    if (!text || muted) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    try {
      const response = await interviewApi.tts(text, voiceType);
      if (response.audio_url) {
        const audioUrl = response.audio_url.startsWith("http") ? response.audio_url : `${baseURL}${response.audio_url}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => setSpeaking(false);
        await audio.play();
      }
    } catch (err) {
      console.warn("Polly TTS failed, falling back to browser TTS:", err);
      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-IN";
      utterance.rate = 0.88;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }, [muted]);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => { stop(); setMuted((m) => !m); }, [stop]);

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  return { speak, stop, speaking, muted, toggleMute };
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function appendTranscript(current, next) {
  const base = String(current || "").trim();
  const t = String(next || "").trim();
  if (!t) return base;
  if (!base) return t;
  return `${base}${base.endsWith(".") ? " " : ". "}${t}`;
}

function hasActiveAudioTrack(stream) {
  if (!stream) return false;
  return stream.getAudioTracks().some((t) => t.readyState === "live" && t.enabled !== false);
}

function stopStreamTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

function getPreferredAudioMimeType() {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((t) => window.MediaRecorder.isTypeSupported(t)) || "";
}

function TabSwitchAlert({ count }) {
  if (count === 0) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-2xl text-red-400 text-xs font-bold animate-pulse"
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <span>Tab switch detected {count} — this is recorded</span>
    </div>
  );
}

function ProcessingOverlay({ processingStatus }) {
  if (processingStatus !== "processing") return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-title"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
        <Loader2 size={48} className="text-blue-500 animate-spin" aria-hidden="true" />
        <p id="processing-title" className="text-white font-bold text-lg">Processing your answer...</p>
        <p className="text-slate-400 text-sm">Please wait while we analyze your response</p>
      </div>
    </div>
  );
}

function EndInterviewModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-interview-title"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertOctagon size={20} className="text-red-400" aria-hidden="true" />
          </div>
          <h3 id="end-interview-title" className="text-white font-bold text-lg">End Interview?</h3>
        </div>
        <p className="text-slate-300 mb-6">Are you sure you want to end the interview? Your progress will be saved.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all"
          >
            End Interview
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Interview() {
  const { resultId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const interviewToken = new URLSearchParams(location.search).get("token") || sessionStorage.getItem(`interview-token:${resultId}`) || "";

  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [maxQuestions, setMaxQuestions] = useState(1);
  const [answer, setAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTimeLeft, setTotalTimeLeft] = useState(0);
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [transcriptionWarning, setTranscriptionWarning] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [proctorAlert, setProctorAlert] = useState("");
  const [lastRecordedPreview, setLastRecordedPreview] = useState("");
  const [interviewStatus, setInterviewStatus] = useState("idle");
  const [showEndModal, setShowEndModal] = useState(false);
  const [timeWarningShown, setTimeWarningShown] = useState(false);

  const selectedVoice = sessionStorage.getItem(`interview-voice:${resultId}`) || "kajal";

  const videoRef = useRef(null);
  const autoSubmittedRef = useRef(false);
  const baselineCapturedRef = useRef(false);
  const streamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const answerStartTimeRef = useRef(null);
  const answerTextareaRef = useRef(null);

  const { speak, stop: stopSpeaking, speaking, muted } = useTTS();
  const { proctoringEvents, analyseAnswer } = useProctoring({ sessionId, resultId, interviewToken, enabled: !!sessionId });
  const { announce } = useAnnounce();

  const tabSwitchCount = proctoringEvents.filter((e) => e.type === "TAB_SWITCH").length;
  const micReady = hasActiveAudioTrack(streamRef.current) || hasActiveAudioTrack(audioStreamRef.current);
  const micStatusOk = isRecording || isTranscribing || micReady;

  const loadSession = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const consentGiven = sessionStorage.getItem(`interview-consent:${resultId}`) === "true";
      const response = await interviewApi.start({
        result_id: Number(resultId),
        interview_token: interviewToken || undefined,
        consent_given: consentGiven,
      });

      if (response.interview_completed || !response.current_question) {
        announce("Interview already completed. Redirecting...", "assertive");
        navigate(`/interview/${resultId}/completed`, { replace: true });
        return;
      }

      setSessionId(response.session_id);
      setCurrentQuestion(response.current_question);
      setQuestionNumber(response.question_number || 1);
      setMaxQuestions(response.max_questions || 1);
      setTimeLeft(response.time_limit_seconds || 0);
      setTotalTimeLeft(response.remaining_total_seconds || 0);
      baselineCapturedRef.current = false;
      autoSubmittedRef.current = false;
      answerStartTimeRef.current = Date.now();
      announce(`Question ${response.question_number || 1} of ${response.max_questions || 1} loaded`);
    } catch (e) {
      setError(e.message);
      announce(`Error loading interview: ${e.message}`, "assertive");
    } finally {
      setLoading(false);
    }
  }, [navigate, resultId, interviewToken, announce]);

  const releaseAudioStream = useCallback(() => {
    if (audioStreamRef.current) { stopStreamTracks(audioStreamRef.current); audioStreamRef.current = null; }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!currentQuestion?.text || loading || answerFeedback || muted) return;
    const timer = setTimeout(() => speak(currentQuestion.text, selectedVoice), 700);
    return () => clearTimeout(timer);
  }, [currentQuestion?.id, selectedVoice, loading, answerFeedback, muted, speak]);

  useEffect(() => {
    if (isRecording || isSubmitting) stopSpeaking();
  }, [isRecording, isSubmitting, stopSpeaking]);

  useEffect(() => {
    let disposed = false;
    async function startPreview() {
      setPreviewReady(false);
      if (streamRef.current) { stopStreamTracks(streamRef.current); streamRef.current = null; }
      let waited = 0;
      while (!videoRef.current && waited < 2000) { await new Promise(r => setTimeout(r, 50)); waited += 50; }
      if (disposed || !videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (disposed) { stopStreamTracks(stream); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
        setPreviewReady(true);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (disposed) { stopStreamTracks(stream); return; }
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setPreviewReady(true);
        } catch { setError("Camera access denied."); }
      }
    }
    startPreview();
    return () => {
      disposed = true;
      releaseAudioStream();
      if (streamRef.current) { stopStreamTracks(streamRef.current); streamRef.current = null; }
    };
  }, [releaseAudioStream]);

  useEffect(() => {
    if (!currentQuestion || loading || isSubmitting || answerFeedback) return;
    const id = setInterval(() => {
      setTimeLeft(p => p > 0 ? p - 1 : 0);
      setTotalTimeLeft(p => p > 0 ? p - 1 : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [currentQuestion, isSubmitting, loading, answerFeedback]);

  useEffect(() => {
    if (timeLeft <= 30 && timeLeft > 0 && !timeWarningShown && !autoSubmittedRef.current) {
      setTimeWarningShown(true);
      announce(`${timeLeft} seconds remaining`, "assertive");
    }
    if (timeLeft === 0 && !autoSubmittedRef.current && answer.trim()) {
      autoSubmittedRef.current = true;
      submitAnswer({ skipCurrent: false });
    }
  }, [timeLeft, timeWarningShown, answer, announce]);

  const _advanceAfterAnswer = useCallback((response) => {
    stopSpeaking();
    if (response.interview_completed || !response.next_question) {
      announce("Interview completed. Redirecting to results...", "assertive");
      navigate(`/interview/${resultId}/completed`);
      return;
    }
    setCurrentQuestion(response.next_question);
    setQuestionNumber(response.question_number || questionNumber + 1);
    setMaxQuestions(response.max_questions || maxQuestions);
    setTimeLeft(response.time_limit_seconds || 0);
    setTotalTimeLeft(response.remaining_total_seconds || 0);
    setAnswer("");
    setLastRecordedPreview("");
    setTranscriptionWarning("");
    setTimeWarningShown(false);
    setIsRecording(false);
    setIsTranscribing(false);
    autoSubmittedRef.current = false;
    answerStartTimeRef.current = Date.now();
    setAnswerFeedback(null);
    announce(`Question ${response.question_number || questionNumber + 1} of ${response.max_questions || maxQuestions}`);
    answerTextareaRef.current?.focus();
  }, [navigate, resultId, questionNumber, maxQuestions, stopSpeaking, announce]);

  const submitAnswer = useCallback(async ({ skipCurrent = false, answerOverride } = {}) => {
    if (!sessionId || !currentQuestion) return;
    const resolvedAnswer = skipCurrent ? "" : String(answerOverride ?? answer);
    const normalizedAnswer = resolvedAnswer.trim();
    const durationSeconds = answerStartTimeRef.current ? (Date.now() - answerStartTimeRef.current) / 1000 : 0;

    setIsSubmitting(true);
    setError("");
    try {
      const timeTaken = Math.max(0, (currentQuestion.allotted_seconds || 0) - timeLeft);
      const response = await interviewApi.submitAnswer({
        session_id: sessionId,
        question_id: currentQuestion.id,
        answer_text: skipCurrent ? "" : resolvedAnswer,
        skipped: skipCurrent || !normalizedAnswer,
        time_taken_sec: timeTaken,
      });

      if (!skipCurrent && normalizedAnswer) analyseAnswer(normalizedAnswer, durationSeconds);
      setTranscripts(prev => [...prev, { q: currentQuestion.text, a: skipCurrent ? "" : resolvedAnswer }]);

      if (response.feedback && !skipCurrent && normalizedAnswer) {
        stopSpeaking();
        announce("Feedback received for your answer");
        setAnswerFeedback({ ...response.feedback, _nextResponse: response });
        return;
      }
      _advanceAfterAnswer(response);
    } catch (e) {
      if (e.message?.toLowerCase().includes("already answered")) { await loadSession(); return; }
      setError(e.message);
      announce(`Error submitting answer: ${e.message}`, "assertive");
    } finally {
      setIsSubmitting(false);
    }
  }, [answer, currentQuestion, _advanceAfterAnswer, sessionId, timeLeft, analyseAnswer, stopSpeaking, loadSession, announce]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return { text: "", lowConfidence: true, confidence: null };
    setIsRecording(false); setIsTranscribing(true);
    try {
      return await new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          recorderRef.current = null;
          try {
            const mimeType = recorder.mimeType || getPreferredAudioMimeType() || "audio/webm";
            const { validChunks } = await filterSilentChunks(recordedChunksRef.current);
            const chunksToUse = (validChunks && validChunks.length > 0) ? validChunks : recordedChunksRef.current;
            recordedChunksRef.current = [];
            releaseAudioStream();

            if (chunksToUse.length === 0) {
              console.warn("[AUDIO] No chunks collected at all.");
              resolve({ text: "", lowConfidence: true });
              return;
            }

            const blob = new Blob(chunksToUse, { type: mimeType });
            console.log("[AUDIO] Sending blob for transcription, size:", blob.size);

            const fd = new FormData();
            fd.append("audio", blob, "answer.webm");
            fd.append("context_hint", String(currentQuestion?.text || ""));
            const res = await interviewApi.transcribe(fd);
            resolve({ text: String(res?.text || "").trim(), lowConfidence: !!res?.low_confidence, confidence: res?.confidence });
          } catch (e) { reject(e); }
        };
        recorder.stop();
      });
    } finally { setIsTranscribing(false); }
  }, [currentQuestion, releaseAudioStream]);

  const startRecording = useCallback(async () => {
    if (!window.MediaRecorder) {
      setError("Recording is not supported in your browser. Please use Chrome or Edge.");
      announce("Recording not supported. Please use Chrome or Edge browser.", "assertive");
      return;
    }
    stopSpeaking();
    try {
      let recStream = hasActiveAudioTrack(streamRef.current) ? new MediaStream(streamRef.current.getAudioTracks()) : await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = recStream;
      recordedChunksRef.current = [];
      const rec = new window.MediaRecorder(recStream, { mimeType: getPreferredAudioMimeType() });
      rec.ondataavailable = (ev) => { if (ev.data?.size > 0) recordedChunksRef.current.push(ev.data); };
      rec.start(1000);
      recorderRef.current = rec;
      setIsRecording(true);
      announce("Recording started. Speak your answer now.", "assertive");
    } catch {
      setError("We couldn't access your microphone. Please allow permission from browser settings.");
      announce("Microphone access denied. Please allow permission.", "assertive");
    }
  }, [stopSpeaking, announce]);

  const captureAndUploadFrame = useCallback(async (eventType = "scan") => {
    if (!sessionId || !videoRef.current || !previewReady) return;
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = videoRef.current.videoWidth || 320;
      canvas.height = videoRef.current.videoHeight || 240;
      ctx.drawImage(videoRef.current, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.7));
      if (blob) {
        const res = await proctorApi.uploadFrame(sessionId, blob, eventType);
        if (res?.frame_reasons?.length > 0) {
          setProctorAlert(res.frame_reasons[0]);
          announce(`Security alert: ${res.frame_reasons[0]}`, "assertive");
          setTimeout(() => setProctorAlert(""), 6000);
        }
      }
    } catch {}
  }, [sessionId, previewReady, announce]);

  useEffect(() => {
    if (!sessionId || !previewReady) return;
    const id = setInterval(() => captureAndUploadFrame("scan"), 15000);
    return () => clearInterval(id);
  }, [sessionId, previewReady, captureAndUploadFrame]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || isTranscribing) return;
    let nextAnswer = answer;
    if (isRecording) {
      const t = await stopRecordingAndTranscribe();
      nextAnswer = appendTranscript(answer, t.text);
      setAnswer(nextAnswer);
    }
    await submitAnswer({ answerOverride: nextAnswer });
  }, [answer, isRecording, isSubmitting, isTranscribing, stopRecordingAndTranscribe, submitAnswer]);

  const handleRecordingToggle = useCallback(async () => {
    if (isSubmitting || isTranscribing) return;
    if (!isRecording) { await startRecording(); return; }
    const t = await stopRecordingAndTranscribe();
    if (t.text) setAnswer(prev => appendTranscript(prev, t.text));
    setLastRecordedPreview(t.text || "No speech detected");
    announce("Recording stopped");
  }, [isRecording, isSubmitting, isTranscribing, startRecording, stopRecordingAndTranscribe, announce]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (document.activeElement?.tagName === "TEXTAREA") return;
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); handleRecordingToggle(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRecordingToggle, handleSubmit]);

  if (loading) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center" role="status" aria-label="Loading interview">
      <Loader2 size={40} className="text-blue-500 animate-spin" />
    </div>
  );

  const timeColor = totalTimeLeft < 60 ? "text-red-500" : totalTimeLeft < 300 ? "text-amber-500" : "text-blue-400";
  const timerWarning = timeLeft <= 30 && timeLeft > 0;
  const processingStatus = isSubmitting || isTranscribing ? "processing" : isRecording ? "recording" : "idle";

  return (
    <div className="min-h-screen bg-[#0B1120] font-sans p-4 lg:p-6 transition-all duration-300">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <ProcessingOverlay processingStatus={processingStatus} />
      <EndInterviewModal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
        onConfirm={() => navigate(`/interview/${resultId}/completed`)}
      />

      <div id="main-content" className="max-w-7xl mx-auto space-y-6">
        <header role="banner" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20 animate-pulse" aria-hidden="true">
              <Play size={20} fill="white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Live AI Interview</h1>
              <p className="text-sm text-slate-400 uppercase tracking-widest text-xs font-bold" aria-live="polite">
                Question {questionNumber} of {maxQuestions} — Secure Mode
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3" role="timer" aria-label={`Time remaining: ${formatTime(totalTimeLeft)}`}>
            <div className={cn(
              "flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-xl border border-slate-800 shadow-lg font-mono font-black text-2xl transition-all duration-300",
              timeColor
            )}>
              <Clock size={20} className={cn(timerWarning && "animate-pulse")} aria-hidden="true" />
              <span aria-hidden="true">{formatTime(totalTimeLeft)}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="px-4 py-3 bg-red-600/20 border border-red-500/30 text-red-400 font-bold rounded-xl hover:bg-red-600/30 transition-all duration-300"
              aria-label="End interview"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <nav role="navigation" aria-label="Interview progress" className="flex items-center gap-1.5">
          {[...Array(maxQuestions)].map((_, i) => (
            <div
              key={i}
              className={cn("h-1.5 rounded-full transition-all duration-500",
                i === questionNumber - 1 ? "bg-blue-600 w-8" : i < questionNumber - 1 ? "bg-emerald-500 w-4" : "bg-slate-800 w-4"
              )}
              aria-label={`Question ${i + 1}${i < questionNumber - 1 ? " - completed" : i === questionNumber - 1 ? " - current" : ""}`}
            />
          ))}
          <span className="ml-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {questionNumber} / {maxQuestions}
          </span>
          {timerWarning && (
            <span role="alert" className="ml-auto px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full text-xs font-bold animate-pulse">
              30s left!
            </span>
          )}
        </nav>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TabSwitchAlert count={tabSwitchCount} />
            {proctorAlert && (
              <div role="alert" className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-center gap-3 animate-pulse">
                <div className="bg-amber-500/20 text-amber-400 w-8 h-8 rounded-full flex items-center justify-center font-bold" aria-hidden="true">!</div>
                <p className="text-amber-400 font-bold text-sm">{proctorAlert}</p>
              </div>
            )}

            {answerFeedback ? (
              <AnswerFeedback feedback={answerFeedback} onContinue={() => _advanceAfterAnswer(answerFeedback._nextResponse)} />
            ) : (
              <>
                <article role="region" aria-labelledby="question-heading" className="bg-slate-900/80 backdrop-blur-md border border-slate-800 shadow-lg rounded-2xl p-8 relative overflow-hidden hover:border-slate-700 transition-all duration-300">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-600 to-indigo-600 rounded-r" aria-hidden="true" />
                  <div className="flex items-start gap-6 pl-4">
                    <h2 id="question-heading" className="text-xl md:text-2xl font-bold text-white leading-tight flex-1">
                      {currentQuestion?.text}
                    </h2>
                    <button
                      type="button"
                      onClick={() => speaking ? stopSpeaking() : speak(currentQuestion?.text || "", selectedVoice)}
                      disabled={speaking}
                      aria-label={speaking ? "Stop reading question" : "Read question aloud"}
                      className={cn(
                        "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 hover:scale-[1.02]",
                        speaking ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-blue-400"
                      )}
                    >
                      {speaking ? (
                        <span aria-hidden="true" className="flex items-end gap-1 h-4">
                          {[...Array(4)].map((_, i) => <span key={i} className="w-1 bg-white rounded-full animate-bounce" style={{ height: "100%", animationDelay: `${i * 0.1}s` }} />)}
                        </span>
                      ) : <Volume2 size={20} />}
                    </button>
                  </div>
                </article>

                <section role="region" aria-labelledby="answer-heading" className="bg-slate-900/80 backdrop-blur-md border border-slate-800 shadow-lg rounded-2xl overflow-hidden flex flex-col hover:border-slate-700 transition-all duration-300">
                  <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <h3 id="answer-heading" className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MessageSquare size={14} className="text-blue-400" aria-hidden="true" /> Your Response
                    </h3>
                    <div
                      role="status"
                      aria-live="polite"
                      className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border",
                        isRecording
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : processingStatus === "processing"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      )}
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isRecording ? "bg-red-500" : processingStatus === "processing" ? "bg-amber-500" : "bg-emerald-500")} aria-hidden="true" />
                      <span>{isRecording ? "Recording" : processingStatus === "processing" ? "Processing" : "Ready"}</span>
                    </div>
                  </div>
                  <div className="relative p-6">
                    <label htmlFor="answer-input" className="sr-only">Your answer</label>
                    <textarea
                      id="answer-input"
                      ref={answerTextareaRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Start speaking or type your answer here..."
                      className="w-full h-48 bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-lg leading-relaxed outline-none rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      disabled={isSubmitting || isTranscribing}
                      aria-describedby="answer-hints"
                    />
                    {lastRecordedPreview && !isRecording && !isTranscribing && (
                      <div aria-live="polite" className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-400 uppercase mb-1">Latest recording preview</p>
                        <p className="text-sm text-slate-300 italic">"{lastRecordedPreview}"</p>
                      </div>
                    )}
                  </div>
                </section>

                <div id="answer-hints" className="sr-only">
                  Press Space to start or stop recording. Press Ctrl+Enter or Cmd+Enter to submit.
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <button
                    type="button"
                    onClick={handleRecordingToggle}
                    disabled={isSubmitting || isTranscribing}
                    aria-label={isRecording ? "Stop speaking" : "Start speaking"}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-[1.02] shadow-lg",
                      isRecording
                        ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-red-500/20"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20"
                    )}
                  >
                    {isRecording ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
                    <span>{isRecording ? "Stop Speaking" : isTranscribing ? "Processing..." : "Start Speaking"}</span>
                  </button>
                  <div className="flex gap-3 flex-1 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setAnswer("")}
                      disabled={isSubmitting || isTranscribing || isRecording}
                      className="flex-1 sm:flex-none px-6 py-4 bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm rounded-xl hover:bg-slate-700 transition-all duration-300"
                      aria-label="Clear answer"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || isTranscribing || isRecording || !answer.trim()}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all duration-300 hover:scale-[1.02]"
                      aria-describedby="submit-hint"
                    >
                      <span>{isSubmitting ? "Submitting..." : questionNumber === maxQuestions ? "Finish Interview" : "Submit Answer"}</span>
                      <Send size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p id="submit-hint" className="sr-only">
                  {questionNumber === maxQuestions ? "Submit this answer to finish the interview" : "Submit this answer to proceed to the next question"}
                </p>
              </>
            )}
          </div>

          <aside role="complementary" aria-label="Interview tools" className="space-y-4">
            <section aria-labelledby="security-heading" className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl overflow-hidden p-5 shadow-lg hover:border-slate-700 transition-all duration-300">
              <h3 id="security-heading" className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity size={16} className="text-emerald-400" aria-hidden="true" /> Security Feed
              </h3>
              <div className="relative aspect-video bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  autoPlay
                  muted
                  playsInline
                  aria-label="Camera preview"
                />
                {!previewReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mb-2" aria-hidden="true" />
                    <p className="text-[10px] font-bold uppercase">Waking sensors...</p>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
                  <span className="text-white text-xs font-bold uppercase tracking-widest">LIVE</span>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 mt-4">
                {[
                  ["Status", sessionId ? "Active" : "Pending"],
                  ["Mic", micStatusOk ? "Ok" : "Check"],
                  ["Stability", tabSwitchCount > 0 ? "Alert" : "Stable"],
                  ["Encryption", "TLS 1.3"],
                ].map(([l, v]) => (
                  <div key={l} className="bg-slate-800/50 border border-slate-700 p-3 rounded-xl">
                    <dt className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{l}</dt>
                    <dd className={cn("text-[11px] font-bold", v === "Alert" ? "text-amber-400" : "text-emerald-400")}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="logs-heading" className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-lg max-h-[250px] flex flex-col hover:border-slate-700 transition-all duration-300">
              <h3 id="logs-heading" className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Eye size={16} className="text-blue-400" aria-hidden="true" /> Security Logs
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar" aria-live="polite" aria-label="Security events">
                {proctoringEvents.length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">No events detected</p>}
                {proctoringEvents.map((ev, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700 text-[10px]">
                    <span className="font-bold mt-0.5 text-slate-400" aria-hidden="true">•</span>
                    <div className="flex-1">
                      <p className="font-bold text-slate-300">{ev.type.replace(/_/g, " ")}</p>
                      <p className="text-slate-500 uppercase">{new Date(ev.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="history-heading" className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-lg flex-1 min-h-[200px] flex flex-col hover:border-slate-700 transition-all duration-300">
              <h3 id="history-heading" className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-indigo-400" aria-hidden="true" /> Answer History
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                {transcripts.length === 0 && <p className="text-xs text-slate-500 italic text-center py-8">Waiting for answers</p>}
                {transcripts.map((item, idx) => (
                  <div key={idx} className="border-l-2 border-slate-700 pl-3 space-y-1">
                    <p className="text-[9px] font-bold text-blue-400 uppercase">Question {idx + 1}</p>
                    <p className="text-[10px] text-slate-200 font-bold line-clamp-1">{item.q}</p>
                    <p className="text-[10px] text-slate-400 italic line-clamp-2">"{item.a || "(skipped)"}"</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </main>
        <HelpSupportButton supportEmail="support@quadranttech.com" />
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-announcer" />
    </div>
  );
}