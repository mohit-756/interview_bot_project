import React, { useState } from "react";
import { 
  User, 
  Lock, 
  Bell, 
  Moon, 
  Sun, 
  Shield, 
  CreditCard, 
  LogOut,
  Camera,
  CheckCircle2
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { cn } from "../utils/utils";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [isSaved, setIsSaved] = useState(false);

  const tabs = [
    { id: "profile", label: "Profile Info", icon: User },
    { id: "security", label: "Security", icon: Lock },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "appearance", label: "Appearance", icon: Moon },
  ];

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account preferences and system configuration.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-6 py-4 rounded-2xl font-bold text-sm transition-all",
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-900"
              )}
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </button>
          ))}
          
          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
            <button 
              onClick={logout}
              className="w-full flex items-center space-x-3 px-6 py-4 rounded-2xl font-bold text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            >
              <LogOut size={20} />
              <span>Logout Session</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-8 md:p-12">
            
            {activeTab === "profile" && (
              <div className="space-y-10">
                <div className="flex flex-col md:flex-row md:items-center gap-8">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-[40px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-4xl font-black shadow-inner overflow-hidden border-4 border-white dark:border-slate-800">
                      {user?.name?.[0] || 'U'}
                    </div>
                    <button className="absolute bottom-0 right-0 p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg border-4 border-white dark:border-slate-800 hover:scale-110 transition-all">
                      <Camera size={18} />
                    </button>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Profile Photo</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-xs text-sm">Upload a professional headshot. Recommended size is 400x400px.</p>
                    <div className="flex gap-3 mt-4">
                      <button className="px-5 py-2 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 transition-all">Update Photo</button>
                      <button className="px-5 py-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-all">Remove</button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-900 dark:text-white ml-1">Full Name</label>
                    <input type="text" defaultValue={user?.name} className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-900 dark:text-white ml-1">Email Address</label>
                    <input type="email" defaultValue={user?.email} className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-900 dark:text-white ml-1">Position/Title</label>
                    <input type="text" placeholder="Full Stack Developer" className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-900 dark:text-white ml-1">Company/Team</label>
                    <input type="text" placeholder="Product Engineering" className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-900 dark:text-white ml-1">Professional Bio</label>
                  <textarea rows={4} placeholder="Tell us about yourself..." className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white font-medium resize-none"></textarea>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: <span className="font-bold">Oct 26, 2023</span></p>
                  <button 
                    onClick={handleSave}
                    className="flex items-center space-x-2 px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none transition-all active:scale-95"
                  >
                    {isSaved ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Changes Saved!</span>
                      </>
                    ) : (
                      <span>Save Profile Changes</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab !== "profile" && (
              <div className="py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-300 dark:text-slate-600">
                  {activeTab === "security" && <Lock size={40} />}
                  {activeTab === "notifications" && <Bell size={40} />}
                  {activeTab === "appearance" && <Sun size={40} />}
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Under Construction</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">This settings module is currently being finalized in the next design phase.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
