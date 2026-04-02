/**
 * useProctoring.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight proctoring hook for the Interview page.
 *
 * Features (all run asynchronously, none block the UI thread):
 *   1. Tab-switch detection   — visibilitychange event
 *   2. Voice confidence       — pure heuristic on transcript text:
 *                               speaking rate, filler words, sentence fragmentation.
 *
 * NOTE: Pixel-based emotion detection was removed. Real NLP sentiment/emotion
 * analysis now runs server-side during evaluation (services/sentiment.py).
 *
 * All events are stored in a local ref array AND sent to the backend via the
 * existing proctorApi.uploadFrame / interviewApi event endpoints.
 *
 * Usage:
 *   const { proctoringEvents, voiceMetrics } = useProctoring({
 *     sessionId,
 *     enabled: true,
 *   });
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── constants ─────────────────────────────────────────────────────────────────
const MAX_EVENTS_STORED = 200;

// Filler words that indicate hesitation
const FILLER_WORDS = [
  "uh", "um", "er", "ah", "like", "you know", "i mean",
  "basically", "literally", "actually", "sort of", "kind of",
];

// ── helpers ───────────────────────────────────────────────────────────────────

/** Analyse a transcript string for voice confidence heuristics. */
function analyseVoiceConfidence(transcript, durationSeconds) {
  if (!transcript || durationSeconds <= 0) return null;

  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 3) return null;

  const speakingRate = Math.round((wordCount / durationSeconds) * 60);

  const lowerWords = transcript.toLowerCase();
  let fillerCount = 0;
  FILLER_WORDS.forEach((f) => {
    const re = new RegExp(`\\b${f}\\b`, "g");
    const matches = lowerWords.match(re);
    if (matches) fillerCount += matches.length;
  });

  const hesitationScore = parseFloat(
    Math.min(1, fillerCount / Math.max(1, wordCount / 5)).toFixed(2)
  );

  let rateScore = 1.0;
  if (speakingRate < 80 || speakingRate > 220) rateScore = 0.5;
  else if (speakingRate < 100 || speakingRate > 200) rateScore = 0.75;

  const confidenceScore = parseFloat(
    ((rateScore * 0.6) + ((1 - hesitationScore) * 0.4)).toFixed(2)
  );

  return {
    speaking_rate: speakingRate,
    word_count: wordCount,
    filler_count: fillerCount,
    hesitation_score: hesitationScore,
    confidence_score: confidenceScore,
    duration_seconds: Math.round(durationSeconds),
  };
}

// ── main hook ─────────────────────────────────────────────────────────────────
export function useProctoring({ sessionId, resultId, videoRef, enabled = true }) {
  const [proctoringEvents, setProctoringEvents] = useState([]);
  const [voiceMetrics, setVoiceMetrics]         = useState(null);

  const eventsRef = useRef([]);

  // Push an event into local state + ref buffer
  const pushEvent = useCallback((event) => {
    const stamped = { ...event, timestamp: new Date().toISOString() };
    eventsRef.current = [stamped, ...eventsRef.current].slice(0, MAX_EVENTS_STORED);
    setProctoringEvents((prev) => [stamped, ...prev].slice(0, MAX_EVENTS_STORED));
  }, []);

  // ── 1. TAB SWITCH DETECTION ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !sessionId) return;

    function onVisibilityChange() {
      if (document.hidden) {
        pushEvent({ type: "TAB_SWITCH", detail: "Candidate switched browser tab" });
        const eventTargetId = resultId || sessionId;
        if (eventTargetId) {
          fetch(`/api/interview/${eventTargetId}/event`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_type: "tab_switch",
              detail: "Candidate switched away from the interview tab",
              timestamp: new Date().toISOString(),
              meta: { hidden: true },
            }),
          }).catch(() => {});
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, sessionId, resultId, pushEvent]);

  // ── 2. VOICE CONFIDENCE — called externally when an answer is submitted ────
  const analyseAnswer = useCallback((transcript, durationSeconds) => {
    const metrics = analyseVoiceConfidence(transcript, durationSeconds);
    if (!metrics) return null;
    setVoiceMetrics(metrics);
    pushEvent({ type: "VOICE_CONFIDENCE", ...metrics });
    return metrics;
  }, [pushEvent]);

  return {
    proctoringEvents,
    voiceMetrics,
    analyseAnswer,
  };
}
