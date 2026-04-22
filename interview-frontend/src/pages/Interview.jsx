import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Mic, MicOff, Send, MessageSquare, CheckCircle2,
  Activity, AlertTriangle, Eye, EyeOff,
  Volume2, VolumeX, Loader2,
} from "lucide-react";
import { interviewApi, proctorApi } from "../services/api";
import { cn } from "../utils/utils";
import AnswerFeedback from "../components/AnswerFeedback";
import { useProctoring } from "../hooks/useProctoring";
import HelpSupportButton from "../components/HelpSupportButton";

const SILENCE_THRESHOLD_RMS = 0.05;
const SILENCE_RATIO_THRESHOLD = 0.5;

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

// ── Amazon Polly TTS hook ─────────────────────────────────────────────────────
function useTTS() {
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);

  const speak = useCallback(async (text, voiceType = "kajal") => {
    if (!text || muted) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    try {
      const { interviewApi } = await import("../services/api");
      const response = await interviewApi.tts(text, voiceType);
      if (response.audio_url) {
        const audio = new Audio(response.audio_url);
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    stop();
    setMuted((m) => !m);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, speaking, muted, toggleMute };
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
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

function VoiceConfidenceBar({ metrics }) {
  if (!metrics) return null;
  const pct = Math.round(metrics.confidence_score * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 uppercase tracking-widest font-bold">Voice</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-slate-300 font-black w-8 text-right">{pct}%</span>
    </div>
  );
}

function TabSwitchAlert({ count }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-2xl text-red-400 text-xs font-bold animate-pulse">
      <AlertTriangle size={14} />
      Tab switch detected × {count} — this is recorded
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Interview() {
  const { resultId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const interviewToken = new URLSearchParams(location.search).get("token") || "";

  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [maxQuestions, setMaxQuestions] = useState(1);
  const [answer, setAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTimeLeft, setTotalTimeLeft] = useState(0);
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(1200);
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [transcriptionWarning, setTranscriptionWarning] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewWarning, setPreviewWarning] = useState("");
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [proctorAlert, setProctorAlert] = useState("");
  const [lastRecordedPreview, setLastRecordedPreview] = useState("");

  const selectedVoice = (() => {
    const saved = sessionStorage.getItem(`interview-voice:${resultId}`);
    return saved || "kajal";
  })();

  const videoRef = useRef(null);
  const autoSubmittedRef = useRef(false);
  const baselineCapturedRef = useRef(false);
  const streamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const answerStartTimeRef = useRef(null);

  // ── TTS ────────────────────────────────────────────────────────────────────
  const { speak, stop: stopSpeaking, speaking, muted, toggleMute } = useTTS();

  // ── proctoring ─────────────────────────────────────────────────────────────
  // FIX C2: Pass resultId to useProctoring so tab-switch events go to the correct
  // backend route /api/interview/{resultId}/event (not /api/interview/{sessionId}/event)
  const {
    proctoringEvents,
    voiceMetrics,
    analyseAnswer,
  } = useProctoring({ sessionId, resultId, interviewToken, enabled: !!sessionId });

  const tabSwitchCount = proctoringEvents.filter((e) => e.type === "TAB_SWITCH").length;
  const micReady = hasActiveAudioTrack(streamRef.current) || hasActiveAudioTrack(audioStreamRef.current);
  const micStatusLabel = isRecording
    ? "Listening"
    : isTranscribing
      ? "Transcribing"
      : micReady
        ? "Ready"
        : "Check access";
  const micStatusOk = isRecording || isTranscribing || micReady;

  // ── session load ───────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    console.log("[Interview] loadSession called, resultId:", resultId);
    setLoading(true);
    setError("");
    try {
      console.log("[Interview] Making API call...");
      const consentGiven = sessionStorage.getItem(`interview-consent:${resultId}`) === "true";
      console.log("[Interview] consentGiven:", consentGiven);

      const response = await interviewApi.start({
        result_id: Number(resultId),
        interview_token: interviewToken || undefined,
        consent_given: consentGiven,
      });

      console.log("[Interview] API SUCCESS! response:", JSON.stringify(response).substring(0, 500));
      console.log("[Interview] session_id:", response.session_id, "current_question:", !!response.current_question);

      if (response.interview_completed || !response.current_question) {
        console.log("[Interview] No question/completed, redirecting to completed");
        navigate(`/interview/${resultId}/completed`, { replace: true });
        return;
      }

      console.log("[Interview] Setting state...");
      setSessionId(response.session_id);
      sessionStorage.setItem(`session-id:${resultId}`, String(response.session_id));
      setCurrentQuestion(response.current_question);
      setQuestionNumber(response.question_number || 1);
      setMaxQuestions(response.max_questions || 1);
      setTimeLeft(response.time_limit_seconds || 0);
      setTotalTimeLeft(response.remaining_total_seconds || 0);
      setTotalTimeSeconds(response.total_time_seconds || 1200);
      baselineCapturedRef.current = false;
      autoSubmittedRef.current = false;
      answerStartTimeRef.current = Date.now();

      console.log("[Interview] State set complete!");
    } catch (e) {
      console.error("[Interview] loadSession ERROR:", e.message, e);
      setError(e.message);
    } finally {
      setLoading(false);
      console.log("[Interview] Finally - loading set to false");
    }
  }, [navigate, resultId]);

  const releaseAudioStream = useCallback(() => {
    if (audioStreamRef.current) { stopStreamTracks(audioStreamRef.current); audioStreamRef.current = null; }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ── AUTO-SPEAK question ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentQuestion?.text || loading || answerFeedback) return;
    if (muted) return;
    const timer = setTimeout(() => {
      speak(currentQuestion.text, selectedVoice);
    }, 700);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, selectedVoice]);

  useEffect(() => {
    if (isRecording || isSubmitting) stopSpeaking();
  }, [isRecording, isSubmitting, stopSpeaking]);

  // ── camera setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    let cleanupVideoEl = null;

    async function startPreview() {
      setPreviewReady(false);
      setPreviewWarning("");

      if (streamRef.current) { stopStreamTracks(streamRef.current); streamRef.current = null; }

      let waited = 0;
      while (!videoRef.current && waited < 2000) {
        await new Promise((r) => setTimeout(r, 50));
        waited += 50;
      }

      if (disposed) return;

      const videoEl = videoRef.current;
      if (!videoEl) {
        setPreviewWarning("Camera preview element not ready. Refresh and try again.");
        return;
      }
      const previewVideoEl = videoEl;
      cleanupVideoEl = previewVideoEl;

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          setPreviewWarning("Microphone unavailable. Camera preview still active.");
        } catch {
          setPreviewWarning("Camera unavailable — please allow camera access in your browser.");
          return;
        }
      }

      if (disposed) { stopStreamTracks(stream); return; }

      streamRef.current = stream;
      previewVideoEl.srcObject = stream;
      previewVideoEl.muted = true;
      previewVideoEl.playsInline = true;

      try {
        await previewVideoEl.play();
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        try { await previewVideoEl.play(); } catch { /* srcObject is still set */ }
      }

      const pollStart = Date.now();
      const poll = () => {
        if (disposed) return;
        if (previewVideoEl.videoWidth > 0 && previewVideoEl.readyState >= 2) {
          setPreviewReady(true);
        } else if (Date.now() - pollStart < 8000) {
          setTimeout(poll, 200);
        } else {
          setPreviewReady(true);
        }
      };
      setTimeout(poll, 200);
    }

    startPreview();

    return () => {
      disposed = true;
      const rec = recorderRef.current;
      if (rec) { try { if (rec.state !== "inactive") rec.stop(); } catch {} recorderRef.current = null; }
      recordedChunksRef.current = [];
      releaseAudioStream();
      if (streamRef.current) { stopStreamTracks(streamRef.current); streamRef.current = null; }
      if (cleanupVideoEl) cleanupVideoEl.srcObject = null;
    };
  }, [releaseAudioStream]);

  // ── timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentQuestion || loading || isSubmitting || answerFeedback) return;
    const id = setInterval(() => {
      setTimeLeft((p) => (p > 0 ? p - 1 : 0));
      setTotalTimeLeft((p) => (p > 0 ? p - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [currentQuestion, isSubmitting, loading, answerFeedback]);

  // ── advance after answer ───────────────────────────────────────────────────
  const _advanceAfterAnswer = useCallback((response) => {
    stopSpeaking();
    if (response.interview_completed || !response.next_question) {
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
    setIsRecording(false);
    setIsTranscribing(false);
    autoSubmittedRef.current = false;
    answerStartTimeRef.current = Date.now();
    setAnswerFeedback(null);
  }, [navigate, resultId, questionNumber, maxQuestions, stopSpeaking]);

  // ── submit answer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async ({ skipCurrent = false, answerOverride } = {}) => {
    if (!sessionId || !currentQuestion) return;
    const resolvedAnswer = skipCurrent ? "" : String(answerOverride ?? answer);
    const normalizedAnswer = resolvedAnswer.trim();
    const durationSeconds = answerStartTimeRef.current
      ? (Date.now() - answerStartTimeRef.current) / 1000 : 0;

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

      setTranscripts((prev) => [...prev, { q: currentQuestion.text, a: skipCurrent ? "" : resolvedAnswer }]);

      if (response.feedback && !skipCurrent && normalizedAnswer) {
        stopSpeaking();
        setAnswerFeedback({ ...response.feedback, _nextResponse: response });
        return;
      }

      _advanceAfterAnswer(response);
    } catch (e) {
      // FIX I1: If the question was already answered (double-submit or race condition),
      // treat it as success and reload session to get the next unanswered question.
      // Previously this showed a confusing red error to the candidate.
      if (e.message && e.message.toLowerCase().includes("already answered")) {
        autoSubmittedRef.current = false;
        setError("");
        await loadSession();
        return;
      }
      setError(e.message);
      autoSubmittedRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [answer, currentQuestion, _advanceAfterAnswer, sessionId, timeLeft, analyseAnswer, stopSpeaking, loadSession]);

  // ── recording ──────────────────────────────────────────────────────────────
  const stopRecordingAndTranscribe = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return { text: "", lowConfidence: true, confidence: null };
    setIsRecording(false);
    setIsTranscribing(true);
    setError("");
    try {
      return await new Promise((resolve, reject) => {
        recorder.onerror = (ev) => reject(new Error(ev?.error?.message || "Recording failed."));
        recorder.onstop = async () => {
          recorderRef.current = null;
          try {
            const mimeType = recorder.mimeType || getPreferredAudioMimeType() || "audio/webm";
            const { validChunks, isMostlySilent } = await filterSilentChunks(recordedChunksRef.current);
            recordedChunksRef.current = [];
            releaseAudioStream();
            if (isMostlySilent || validChunks.length === 0) {
              resolve({ text: "", lowConfidence: true, confidence: null });
              return;
            }
            const blob = new Blob(validChunks, { type: mimeType });
            if (!blob || blob.size < 1000) { resolve({ text: "", lowConfidence: true, confidence: null }); return; }
            const fd = new FormData();
            const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
            fd.append("audio", blob, `answer.${ext}`);
            fd.append("language", (navigator.language || "en").split("-")[0] || "en");
            fd.append("context_hint", String(currentQuestion?.text || ""));
            const res = await interviewApi.transcribe(fd);
            resolve({
              text: String(res?.text || "").trim(),
              lowConfidence: Boolean(res?.low_confidence),
              confidence: typeof res?.confidence === "number" ? res.confidence : null,
            });
          } catch (e) { reject(e); }
        };
        recorder.stop();
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [currentQuestion, releaseAudioStream]);

  const startRecording = useCallback(async () => {
    if (!window.MediaRecorder) { setError("Voice recording not supported. Please use Chrome, Edge, or Firefox browser."); return; }
    setError(""); setTranscriptionWarning("");
    stopSpeaking();
    try {
      let recStream;
      if (hasActiveAudioTrack(streamRef.current)) {
        recStream = new MediaStream(streamRef.current.getAudioTracks());
      } else {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioStreamRef.current = recStream;
      }
      if (!recStream || recStream.getAudioTracks().length === 0) {
        throw new Error("No audio track available");
      }
      recordedChunksRef.current = [];
      const mimeType = getPreferredAudioMimeType();
      const rec = mimeType
        ? new window.MediaRecorder(recStream, { mimeType })
        : new window.MediaRecorder(recStream);
      rec.ondataavailable = (ev) => { if (ev.data?.size > 0) recordedChunksRef.current.push(ev.data); };
      rec.onerror = () => {
        recorderRef.current = null; recordedChunksRef.current = []; releaseAudioStream();
        setIsRecording(false); setError(" Recording interrupted. Check your microphone permissions in browser settings and try again.");
      };
      rec.start();
      recorderRef.current = rec;
      answerStartTimeRef.current = Date.now();
      setIsRecording(true);
    } catch {
      releaseAudioStream();
      setError("Microphone access blocked. Click the lock icon in your browser address bar, allow microphone access, then refresh the page.");
    }
  }, [releaseAudioStream, stopSpeaking]);

  // ── proctoring frame capture ───────────────────────────────────────────────
  const captureAndUploadFrame = useCallback(async (eventType = "scan") => {
    if (!sessionId || !videoRef.current || !previewReady) return;
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = videoRef.current.videoWidth || 320;
      canvas.height = videoRef.current.videoHeight || 240;
      ctx.drawImage(videoRef.current, 0, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.7));
      if (blob) {
        const res = await proctorApi.uploadFrame(sessionId, blob, eventType);

        // NEW: Real-time proctoring alerts to candidate
        if (res && res.frame_reasons && res.frame_reasons.length > 0) {
          setProctorAlert(res.frame_reasons[0]);
          // Auto-clear alert after 6 seconds
          setTimeout(() => setProctorAlert(""), 6000);
        } else {
          setProctorAlert("");
        }
      }
    } catch (err) {
      if (err?.message?.includes("429")) {
        setProctorAlert("Interview is paused due to repeated framing violations.");
        setTimeout(() => {
          setProctorAlert("");
          loadSession();
        }, 6000);
      }
      // silent fail for other errors
    }
  }, [sessionId, previewReady, loadSession]);

  useEffect(() => {
    if (!sessionId || !previewReady || baselineCapturedRef.current) return;
    baselineCapturedRef.current = true;
    const t = setTimeout(() => void captureAndUploadFrame("baseline"), 2000);
    return () => clearTimeout(t);
  }, [sessionId, previewReady, captureAndUploadFrame]);

  useEffect(() => {
    if (!sessionId || !previewReady) return;
    const id = setInterval(() => void captureAndUploadFrame("scan"), 15000);
    return () => clearInterval(id);
  }, [sessionId, previewReady, captureAndUploadFrame]);

  // ── auto-submit on timer expiry ────────────────────────────────────────────
  const handleSubmit = useCallback(async (skipCurrent = false) => {
    if (isSubmittingRef.current || isTranscribingRef.current) return;
    let nextAnswer = answer;
    if (isRecordingRef.current) {
      try {
        const t = await stopRecordingAndTranscribe();
        nextAnswer = appendTranscript(answer, t.text);
        if (t.lowConfidence) {
          const suf = typeof t.confidence === "number" ? ` (${(t.confidence * 100).toFixed(0)}% clarity)` : "";
          setTranscriptionWarning(`We couldn't clearly hear your answer${suf}. Please review or edit before submitting.`);
        } else { setTranscriptionWarning(""); }
        if (t.text) setAnswer(nextAnswer);
      } catch (e) { setError("Something went wrong. Please check your internet and try again."); autoSubmittedRef.current = false; return; }
    }
    await submitAnswer({ skipCurrent, answerOverride: nextAnswer });
  }, [answer, stopRecordingAndTranscribe, submitAnswer]);

  useEffect(() => {
    if (!currentQuestion || answerFeedback) return;
    if (timeLeft > 0) return;
    if (autoSubmittedRef.current) return;
    if (isSubmittingRef.current || isTranscribingRef.current) return;
    autoSubmittedRef.current = true;
    (async () => {
      try { await handleSubmit(false); }
      catch (e) { console.error("Auto-submit failed:", e); autoSubmittedRef.current = false; }
    })();
  }, [timeLeft, currentQuestion, answerFeedback, handleSubmit]);

  // ── Keyboard Shortcuts (use refs to avoid stale closures) ─────────────────────
  const isRecordingRef = useRef(false);
  const isTranscribingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isTranscribingRef.current = isTranscribing; }, [isTranscribing]);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

  const handleRecordingToggle = useCallback(async () => {
    if (isSubmittingRef.current || isTranscribingRef.current) return;
    if (!isRecordingRef.current) { await startRecording(); return; }
    try {
      const t = await stopRecordingAndTranscribe();
      if (!t.text) { setError("No speech detected. Try speaking louder or type your answer in the box below."); setLastRecordedPreview(""); return; }
      if (t.lowConfidence) {
        const suf = typeof t.confidence === "number" ? ` (${(t.confidence * 100).toFixed(0)}% clarity)` : "";
        setTranscriptionWarning(`We couldn't clearly hear your answer${suf}. Please review or edit before submitting.`);
      } else { setTranscriptionWarning(""); }
      setLastRecordedPreview(t.text || "No speech detected");
      setAnswer((prev) => appendTranscript(prev, t.text));
    } catch (e) { setError("Something went wrong. Please check your internet and try again."); setLastRecordedPreview(""); }
  }, [startRecording, stopRecordingAndTranscribe]);

  useEffect(() => {
    function handleKeyDown(e) {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isTyping) return;
      if (isSubmittingRef.current || isTranscribingRef.current) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        handleRecordingToggle();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRecordingToggle, handleSubmit]);

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-xl">Starting interview session...</p>
    </div>
  );
  if (error && !currentQuestion) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-red-900/50 border border-red-500 p-6 rounded-2xl max-w-md text-center">
        <p className="text-red-400 font-bold text-lg mb-2">Cannot Start Interview</p>
        <p className="text-red-300 mb-4">{error}</p>
        <button
          onClick={() => navigate(`/interview/${resultId}`)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold"
        >
          Go Back to Pre-Check
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 font-sans p-4 lg:p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 page-enter">

        {/* ── LEFT — question + answer ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {error && <p className="alert error">{error}</p>}
          <TabSwitchAlert count={tabSwitchCount} />
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-300 shadow-lg">
            <p className="font-bold text-white">Interview setup</p>
            <p className="mt-1 leading-relaxed">
              Keep camera and microphone access enabled, answer in your own words, and use the recording button when speaking feels easier.
            </p>
          </div>

          {/* Progress + timers + mute toggle */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-900/40 text-blue-400 w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border border-blue-800/50">
                {questionNumber}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Question {questionNumber} of {maxQuestions}
                </p>
                <p className="text-slate-200 font-bold text-sm">
                  {answerFeedback ? "Review your answer" : "Live Interview"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                title={muted ? "Enable question voice" : "Mute question voice"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-all",
                  muted
                    ? "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                    : "bg-blue-900/30 border-blue-700/50 text-blue-400 hover:bg-blue-900/50"
                )}
              >
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                <span className="hidden sm:inline">{muted ? "Voice Off" : "Voice On"}</span>
              </button>

              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Time</p>
                <p className={cn("text-xl font-black font-mono",
                  totalTimeLeft < 60 ? "text-red-400 animate-pulse" : "text-slate-200")}>
                  {formatTime(totalTimeLeft)}
                </p>
              </div>
            </div>
          </div>

          {/* Total Time Progress Bar */}
          <div className="bg-slate-900/50 border border-slate-800/50 h-3 rounded-full overflow-hidden mb-2 relative">
            <div
              className={cn(
                "h-full transition-all duration-1000 ease-linear",
                (totalTimeLeft / totalTimeSeconds) > 0.5 ? "bg-emerald-500" :
                  (totalTimeLeft / totalTimeSeconds) > 0.2 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${Math.min(100, (totalTimeLeft / totalTimeSeconds) * 100)}%` }}
            />
          </div>

          {/* 🕵️ NEW: Proctoring Toast Alert */}
          {proctorAlert && (
            <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-2xl flex items-center gap-3 animate-bounce">
              <div className="bg-amber-500 text-slate-900 w-8 h-8 rounded-full flex items-center justify-center font-black">
                !
              </div>
              <div>
                <p className="text-xs font-black text-amber-500 uppercase tracking-widest">Compliance Alert</p>
                <p className="text-slate-200 font-bold text-sm">{proctorAlert}</p>
              </div>
            </div>
          )}

          {/* Question card with replay button */}
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
            <div className="flex items-start gap-4 pl-4">
              <h2 className="text-2xl font-bold text-white leading-tight flex-1">
                {currentQuestion?.text}
              </h2>
              <button
                type="button"
                onClick={() => speaking ? stopSpeaking() : speak(currentQuestion?.text || "", selectedVoice)}
                disabled={speaking}
                title={speaking ? "Stop" : "Read question aloud (Indian accent)"}
                className={cn(
                  "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-all",
                  speaking
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-600",
                  speaking && "opacity-50 cursor-wait"
                )}
              >
                {speaking ? (
                  <span className="flex items-end gap-1 h-4">
                    {[...Array(4)].map((_, i) => (
                      <span 
                        key={i} 
                        className="w-1 bg-white rounded-full animate-[bounce_1s_infinite]" 
                        style={{ 
                          height: i % 2 === 0 ? "100%" : "60%", 
                          animationDelay: `${i * 0.1}s` 
                        }} 
                      />
                    ))}
                  </span>
                ) : (
                  <Volume2 size={18} />
                )}
              </button>

              {transcriptionWarning && (
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
                  {transcriptionWarning}
                </p>
              )}

              {lastRecordedPreview && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Latest recording preview</p>
                  <p className="text-sm text-blue-100 italic leading-relaxed">"{lastRecordedPreview}"</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleRecordingToggle}
                  disabled={isSubmitting || isTranscribing || isRecording}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-50",
                    isRecording ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                  )}
                >
                  {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                  {isRecording ? "Stop & Transcribe" : isTranscribing ? "Transcribing…" : "Start Speaking"}
                </button>

                <div className="flex gap-3 flex-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => { setAnswer(""); setLastRecordedPreview(""); }}
                    disabled={isSubmitting || isTranscribing || isRecording}
                    className="flex-1 sm:flex-none px-5 py-3.5 rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 font-bold text-sm transition-all"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={isSubmitting || isTranscribing || isRecording}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm transition-all disabled:opacity-50"
                  >
                    <span>{isSubmitting ? "Submitting…" : questionNumber === maxQuestions ? "Finish" : "Submit"}</span>
                    <Send size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-500 text-center pt-1">
                  Press Space to record • Ctrl + Enter to submit
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT — proctoring panel ───────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-emerald-400" />
                Proctoring Feed
              </h4>

              <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
                {!previewReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                    <Activity size={28} className="mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No Feed</p>
                  </div>
                )}

                {speaking && (
                  <div className="absolute bottom-10 left-2 flex items-center gap-1 bg-blue-600/80 px-2 py-1 rounded-full border border-blue-400/30">
                    <Volume2 size={10} className="text-white animate-pulse" />
                    <span className="text-[9px] font-black text-white">Reading…</span>
                  </div>
                )}

                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full border border-white/10">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
                </div>
              </div>

              {/* Status grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Video", previewReady ? "Active" : "Disabled", previewReady],
                  ["Session", sessionId ? `ID: ${sessionId}` : "Not started", !!sessionId],
                  ["Microphone", micStatusOk ? "Receiving" : "No Signal", micStatusOk],
                  ["Tabs", tabSwitchCount > 0 ? `${tabSwitchCount} Warning${tabSwitchCount > 1 ? "s" : ""}` : "Secure", tabSwitchCount === 0],
                ].map(([label, value, ok]) => (
                  <div key={label} className={cn(
                    "bg-slate-800/60 border rounded-xl p-2.5 transition-colors",
                    ok ? "border-slate-700/50" : "border-amber-500/30 bg-amber-500/5"
                  )}>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
                    <p className={cn("text-xs font-black mt-0.5 truncate", ok ? "text-emerald-400" : "text-amber-400")}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Question Voice (en-IN)</p>
                  <p className={cn("text-xs font-black mt-0.5",
                    speaking ? "text-blue-400" : muted ? "text-amber-400" : "text-emerald-400")}>
                    {speaking ? "Speaking question…" : muted ? "Muted" : "Auto-speak ON"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleMute}
                  className={cn(
                    "p-1.5 rounded-lg border transition-all",
                    muted
                      ? "bg-slate-700 border-slate-600 text-slate-400 hover:text-white"
                      : "bg-blue-900/30 border-blue-700/50 text-blue-400 hover:bg-blue-900/50"
                  )}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>

              {previewWarning && (
                <p className="text-[10px] text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5 border border-amber-500/20">
                  {previewWarning}
                </p>
              )}
            </div>

            {/* Event log */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-72 overflow-hidden flex flex-col">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
                <Eye size={14} className="text-blue-400" />
                Event Log
                {proctoringEvents.length > 0 && (
                  <span className="ml-auto bg-slate-800 text-slate-400 text-[9px] font-black px-2 py-0.5 rounded-full border border-slate-700">
                    {proctoringEvents.length}
                  </span>
                )}
              </h4>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {proctoringEvents.length === 0 && (
                  <div className="text-center py-6 opacity-30">
                    <EyeOff size={28} className="mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">No events</p>
                  </div>
                )}
                {proctoringEvents.map((ev, i) => {
                  const isAlert = ev.type === "TAB_SWITCH";
                  const isVoice = ev.type === "VOICE_CONFIDENCE";
                  return (
                    <div key={i} className={cn(
                      "flex items-start gap-2 px-2.5 py-2 rounded-lg text-[10px] border",
                      isAlert ? "bg-red-500/10 border-red-500/30 text-red-400" :
                        isVoice ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          "bg-slate-800/50 border-slate-700/50 text-slate-500"
                    )}>
                      <span className="font-black flex-shrink-0">
                        {isAlert ? "⚠" : isVoice ? "🎤" : "·"}
                      </span>
                      <span className="font-bold leading-tight">
                        {isAlert && "Tab switch detected"}
                        {isVoice && `Voice: ${ev.confidence_score >= 0.7 ? "confident" : "hesitant"} · ${ev.speaking_rate}wpm`}
                        {!isAlert && !isVoice && ev.type}
                      </span>
                      <span className="ml-auto flex-shrink-0 opacity-50">
                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Session log */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 flex-1 flex flex-col min-h-40">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 size={14} className="text-blue-400" />
                Session Log
              </h4>
              <div className="flex-1 overflow-y-auto space-y-3">
                {transcripts.length === 0 && (
                  <div className="text-center py-4 opacity-30">
                    <MessageSquare size={24} className="mx-auto mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">No answers yet</p>
                  </div>
                )}
                {transcripts.map((item, idx) => (
                  <div key={idx} className="border-l-2 border-slate-700 pl-3 space-y-0.5">
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Q{idx + 1}</p>
                    <p className="text-[10px] text-slate-300 font-bold line-clamp-2">{item.q}</p>
                    <p className="text-[10px] text-slate-500 italic line-clamp-2">"{item.a || "(skipped)"}"</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
        <HelpSupportButton supportEmail="support@quadranttech.com" />
      </div>
    </div>
  );
}
