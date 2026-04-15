import { apiClient } from "../services/api";

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const uploadFileToS3 = async (file, onProgress) => {
  if (!file) throw new Error("No file provided");

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File exceeds 5MB limit");
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error("Invalid file type");
  }

  console.log("[UPLOAD] Using direct backend upload");
  const formData = new FormData();
  formData.append("resume", file);
  
  const response = await apiClient.post("/candidate/upload-resume", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.uploaded_resume || response.candidate?.resume_path || "uploaded";
};