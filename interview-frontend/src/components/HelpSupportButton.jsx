import { useState } from "react";
import { HelpCircle, X, Mail, ExternalLink } from "lucide-react";

export default function HelpSupportButton({ supportEmail = "support@example.com", faqUrl = "/faq" }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="absolute bottom-14 right-0 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X size={16} />
          </button>
          <h4 className="font-bold text-slate-900 dark:text-white mb-3 pr-6">Need Help?</h4>
          <div className="space-y-3 text-sm">
            <a
              href={`mailto:${supportEmail}?subject=Interview%20Support%20Request`}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <Mail size={14} />
              <span>Email Support</span>
            </a>
            <a
              href={faqUrl}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ExternalLink size={14} />
              <span>View FAQ</span>
            </a>
          </div>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
        aria-label="Need Help?"
      >
        <HelpCircle size={18} />
        <span className="hidden sm:inline">Help</span>
      </button>
    </div>
  );
}