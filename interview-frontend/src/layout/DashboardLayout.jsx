import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import HelpSupportButton from "../components/HelpSupportButton";

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="transition-all duration-300 lg:pl-64">
        <Navbar toggleSidebar={() => setSidebarOpen((open) => !open)} />
        <main className="p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      <HelpSupportButton supportEmail="support@quadranttech.com" />
    </div>
  );
}
