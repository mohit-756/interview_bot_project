import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { interviewApi } from "../services/api";

function mapPermissionError(error) {
  const code = error?.name || "";
  if (code === "NotAllowedError" || code === "PermissionDeniedError") return "denied";
  if (code === "NotFoundError" || code === "DevicesNotFoundError") return "denied";
  if (code === "NotReadableError" || code === "TrackStartError") return "denied";
  return "pending";
}

function statusClass(status) {
  if (status === "granted") return "success";
  if (status === "denied") return "danger";
  return "secondary";
}

function statusLabel(status) {
  if (status === "granted") return "Granted";
  if (status === "denied") return "Denied";
  return "Pending";
}

export default function PreCheck() {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const numericResultId = Number(resultId);
  const routeResultId = Number.isFinite(numericResultId) && numericResultId > 0 ? numericResultId : 0;

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [checksBusy, setChecksBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraStatus, setCameraStatus] = useState("pending");
  const [micStatus, setMicStatus] = useState("pending");
  const [internetStatus, setInternetStatus] = useState(navigator.onLine ? "online" : "offline");

  const canStart = useMemo(
    () => cameraStatus === "granted" && micStatus === "granted" && internetStatus === "online",
    [cameraStatus, micStatus, internetStatus],
  );

  function stopStream() {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function checkOneDevice(constraints, keepPreview = false) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (keepPreview && constraints.video) {
        stopStream();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } else {
        stream.getTracks().forEach((track) => track.stop());
      }
      return "granted";
    } catch (mediaError) {
      return mapPermissionError(mediaError);
    }
  }

  async function runChecks() {
    setChecksBusy(true);
    setError("");
    setNotice("");
    setInternetStatus(navigator.onLine ? "online" : "offline");
    stopStream();

    try {
      const fullStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = fullStream;
      if (videoRef.current) {
        videoRef.current.srcObject = fullStream;
      }
      setCameraStatus("granted");
      setMicStatus("granted");
      setNotice("Camera and microphone checks passed.");
    } catch {
      const [camera, mic] = await Promise.all([
        checkOneDevice({ video: true, audio: false }, true),
        checkOneDevice({ video: false, audio: true }, false),
      ]);
      setCameraStatus(camera);
      setMicStatus(mic);
      if (camera !== "granted" || mic !== "granted") {
        setError("Allow camera and microphone access, then run checks again.");
      }
    } finally {
      setChecksBusy(false);
    }
  }

  async function startInterview() {
    if (!canStart) {
      setError("Complete pre-check and grant camera + microphone access.");
      return;
    }
    setStartBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = { consent_given: true };
      if (routeResultId > 0) payload.result_id = routeResultId;
      const bootstrap = await interviewApi.start(payload);
      navigate(`/interview/${resultId}/live`, {
        replace: true,
        state: {
          bootstrap,
          precheck: {
            cameraGranted: true,
            micGranted: true,
          },
        },
      });
    } catch (startError) {
      setError(startError.message);
    } finally {
      setStartBusy(false);
    }
  }

  useEffect(() => {
    const updateInternet = () => {
      setInternetStatus(navigator.onLine ? "online" : "offline");
    };
    window.addEventListener("online", updateInternet);
    window.addEventListener("offline", updateInternet);
    return () => {
      window.removeEventListener("online", updateInternet);
      window.removeEventListener("offline", updateInternet);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className="stack">
      <header className="title-row">
        <h2>Interview Pre-check</h2>
        <button className="subtle-button" onClick={() => navigate("/candidate")}>
          Back
        </button>
      </header>

      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}

      <section className="card stack">
        <p className="muted">
          Run checks once before starting. Interview starts only after camera + microphone are granted.
        </p>
        <div className="precheck-grid">
          <div className="precheck-item">
            <p>Camera permission</p>
            <span className={`status-badge ${statusClass(cameraStatus)}`}>{statusLabel(cameraStatus)}</span>
          </div>
          <div className="precheck-item">
            <p>Microphone permission</p>
            <span className={`status-badge ${statusClass(micStatus)}`}>{statusLabel(micStatus)}</span>
          </div>
          <div className="precheck-item">
            <p>Internet</p>
            <span className={`status-badge ${internetStatus === "online" ? "success" : "danger"}`}>
              {internetStatus === "online" ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="inline-row">
          <button disabled={checksBusy || startBusy} onClick={runChecks}>
            {checksBusy ? "Running Checks..." : "Run Checks"}
          </button>
          <button disabled={!canStart || checksBusy || startBusy} onClick={startInterview}>
            {startBusy ? "Starting..." : "Start Interview"}
          </button>
        </div>
      </section>

      <section className="card stack-sm">
        <h3>Camera Preview</h3>
        <video ref={videoRef} className="interview-video preview-small" autoPlay muted playsInline />
        <p className="muted">Keep your face visible during the interview.</p>
      </section>
    </div>
  );
}
