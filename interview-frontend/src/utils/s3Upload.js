const S3_UPLOAD_API = "https://lp6t2xn0q4.execute-api.ap-south-1.amazonaws.com/prod/generate-upload-url";

export const uploadFileToS3 = async (file) => {
  const res = await fetch(
    `${S3_UPLOAD_API}?fileName=${file.name}&fileType=${encodeURIComponent(file.type)}`
  );

  if (!res.ok) throw new Error("Failed to get upload URL");

  const data = await res.json();

  const uploadRes = await fetch(data.uploadUrl, {
    method: "PUT",
    body: file
  });

  if (!uploadRes.ok) throw new Error("S3 upload failed");

  return data.fileUrl;
};
