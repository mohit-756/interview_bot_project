import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  ArrowRight,
  Clock,
  MessageSquare,
  Play,
  RotateCcw,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import { cn } from "../utils/utils";

const QUESTIONS = [
  {
    text: "How do you optimize a React application for better performance?",
    type: "Technical",
    topic: "Frontend Optimization",
    difficulty: "Advanced",
  },
  {
    text: "Explain the concept of 'Event Loop' in Node.js.",
    type: "Technical",
    topic: "Backend Core",
    difficulty: "Intermediate",
  },
  {
    text: "How do you handle merge conflicts in a large team project?",
    type: "Soft Skills",
    topic: "Collaboration",
    difficulty: "Basic",
  },
];

export default function PracticeInterviewPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(90);
  const [isFinished, setIsFinished] = useState(false);
  const [answers, setAnswers] = useState([]);

  const handleNext = useCallback(() => {
    setAnswers((currentAnswers) => [
      ...currentAnswers,
      { q: QUESTIONS[currentIndex].text, a: answer },
    ]);

    if (currentIndex < QUESTIONS.length - 1) {
      setCurrentIndex((index) => index + 1);
      setAnswer("");
      setTimeLeft(90);
    } else {
      setIsFinished(true);
    }
  }, [answer, currentIndex]);

  useEffect(() => {
    if (isFinished) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleNext();
          return 90;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleNext, isFinished]);

  const restart = () => {
    setCurrentIndex(0);
    setAnswer("");
    setTimeLeft(90);
    setIsFinished(false);
    setAnswers([]);
  };

  if (isFinished) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in duration-300">
        <div className="text-center space-y-4 py-8">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-50">
            <Award size={40} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white font-display">Practice Complete!</h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Great job! You've completed your local practice session. Your responses were saved locally for your review.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-8 space-y-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
              <MessageSquare className="mr-2 text-blue-600" size={24} />
              Response Summary
            </h3>
            <div className="space-y-6">
              {answers.map((item, index) => (
                <div key={index} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Question {index + 1}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">{item.q}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">"{item.a || "No response recorded"}"</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[40px] text-white shadow-xl">
              <ShieldCheck className="mb-6 opacity-80" size={40} />
              <h3 className="text-2xl font-bold font-display leading-tight mb-4">Ready for the real thing?</h3>
              <p className="text-indigo-100 text-sm leading-relaxed mb-8">
                Your practice performance shows you're ready to attempt the official interview for the Full Stack Developer role.
              </p>
              <Link to="/interview/INT-001" className="block w-full bg-white text-blue-600 py-4 rounded-2xl font-black text-center hover:scale-[1.02] transition-all">
                Start Official Interview
              </Link>
            </div>

            <button
              onClick={restart}
              className="w-full flex items-center justify-center space-x-2 py-4 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <RotateCcw size={20} />
              <span>Restart Practice</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-3 rounded-2xl text-white">
            <Play size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">AI Practice Mode</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Local rehearsal session. Responses are not shared with HR.</p>
          </div>
        </div>
        <div className="flex items-center bg-white dark:bg-slate-900 px-6 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Clock className={cn("mr-3", timeLeft < 15 ? "text-red-500 animate-pulse" : "text-blue-600")} size={20} />
          <span className={cn("text-xl font-black font-mono", timeLeft < 15 ? "text-red-500" : "text-slate-900 dark:text-white")}>
            00:{timeLeft.toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center space-x-3 mb-6">
              <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800/50">
                {QUESTIONS[currentIndex].type}
              </span>
              <span className="px-3 py-1 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-100 dark:border-slate-700">
                {QUESTIONS[currentIndex].difficulty}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white font-display leading-tight mb-8">
              {QUESTIONS[currentIndex].text}
            </h2>

            <textarea
              className="w-full h-48 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-6 text-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none font-medium leading-relaxed"
              placeholder="Type your practice response here..."
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />

            <div className="flex items-center justify-between mt-8">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  {QUESTIONS.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "w-8 h-1.5 rounded-full transition-all duration-500",
                        index === currentIndex ? "bg-blue-600 w-12" : index < currentIndex ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800",
                      )}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">
                  Step {currentIndex + 1} of {QUESTIONS.length}
                </span>
              </div>

              <button
                onClick={handleNext}
                className="flex items-center justify-center space-x-3 px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none transition-all group"
              >
                <span>{currentIndex === QUESTIONS.length - 1 ? "Finish Session" : "Next Question"}</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-8 flex items-center">
              <Zap className="mr-2 text-yellow-500" size={18} />
              AI Practice Tips
            </h4>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 text-xs font-bold">1</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  Be concise. Use the <span className="font-bold text-slate-900 dark:text-white">STAR method</span> (Situation, Task, Action, Result) for behavioral questions.
                </p>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 text-xs font-bold">2</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  Focus on technical terminology. The AI looks for specific <span className="font-bold text-slate-900 dark:text-white">keywords</span> related to the role.
                </p>
              </div>
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 text-xs font-bold">3</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  Maintain confidence. Use a professional tone and avoid "filler" words.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[40px] text-white">
            <Target className="mb-6 text-blue-500" size={40} />
            <h3 className="text-xl font-bold font-display leading-tight mb-4">Targeted Feedback</h3>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Our AI evaluates your practice responses against the Job Description and provides custom improvement paths.
            </p>
            <div className="flex items-center space-x-2 text-blue-400 text-xs font-bold">
              <span>View Example Report</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
