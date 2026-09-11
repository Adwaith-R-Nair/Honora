import { useState } from "react";
import { uploadEvidence } from "../../services/api.js";
import { CloseIcon, PlusIcon } from "../../assets/icons/Icons.jsx";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadEvidenceModal({ caseId, onClose, onUpload }) {
  const [form, setForm] = useState({
    file: null,
    fileName: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Progress bar UI exists but nothing wires up progress updates yet — not
  // part of this cleanup's scope, kept honest rather than silently "fixed".
  const [uploadProgress, _setUploadProgress] = useState(0);

  const handleOverlay = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large. Max: 50MB (yours: ${(file.size / 1024 / 1024).toFixed(2)}MB)`
      );
      return;
    }

    setError("");
    setForm((f) => ({ ...f, file, fileName: file.name }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.file) {
      setError("Please select a file to upload.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", form.file);
      formData.append("caseId", caseId);
      formData.append("caseName", form.file.name);
      formData.append("department", "General");

      const response = await uploadEvidence(formData);

      if (response.success) {
        const ev = response.data;
        const ext = ev.filename?.split('.').pop().toLowerCase();
        let format = "Other";
        if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) format = "Video";
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) format = "Photo";
        else if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) format = "Text Document";
        else if (['mp3', 'wav', 'm4a'].includes(ext)) format = "Voice Note";

        onUpload({ ...ev, id: ev.evidenceId, format, isNew: true });
        onClose();
      } else {
        setError(response.error || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload to blockchain/IPFS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal-glass upload-modal">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
          disabled={loading}
        >
          <CloseIcon />
        </button>

        <div className="modal-icon welcome-gold">
          <PlusIcon />
        </div>
        <h2 className="modal-title">Upload Evidence</h2>
        <p className="modal-subtitle">Case: {caseId}</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Evidence File</label>
            <div className="file-input-wrapper">
              <input
                type="file"
                onChange={handleFile}
                accept="video/*,image/*,audio/*,.pdf,.txt,.doc,.docx"
                disabled={loading}
              />
              <div className="file-input-display">
                <div className="file-input-icon">📂</div>
                <div className="file-input-text">Click or drag to upload file</div>
                {form.fileName && (
                  <div className="file-input-name">{form.fileName}</div>
                )}
              </div>
            </div>
            {form.file && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                Size: {(form.file.size / 1024 / 1024).toFixed(2)}MB
              </p>
            )}
          </div>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="input-group">
              <label>Upload Progress</label>
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  backgroundColor: "rgba(212,175,55,0.2)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    backgroundColor: "var(--gold)",
                    width: `${uploadProgress}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-btn-row">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn-gold${loading ? " loading" : ""}`}
              disabled={loading}
            >
              {loading ? <span className="loader" /> : "Submit Evidence"}
            </button>
          </div>
        </form>

        <p className="modal-notice">
          🔒 Evidence is cryptographically hashed and logged to chain of custody
        </p>
      </div>
    </div>
  );
}
