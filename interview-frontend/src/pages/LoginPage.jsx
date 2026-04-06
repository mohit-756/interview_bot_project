import { useState } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import {
  Video,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  UserCircle,
  Eye,
  EyeOff,
  Zap,
  Clock,
  Brain,
} from "lucide-react";
import { cn } from "../utils/utils";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginType, setLoginType] = useState("candidate");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login({ email, password, role: loginType });
      const fromPath = location.state?.from;
      if (fromPath && typeof fromPath === "string") {
        navigate(fromPath, { replace: true });
        return;
      }
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(
        submitError?.message || "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 md:p-6 font-sans">
      <div className="max-w-5xl w-full grid md:grid-cols-2 bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 auth-card-animate">

        {/* Left Side: Branding */}
        <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-12 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center space-x-2.5 mb-14">
              <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm shadow-lg shadow-blue-800/30">
                <Video className="text-white w-6 h-6" />
              </div>
              <span className="text-2xl font-bold font-display tracking-tight">
                Interview<span className="opacity-80">Bot</span>
              </span>
            </div>
            <h1 className="text-[2.5rem] font-bold font-display leading-[1.15] mb-6">
              The AI-Powered<br />Recruitment<br />Revolution.
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed mb-10 max-w-xs">
              Streamline your hiring with automated AI interviews and deep candidate insights.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 text-sm font-medium">
                <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <span>99.9% AI Accuracy in Scoring</span>
              </div>
              <div className="flex items-center space-x-3 text-sm font-medium">
                <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <span>Real-time Technical Assessments</span>
              </div>
              <div className="flex items-center space-x-3 text-sm font-medium">
                <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Brain size={16} />
                </div>
                <span>Adaptive AI Follow-up Questions</span>
              </div>
            </div>
          </div>

          {/* Decorative circles */}
          <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-blue-400/20 rounded-full blur-sm"></div>
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-400/20 rounded-full blur-sm"></div>
          <div className="absolute top-1/3 right-8 w-3 h-3 bg-white/30 rounded-full"></div>
          <div className="absolute bottom-1/3 left-8 w-2 h-2 bg-white/20 rounded-full"></div>
        </div>

        {/* Right Side: Login Form */}
        <div className="p-8 md:p-12 lg:p-14 flex flex-col justify-center">
          {/* Mobile logo */}
          <div className="flex md:hidden items-center space-x-2 mb-8">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Video className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight dark:text-white">
              Interview<span className="text-blue-600">Bot</span>
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-[1.7rem] font-bold text-slate-900 dark:text-white">
              Welcome back
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-[0.95rem]">
              Please enter your details to sign in.
            </p>
          </div>

          {/* Login Type Toggle */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-3">
            <button
              type="button"
              aria-pressed={loginType === "candidate"}
              onClick={() => setLoginType("candidate")}
              className={cn(
                "flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                loginType === "candidate"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <UserCircle size={18} />
              <span>Candidate</span>
            </button>
            <button
              type="button"
              aria-pressed={loginType === "hr"}
              onClick={() => setLoginType("hr")}
              className={cn(
                "flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                loginType === "hr"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <ShieldCheck size={18} />
              <span>HR / Recruiter</span>
            </button>
          </div>
          <p className="mb-8 text-xs text-slate-500 dark:text-slate-400">
            Candidate login opens the applicant dashboard. HR login opens the recruiter workspace.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-100 dark:border-red-900/30 flex items-start gap-3">
                <span className="text-red-400 mt-0.5">&#x26A0;</span>
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-slate-400"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-white placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30 flex items-center justify-center space-x-2 group disabled:opacity-70 disabled:cursor-wait"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign In
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
