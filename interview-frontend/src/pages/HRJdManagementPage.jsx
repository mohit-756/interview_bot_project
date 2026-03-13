import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  Trash2,
  MoreVertical,
} from "lucide-react";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { hrApi } from "../services/api";
import { cn } from "../utils/utils";

function buildInitialForm() {
  return {
    id: null,
    title: "",
    jd_text: "",
    weights_json: "{}",
    qualify_score: 65,
    min_academic_percent: 0,
    total_questions: 8,
    project_question_ratio: 0.8,
  };
}

function weightsToString(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function HRJdManagementPage() {
  const navigate = useNavigate();

  const [jds, setJds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(buildInitialForm());
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState(null);

  const itemsPerPage = 10;

  const departments = useMemo(() => {
    return [
      "all",
      ...new Set(jds.map((jd) => jd.department || "Unspecified").filter(Boolean)),
    ];
  }, [jds]);

  const filteredJds = useMemo(() => {
    let result = jds;

    const needle = search.trim().toLowerCase();
    if (needle) {
      result = result.filter((jd) =>
        [jd.title, jd.jd_text, jd.id?.toString()].some((value) =>
          String(value || "").toLowerCase().includes(needle)
        )
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(
        (jd) => (jd.active ? "active" : "inactive") === statusFilter
      );
    }

    if (departmentFilter !== "all") {
      result = result.filter(
        (jd) => (jd.department || "Unspecified") === departmentFilter
      );
    }

    return result;
  }, [jds, search, statusFilter, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJds.length / itemsPerPage));
  const paginatedJds = filteredJds.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const loadJds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await hrApi.listJds();
      setJds(response?.jds || []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load JDs.");
      setJds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJds();
  }, [loadJds]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, departmentFilter]);

  async function handleSelectJd(jdId) {
    setError("");
    setMessage("");
    try {
      const detail = await hrApi.getJd(jdId);
      const jd = detail.jd;

      setSelectedId(jd.id);
      setForm({
        id: jd.id,
        title: jd.title || "",
        jd_text: jd.jd_text || "",
        weights_json: weightsToString(jd.weights_json),
        qualify_score: jd.qualify_score ?? 65,
        min_academic_percent: jd.min_academic_percent ?? 0,
        total_questions: jd.total_questions ?? 8,
        project_question_ratio: jd.project_question_ratio ?? 0.8,
      });
      setShowForm(true);
      setOpenMenu(null);
    } catch (selectError) {
      setError(selectError.message || "Failed to load JD details.");
    }
  }

  function resetForm() {
    setSelectedId(null);
    setForm(buildInitialForm());
    setShowForm(false);
    setMessage("");
    setError("");
    setOpenMenu(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    let parsedWeights;
    try {
      parsedWeights = JSON.parse(form.weights_json || "{}");
    } catch {
      setSaving(false);
      setError("Weights JSON is invalid.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      jd_text: form.jd_text.trim(),
      weights_json: parsedWeights,
      qualify_score: Number(form.qualify_score),
      min_academic_percent: Number(form.min_academic_percent),
      total_questions: Number(form.total_questions),
      project_question_ratio: Number(form.project_question_ratio),
    };

    if (!payload.title) {
      setSaving(false);
      setError("Title is required.");
      return;
    }

    if (!payload.jd_text) {
      setSaving(false);
      setError("JD text is required.");
      return;
    }

    try {
      if (selectedId) {
        await hrApi.updateJd(selectedId, payload);
        setMessage("JD updated successfully.");
      } else {
        await hrApi.createJd(payload);
        setMessage("JD created successfully.");
      }

      await loadJds();
      resetForm();
    } catch (saveError) {
      setError(saveError.message || "Failed to save JD.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteJd(jdId) {
    if (!window.confirm("Are you sure you want to delete this JD?")) return;

    setDeleting(jdId);
    setError("");
    setMessage("");

    try {
      await hrApi.deleteJd(jdId);
      await loadJds();
      setMessage("JD deleted successfully.");
      setOpenMenu(null);

      if (selectedId === jdId) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete JD.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleStatus(jdId, currentActive) {
    setError("");
    setMessage("");

    try {
      await hrApi.updateJd(jdId, { active: !currentActive });
      await loadJds();
      setMessage(`JD ${currentActive ? "deactivated" : "activated"} successfully.`);
      setOpenMenu(null);
    } catch (toggleError) {
      setError(toggleError.message || "Failed to update JD status.");
    }
  }

  if (loading && !jds.length) {
    return <p className="center muted py-12">Loading JD management...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display">
            JD Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage and configure job descriptions for screening and interviews.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setSelectedId(null);
            setForm(buildInitialForm());
            setError("");
            setMessage("");
          }}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-none"
        >
          <Plus size={20} />
          <span>Add New JD</span>
        </button>
      </div>

      {error ? <p className="alert error">{error}</p> : null}

      {message ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-3">
          {message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total JDs" value={jds.length} color="blue" />
        <MetricCard
          title="Average Qualify Score"
          value={
            jds.length
              ? `${Math.round(
                  jds.reduce((sum, jd) => sum + Number(jd.qualify_score || 0), 0) /
                    jds.length
                )}%`
              : "0%"
          }
          color="green"
        />
        <MetricCard
          title="Active JDs"
          value={jds.filter((jd) => jd.active).length}
          color="purple"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search JDs by title, text or ID..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium dark:text-white"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="all">Department: All</option>
            {departments.slice(1).map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
          Showing {paginatedJds.length} of {filteredJds.length} JDs
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  JD ID
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Title
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Department
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Experience
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Status
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Questions
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Qualify Score
                </th>
                <th className="px-6 py-5 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {!paginatedJds.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No JDs found. Create one to get started.
                  </td>
                </tr>
              ) : (
                paginatedJds.map((jd) => (
                  <tr
                    key={jd.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-all group"
                  >
                    <td className="px-6 py-4">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {jd.id}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 dark:text-white">
                        {jd.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                        {jd.jd_text}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {jd.department || "–"}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {jd.experience_required || "–"}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold",
                          jd.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        )}
                      >
                        {jd.active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {jd.total_questions ?? 8}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {jd.qualify_score ?? 0}%
                      </p>
                    </td>

                    <td className="px-6 py-4 text-right relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenu(openMenu === jd.id ? null : jd.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenu === jd.id ? (
                        <div className="absolute right-6 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-10 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => navigate(`/hr/jds/${jd.id}`)}
                            className="flex items-center space-x-3 w-full px-4 py-3 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Eye size={16} />
                            <span className="text-sm font-medium">View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectJd(jd.id)}
                            className="flex items-center space-x-3 w-full px-4 py-3 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Edit2 size={16} />
                            <span className="text-sm font-medium">Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(jd.id, jd.active)}
                            className="flex items-center space-x-3 w-full px-4 py-3 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <span
                              className={cn(
                                "inline-block w-4 h-4 rounded-full",
                                jd.active ? "bg-emerald-500" : "bg-slate-400"
                              )}
                            />
                            <span className="text-sm font-medium">
                              {jd.active ? "Deactivate" : "Activate"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteJd(jd.id)}
                            disabled={deleting === jd.id}
                            className="flex items-center space-x-3 w-full px-4 py-3 text-left text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            <span className="text-sm font-medium">
                              {deleting === jd.id ? "Deleting..." : "Delete"}
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-6 bg-slate-50/30 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">
            Page <span className="text-slate-900 dark:text-white">{page}</span> of{" "}
            <span className="text-slate-900 dark:text-white">{totalPages}</span>
          </p>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center space-x-1 px-4">
              <span className="text-sm font-black text-slate-900 dark:text-white">
                Page {page}
              </span>
              <span className="text-sm text-slate-400">of {totalPages}</span>
            </div>

            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedId ? "Edit Job Description" : "Create Job Description"}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Configure the JD details and scoring weights.
              </p>
            </div>

            {selectedId ? (
              <StatusBadge status={{ label: `JD #${selectedId}`, tone: "secondary" }} />
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Qualify Score
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.qualify_score}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      qualify_score: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                JD Text
              </label>
              <textarea
                rows={10}
                value={form.jd_text}
                onChange={(event) =>
                  setForm((current) => ({ ...current, jd_text: event.target.value }))
                }
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                required
              />
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Min Academic %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_academic_percent}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      min_academic_percent: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Total Questions
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.total_questions}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      total_questions: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                  Project Ratio
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step="0.1"
                  value={form.project_question_ratio}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      project_question_ratio: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
                Weights JSON
              </label>
              <textarea
                rows={8}
                value={form.weights_json}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    weights_json: event.target.value,
                  }))
                }
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Example: {"{"}"react": 5, "node.js": 4, "sql": 3{"}"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
              >
                {saving ? "Saving..." : selectedId ? "Update JD" : "Create JD"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}