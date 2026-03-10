import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// 1) What this does: converts API/network errors into a readable message.
// 2) Why needed: every page should show one consistent user-facing error string.
// 3) How it works: checks backend detail first, then falls back to generic error text.
function getErrorMessage(error) {
  const fallback = "Request failed. Please try again.";
  if (!error) return fallback;
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

// 1) What this does: unwraps axios responses and normalizes errors.
// 2) Why needed: keeps every API method small and consistent.
// 3) How it works: returns `response.data` on success and throws a clean Error on failure.
async function unwrap(promise) {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

async function downloadFile(promise, fallbackFilename) {
  try {
    const response = await promise;
    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers?.["content-disposition"] || "";
    const nameMatch = disposition.match(/filename="?([^"]+)"?/i);
    link.href = url;
    link.download = nameMatch?.[1] || fallbackFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export const authApi = {
  login(payload) {
    return unwrap(apiClient.post("/auth/login", payload));
  },
  signup(payload) {
    return unwrap(apiClient.post("/auth/signup", payload));
  },
  logout() {
    return unwrap(apiClient.post("/auth/logout"));
  },
  me() {
    return unwrap(apiClient.get("/auth/me"));
  },
};

export const candidateApi = {
  dashboard(jobId) {
    const params = jobId ? { job_id: jobId } : undefined;
    return unwrap(apiClient.get("/candidate/dashboard", { params }));
  },
  listJds() {
    return unwrap(apiClient.get("/candidate/jds"));
  },
  selectJd(payload) {
    return unwrap(apiClient.post("/candidate/select-jd", payload));
  },
  uploadResume(file, jobId) {
    const formData = new FormData();
    formData.append("resume", file);
    if (jobId) formData.append("job_id", String(jobId));
    return unwrap(apiClient.post("/candidate/upload-resume", formData));
  },
  scheduleInterview(payload) {
    return unwrap(apiClient.post("/candidate/select-interview-date", payload));
  },
  skillMatch(jobId) {
    return unwrap(apiClient.get(`/candidate/skill-match/${jobId}`));
  },
  practiceKit(jobId) {
    const params = jobId ? { job_id: jobId } : undefined;
    return unwrap(apiClient.get("/candidate/practice-kit", { params }));
  },
};

export const hrApi = {
  // 1) What this does: loads the HR interview review list.
  // 2) Why needed: the interview review page uses this endpoint.
  // 3) How it works: performs a simple GET request.
  interviews() {
    return unwrap(apiClient.get("/hr/interviews"));
  },
  // 1) What this does: loads the candidate manager list.
  // 2) Why needed: supports search, filter, sorting, and pagination from the HR UI.
  // 3) How it works: sends GET params to the candidate list endpoint.
  listCandidates(params) {
    return unwrap(apiClient.get("/hr/candidates", { params }));
  },
  // 1) What this does: loads one candidate's HR detail page payload.
  // 2) Why needed: the detail page needs candidate and application data.
  // 3) How it works: fetches by the human-friendly candidate UID.
  candidateDetail(candidateUid) {
    return unwrap(apiClient.get(`/hr/candidates/${candidateUid}`));
  },
  // 1) What this does: loads matched and missing skills for one candidate/job pair.
  // 2) Why needed: powers the HR "Skill Gap Analyzer" section.
  // 3) How it works: sends an optional job_id query param to the new backend endpoint.
  candidateSkillGap(candidateUid, jobId) {
    const params = jobId ? { job_id: jobId } : undefined;
    return unwrap(apiClient.get(`/hr/candidates/${candidateUid}/skill-gap`, { params }));
  },
  // 1) What this does: deletes one candidate from the HR panel.
  // 2) Why needed: supports cleanup from the candidate manager and detail page.
  // 3) How it works: performs a protected POST delete action.
  deleteCandidate(candidateUid) {
    return unwrap(apiClient.post(`/hr/candidates/${candidateUid}/delete`));
  },
  generateCandidateQuestions(candidateId) {
    return unwrap(apiClient.post(`/hr/candidate/${candidateId}/generate-questions`));
  },
  interviewDetail(id) {
    return unwrap(apiClient.get(`/hr/interviews/${id}`));
  },
  finalizeInterview(id, payload) {
    return unwrap(apiClient.post(`/hr/interviews/${id}/finalize`, payload));
  },
  dashboard(jobId) {
    const params = jobId ? { job_id: jobId } : undefined;
    return unwrap(apiClient.get("/hr/dashboard", { params }));
  },
  uploadJd({
    file,
    jdTitle,
    educationRequirement,
    experienceRequirement,
    cutoffScore,
    questionCount,
  }) {
    const formData = new FormData();
    formData.append("jd_file", file);
    formData.append("jd_title", jdTitle || "");
    formData.append("education_requirement", educationRequirement || "");
    formData.append("experience_requirement", experienceRequirement || "");
    formData.append("cutoff_score", String(cutoffScore ?? 65));
    formData.append("question_count", String(questionCount ?? 8));
    return unwrap(apiClient.post("/hr/upload-jd", formData));
  },
  confirmJd(skillScores) {
    return unwrap(apiClient.post("/hr/confirm-jd", { skill_scores: skillScores }));
  },
  updateSkillWeights(skillScores, jobId, settings = {}) {
    return unwrap(
      apiClient.post("/hr/update-skill-weights", {
        skill_scores: skillScores,
        job_id: jobId ?? null,
        cutoff_score: settings.cutoffScore ?? null,
        question_count: settings.questionCount ?? null,
      }),
    );
  },
  submitInterviewScore(resultId, technicalScore) {
    return unwrap(
      apiClient.post("/hr/interview-score", {
        result_id: resultId,
        technical_score: technicalScore,
      }),
    );
  },
  downloadLocalBackup() {
    return downloadFile(
      apiClient.get("/hr/local-backup", {
        responseType: "blob",
      }),
      "interview_bot_local_backup.zip",
    );
  },
};

export const interviewApi = {
  start(payload = {}) {
    return unwrap(apiClient.post("/interview/start", payload));
  },
  submitAnswer(payload) {
    return unwrap(apiClient.post("/interview/answer", payload));
  },
  sendEvent(token, payload) {
    return unwrap(apiClient.post(`/interview/${encodeURIComponent(token)}/event`, payload));
  },
  transcribeAudio(formData) {
    return unwrap(
      apiClient.post("/interview/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      }),
    );
  },
  uploadProctorFrame(formData) {
    return unwrap(
      apiClient.post("/proctor/frame", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
  hrProctoring(sessionId) {
    return unwrap(apiClient.get(`/hr/proctoring/${sessionId}`));
  },
};
