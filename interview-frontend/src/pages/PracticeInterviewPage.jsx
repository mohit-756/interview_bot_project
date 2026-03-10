import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import ResumeAdvicePanel from "../components/ResumeAdvicePanel";
import { candidateApi } from "../services/api";
import { formatPercent, titleCase } from "../utils/formatters";

const PRACTICE_SECONDS = 90;

function PracticeQuestionCard({ question, index, total, answer, onAnswerChange, secondsLeft }) {
  return (
    <section className="card stack">
      <div className="title-row">
        <div>
          <p className="eyebrow">Practice question {index + 1}</p>
          <h3>{question.text}</h3>
        </div>
        <span className={`timer-chip ${secondsLeft <= 15 ? "warn" : ""}`}>{secondsLeft}s</span>
      </div>
      <div className="inline-row">
        <span className="skill-pill">{titleCase(question.type)}</span>
        <span className="skill-pill subtle">{titleCase(question.topic)}</span>
        <span className="skill-pill subtle">Difficulty {titleCase(question.difficulty)}</span>
        <span className="muted">Question {index + 1} of {total}</span>
      </div>
      <textarea
        rows={9}
        value={answer}
        onChange={(event) => onAnswerChange(event.target.value)}
        placeholder="Practice your response here. Nothing is submitted to HR in practice mode."
      />
    </section>
  );
}

export default function PracticeInterviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(PRACTICE_SECONDS);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    async function loadPracticeKit() {
      setLoading(true);
      setError("");
      try {
        const response = await candidateApi.practiceKit();
        setData(response);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadPracticeKit();
  }, []);

  useEffect(() => {
    if (finished || loading || !data?.practice?.questions?.length) return undefined;
    const timerId = window.setTimeout(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          const totalQuestions = data.practice.questions.length;
          if (currentIndex < totalQuestions - 1) {
            setCurrentIndex((value) => value + 1);
          } else {
            setFinished(true);
          }
          return PRACTICE_SECONDS;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearTimeout(timerId);
  }, [currentIndex, data, finished, loading, secondsLeft]);

  useEffect(() => {
    setSecondsLeft(PRACTICE_SECONDS);
  }, [currentIndex]);

  const questions = data?.practice?.questions || [];
  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => String(value || "").trim().length > 0).length,
    [answers],
  );

  function handleAnswerChange(value) {
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: value,
    }));
  }

  function handleNext() {
    if (currentIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setCurrentIndex((value) => value + 1);
  }

  function handleRestart() {
    setAnswers({});
    setCurrentIndex(0);
    setSecondsLeft(PRACTICE_SECONDS);
    setFinished(false);
  }

  if (loading) return <p className="center muted">Loading practice mode...</p>;
  if (error) return <p className="alert error">{error}</p>;
  if (!data?.practice?.questions?.length) return <p className="muted">Practice mode is not ready yet.</p>;

  return (
    <div className="stack">
      <PageHeader
        title="Practice Interview"
        subtitle={`Local rehearsal for ${data.jd?.title || "your selected role"}. Answers stay in your browser.`}
        actions={
          <>
            <Link to="/candidate" className="button-link subtle-button">
              Back to Dashboard
            </Link>
            <button type="button" className="subtle-button" onClick={handleRestart}>
              Restart Practice
            </button>
          </>
        }
      />

      <section className="metric-grid">
        <MetricCard label="Practice score preview" value={formatPercent(data.score_preview)} hint="Current JD match estimate" />
        <MetricCard label="Question set" value={String(data.practice.meta?.total_questions || questions.length)} hint="Generated locally from your resume" />
        <MetricCard label="Answered so far" value={String(answeredCount)} hint="Local notes only" />
      </section>

      {finished ? (
        <section className="card stack">
          <div className="title-row">
            <div>
              <p className="eyebrow">Practice summary</p>
              <h3>Session complete</h3>
            </div>
            <span className="status-badge success">Local only</span>
          </div>
          <p className="muted">
            You answered {answeredCount} of {questions.length} questions. Use the resume advice below before you attempt the real interview.
          </p>
          <div className="inline-row">
            <button type="button" onClick={handleRestart}>
              Run Again
            </button>
            <Link to="/candidate" className="button-link subtle-button">
              Return to Dashboard
            </Link>
          </div>
        </section>
      ) : (
        <>
          <PracticeQuestionCard
            question={currentQuestion}
            index={currentIndex}
            total={questions.length}
            answer={answers[currentIndex] || ""}
            onAnswerChange={handleAnswerChange}
            secondsLeft={secondsLeft}
          />
          <div className="practice-nav">
            <button
              type="button"
              className="subtle-button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <button type="button" onClick={handleNext}>
              {currentIndex === questions.length - 1 ? "Finish Practice" : "Next Question"}
            </button>
          </div>
        </>
      )}

      <ResumeAdvicePanel advice={data.resume_advice} title="What to improve before the real interview" />
    </div>
  );
}
