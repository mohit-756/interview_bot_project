import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { interviewApi } from "../services/api";

function appendTranscript(baseText, chunk) {
  const cleanChunk = (chunk || "").trim();
  if (!cleanChunk) return baseText || "";
  const cleanBase = (baseText || "").trim();
  if (!cleanBase) return cleanChunk;
  return `${cleanBase} ${cleanChunk}`.replace(/\s+/g, " ").trim();
}

function speechErrorMessage(errorCode) {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "Microphone permission denied. Allow access and retry.";
  }
  if (errorCode === "no-speech") {
    return "No speech detected. Speak clearly and try again.";
  }
  if (errorCode === "network") {
    return "Speech service network error. Check internet and retry.";
  }
  if (errorCode === "audio-capture") {
    return "Microphone is unavailable. Check your device.";
  }
  return "Voice recognition failed. Please retry.";
}

function getSpeechConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function Interview() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const numericResultId = Number(resultId);
  const routeResultId = Number.isFinite(numericResultId) && numericResultId > 0 ? numericResultId : 0;
  const bootstrap = location.state?.bootstrap || null;
  const token = String(resultId || "").trim();

  const previewRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const micStateRef = useRef("idle");
  const finalTranscriptRef = useRef("");
  const baseAnswerRef = useRef("");
  const trackStateRef = useRef({ camActive: null, micActive: null });
  const tabSwitchCountRef = useRef(0);
  const autoSkipLockRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [maxQuestions, setMaxQuestions] = useState(0);
  const [questionTimeLimit, setQuestionTimeLimit] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [remainingTotalSeconds, setRemainingTotalSeconds] = useState(0);
  const [answerText, setAnswerText] = useState("");

  const [speechSupported, setSpeechSupported] = useState(false);
  const [micState, setMicState] = useState("idle");
  const [speechInterimText, setSpeechInterimText] = useState("");
  const [speechError, setSpeechError] = useState("");

  const [cameraGranted, setCameraGranted] = useState(Boolean(location.state?.precheck?.cameraGranted));
  const [micGranted, setMicGranted] = useState(Boolean(location.state?.precheck?.micGranted));
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [eventLog, setEventLog] = useState([]);

  const hasActiveQuestion = Boolean(sessionId && currentQuestion);
  const speechBusy = micState === "starting" || micState === "stopping";
  const speechListening = micState === "recording";
  const speechDisabled = !hasActiveQuestion || submitting;

  const timerClassName = useMemo(() => {
    if (remainingSeconds <= 5) return "timer-chip danger";
    if (remainingSeconds <= 15) return "timer-chip warn";
    return "timer-chip";
  }, [remainingSeconds]);

  const addEvent = useCallback(
    (eventType, detail, meta = {}) => {
      const nowIso = new Date().toISOString();
      const row = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        eventType,
        detail,
        timestamp: nowIso,
      };
      setEventLog((prev) => [row, ...prev].slice(0, 12));

      if (!token) return;
      interviewApi.sendEvent(token, {
        event_type: eventType,
        detail,
        meta,
        timestamp: nowIso,
      }).catch(() => undefined);
    },
    [token],
  );

  const applySessionPayload = useCallback(
    (payload) => {
      if (!payload?.session_id) {
        throw new Error("Could not initialize interview session.");
      }
      setSessionId(payload.session_id);
      setCurrentQuestion(payload.current_question || null);
      setQuestionNumber(payload.question_number || 0);
      setMaxQuestions(payload.max_questions || 0);
      setQuestionTimeLimit(payload.time_limit_seconds || 0);
      setRemainingSeconds(payload.time_limit_seconds || 0);
      setRemainingTotalSeconds(payload.remaining_total_seconds || 0);
      setAnswerText("");
      setSpeechInterimText("");
      baseAnswerRef.current = "";
      finalTranscriptRef.current = "";
      autoSkipLockRef.current = false;

      if (!payload.current_question || payload.interview_completed) {
        navigate(`/interview/${resultId}/completed?sessionId=${payload.session_id}`, { replace: true });
      }
    },
    [navigate, resultId],
  );

  const bootstrapSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (bootstrap?.session_id) {
        applySessionPayload(bootstrap);
      } else {
        const body = { consent_given: true };
        if (routeResultId > 0) body.result_id = routeResultId;
        const payload = await interviewApi.start(body);
        applySessionPayload(payload);
      }
    } catch (initError) {
      setError(initError.message);
    } finally {
      setLoading(false);
    }
  }, [applySessionPayload, bootstrap, routeResultId]);

  const stopMediaStream = useCallback(() => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }, []);

  const updateTrackState = useCallback(
    (silent = false) => {
      const stream = streamRef.current;
      const videoTrack = stream?.getVideoTracks?.()[0];
      const audioTrack = stream?.getAudioTracks?.()[0];
      const camLive = Boolean(videoTrack && videoTrack.readyState === "live" && videoTrack.enabled);
      const micLive = Boolean(audioTrack && audioTrack.readyState === "live" && audioTrack.enabled);

      setCameraActive(camLive);
      setMicActive(micLive);

      if (!silent && trackStateRef.current.camActive === true && !camLive) {
        addEvent("camera_off", "Camera stream became unavailable.");
      }
      if (!silent && trackStateRef.current.micActive === true && !micLive) {
        addEvent("mic_off", "Microphone stream became unavailable.");
      }
      trackStateRef.current = { camActive: camLive, micActive: micLive };
    },
    [addEvent],
  );

  const initializeMedia = useCallback(async () => {
    stopMediaStream();
    setError("");
    try {
      const fullStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = fullStream;
      if (previewRef.current) {
        previewRef.current.srcObject = fullStream;
      }
      setCameraGranted(true);
      setMicGranted(true);
      updateTrackState(true);

      const videoTrack = fullStream.getVideoTracks()[0];
      const audioTrack = fullStream.getAudioTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          setCameraActive(false);
          addEvent("camera_off", "Camera stream stopped.");
        });
      }
      if (audioTrack) {
        audioTrack.addEventListener("ended", () => {
          setMicActive(false);
          addEvent("mic_off", "Microphone stream stopped.");
        });
      }
      return;
    } catch {
      // Fall through to granular checks.
    }

    try {
      const camOnly = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = camOnly;
      if (previewRef.current) {
        previewRef.current.srcObject = camOnly;
      }
      setCameraGranted(true);
      updateTrackState(true);
      camOnly.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          setCameraActive(false);
          addEvent("camera_off", "Camera stream stopped.");
        }),
      );
    } catch {
      setCameraGranted(false);
      setCameraActive(false);
    }

    try {
      const micOnly = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      setMicGranted(true);
      setMicActive(true);
      micOnly.getAudioTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          setMicActive(false);
          addEvent("mic_off", "Microphone stream stopped.");
        }),
      );
      micOnly.getTracks().forEach((track) => track.stop());
    } catch {
      setMicGranted(false);
      setMicActive(false);
    }
  }, [addEvent, stopMediaStream, updateTrackState]);

  const stopVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (micStateRef.current !== "recording") return;
    micStateRef.current = "stopping";
    setMicState("stopping");
    try {
      recognition.stop();
    } catch {
      micStateRef.current = "idle";
      setMicState("idle");
    }
  }, []);

  const startVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || speechDisabled) return;
    if (micStateRef.current !== "idle") return;

    baseAnswerRef.current = answerText;
    finalTranscriptRef.current = "";
    setSpeechInterimText("");
    setSpeechError("");
    micStateRef.current = "starting";
    setMicState("starting");
    try {
      recognition.start();
    } catch {
      micStateRef.current = "idle";
      setMicState("idle");
      setSpeechError("Could not start voice recognition.");
    }
  }, [answerText, speechDisabled]);

  const waitForMicIdle = useCallback(() => {
    return new Promise((resolve) => {
      if (micStateRef.current === "idle") {
        resolve();
        return;
      }
      const startedAt = Date.now();
      const intervalId = setInterval(() => {
        if (micStateRef.current === "idle" || Date.now() - startedAt > 1500) {
          clearInterval(intervalId);
          resolve();
        }
      }, 50);
    });
  }, []);

  const submitAnswer = useCallback(
    async (skipped = false) => {
      if (!sessionId || !currentQuestion || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        if (micStateRef.current === "recording") {
          stopVoiceInput();
        }
        await waitForMicIdle();

        const elapsed = Math.max(0, questionTimeLimit - remainingSeconds);
        const timeTaken = skipped ? questionTimeLimit : Math.max(1, Math.min(questionTimeLimit, elapsed));

        const response = await interviewApi.submitAnswer({
          session_id: sessionId,
          question_id: currentQuestion.id,
          answer_text: skipped ? "" : answerText.trim(),
          skipped,
          time_taken_sec: timeTaken,
        });

        if (response?.interview_completed || !response?.next_question) {
          navigate(`/interview/${resultId}/completed?sessionId=${sessionId}`, { replace: true });
          return;
        }

        setCurrentQuestion(response.next_question);
        setQuestionNumber(response.question_number || questionNumber + 1);
        setMaxQuestions(response.max_questions || maxQuestions);
        setQuestionTimeLimit(response.time_limit_seconds || questionTimeLimit);
        setRemainingSeconds(response.time_limit_seconds || questionTimeLimit);
        setRemainingTotalSeconds(response.remaining_total_seconds || remainingTotalSeconds);
        setAnswerText("");
        setSpeechInterimText("");
        baseAnswerRef.current = "";
        finalTranscriptRef.current = "";
        autoSkipLockRef.current = false;
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      answerText,
      currentQuestion,
      maxQuestions,
      navigate,
      questionNumber,
      questionTimeLimit,
      remainingSeconds,
      remainingTotalSeconds,
      resultId,
      sessionId,
      stopVoiceInput,
      submitting,
      waitForMicIdle,
    ],
  );

  useEffect(() => {
    void bootstrapSession();
    void initializeMedia();

    const SpeechCtor = getSpeechConstructor();
    if (!SpeechCtor) {
      setSpeechSupported(false);
      return () => {
        stopMediaStream();
      };
    }
    setSpeechSupported(true);
    const recognition = new SpeechCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      micStateRef.current = "recording";
      setMicState("recording");
      setSpeechError("");
      addEvent("recording_started", "Voice recording started.");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) {
          finalChunk = appendTranscript(finalChunk, transcript);
        } else {
          interim = appendTranscript(interim, transcript);
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current = appendTranscript(finalTranscriptRef.current, finalChunk);
      }
      const withFinal = appendTranscript(baseAnswerRef.current, finalTranscriptRef.current);
      const fullText = appendTranscript(withFinal, interim);
      setSpeechInterimText(interim);
      setAnswerText(fullText);
    };

    recognition.onerror = (event) => {
      const code = event?.error || "unknown";
      setSpeechError(speechErrorMessage(code));
      if (code === "not-allowed" || code === "service-not-allowed") {
        setMicGranted(false);
        addEvent("mic_off", "Microphone permission denied.", { error: code });
      } else if (code === "audio-capture") {
        setMicActive(false);
        addEvent("mic_off", "Microphone capture failed.", { error: code });
      } else {
        addEvent("recording_error", speechErrorMessage(code), { error: code });
      }
    };

    recognition.onend = () => {
      const prevState = micStateRef.current;
      micStateRef.current = "idle";
      setMicState("idle");
      setSpeechInterimText("");
      if (prevState === "recording" || prevState === "stopping") {
        addEvent("recording_stopped", "Voice recording stopped.");
      }
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
      stopMediaStream();
    };
  }, [addEvent, bootstrapSession, initializeMedia, stopMediaStream]);

  useEffect(() => {
    if (!hasActiveQuestion || submitting) return undefined;
    if (remainingSeconds <= 0 || remainingTotalSeconds <= 0) {
      if (!autoSkipLockRef.current) {
        autoSkipLockRef.current = true;
        void submitAnswer(true);
      }
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1));
      setRemainingTotalSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasActiveQuestion, remainingSeconds, remainingTotalSeconds, submitAnswer, submitting]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      const nextCount = tabSwitchCountRef.current + 1;
      tabSwitchCountRef.current = nextCount;
      setTabSwitchCount(nextCount);
      addEvent("tab_switch", "Candidate switched tab/window.", { tab_switch_count: nextCount });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [addEvent]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      updateTrackState(false);
    }, 2000);
    return () => {
      clearInterval(intervalId);
    };
  }, [updateTrackState]);

  useEffect(() => {
    if (!speechDisabled) return;
    stopVoiceInput();
  }, [speechDisabled, stopVoiceInput]);

  if (loading) {
    return <p className="center muted">Loading interview session...</p>;
  }

  return (
    <div className="stack">
      <header className="title-row">
        <h2>Live Interview</h2>
        <span className={timerClassName}>Q Timer: {remainingSeconds}s</span>
      </header>

      {error && <p className="alert error">{error}</p>}

      <div className="interview-layout">
        <section className="card stack-sm interview-main">
          <p>
            Question {questionNumber} / {maxQuestions} | Total Time Left: {remainingTotalSeconds}s
          </p>
          <div className="question-box">
            {currentQuestion?.text || "No active question. Complete this interview session."}
          </div>
          <textarea
            rows={7}
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder="Speak or type your answer..."
            disabled={!hasActiveQuestion || submitting}
          />
          <div className="inline-row">
            <button
              type="button"
              className={`voice-button ${speechListening ? "active" : ""}`}
              onClick={() => {
                if (speechListening) {
                  stopVoiceInput();
                } else {
                  startVoiceInput();
                }
              }}
              disabled={speechBusy || (!speechListening && (!speechSupported || speechDisabled))}
            >
              {speechBusy ? (speechListening ? "Stopping..." : "Starting...") : speechListening ? "Stop Mic" : "Start Mic"}
            </button>
            <span className={`voice-status ${speechListening ? "active" : ""}`}>
              {speechBusy ? "Mic Busy" : speechListening ? "Recording" : "Idle"}
            </span>
          </div>
          {!speechSupported && <p className="muted">Web Speech API is not supported in this browser.</p>}
          {speechInterimText && <p className="live-transcript">Live: {speechInterimText}</p>}
          {speechError && <p className="alert error">{speechError}</p>}
          <div className="inline-row">
            <button disabled={!hasActiveQuestion || submitting} onClick={() => submitAnswer(false)}>
              {submitting ? "Submitting..." : "Submit Answer"}
            </button>
            <button disabled={!hasActiveQuestion || submitting} onClick={() => submitAnswer(true)}>
              Skip Question
            </button>
          </div>
        </section>

        <aside className="card stack-sm interview-side">
          <h3>Proctoring</h3>
          <video ref={previewRef} className="interview-video preview-small" autoPlay muted playsInline />
          <div className="stack-sm">
            <p className="muted">
              Camera: <strong>{cameraGranted ? "Granted" : "Denied"}</strong>
            </p>
            <p className="muted">
              Mic: <strong>{micGranted ? "Granted" : "Denied"}</strong>
            </p>
            <p className="muted">
              Camera Stream: <strong>{cameraActive ? "Active" : "Off"}</strong>
            </p>
            <p className="muted">
              Mic Stream: <strong>{micActive ? "Active" : "Off"}</strong>
            </p>
            <p className="muted">
              Tab Switches: <strong>{tabSwitchCount}</strong>
            </p>
          </div>

          <h4>Suspicious Events</h4>
          {!eventLog.length && <p className="muted">No events logged.</p>}
          {!!eventLog.length && (
            <div className="event-log">
              {eventLog.map((item) => (
                <div key={item.id} className="event-item">
                  <p>
                    <strong>{item.eventType}</strong>
                  </p>
                  <p className="muted">{item.detail}</p>
                  <p className="muted">{new Date(item.timestamp).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
