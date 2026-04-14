const S3_UPLOAD_API = import.meta.env.VITE_S3_UPLOAD_API;

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadFileToS3 = async (file, onProgress) => {
  if (!file) throw new Error("No file provided");

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File exceeds 5MB limit");
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error("Invalid file type");
  }

  // Step 1: Get pre-signed URL
  const res = await fetch(
    `${S3_UPLOAD_API}?fileName=${encodeURIComponent(file.name)}&fileType=${encodeURIComponent(file.type)}`
  );

  if (!res.ok) throw new Error("Failed to get upload URL");

  const { uploadUrl, fileUrl } = await res.json();

  // Step 2: Upload to S3
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", uploadUrl, true);

  const uploadPromise = new Promise((resolve, reject) => {
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(fileUrl);
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
  });

  if (onProgress) {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
  }

  xhr.send(file);

  return uploadPromise;
};
