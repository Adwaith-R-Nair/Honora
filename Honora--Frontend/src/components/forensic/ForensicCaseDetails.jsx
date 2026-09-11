import { useState, useEffect } from "react";
import { useAuth } from "../common/useAuth.jsx";
import { getCaseById, getForensicReports, getCases } from "../../services/api.js";
import { GoldenDivider } from "../common/Shared.jsx";
import EvidenceSection from "../common/EvidenceSection.jsx";
import ForensicReportUploadModal from "./ForensicReportUploadModal.jsx";
import { PlusIcon } from "../../assets/icons/Icons.jsx";

const getFileFormat = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return "Video";
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return "Photo";
  if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) return "Text Document";
  if (['mp3', 'wav', 'm4a'].includes(ext)) return "Voice Note";
  return "Other";
};

export default function ForensicCaseDetails({ caseId, onBack }) {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [caseEvidence, setCaseEvidence] = useState([]);
  const [forensicReports, setForensicReports] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const statusColors = {
    "In Progress": "#ffb74d",
    Pending: "#f0d060",
    Completed: "#4ade80",
  };

  useEffect(() => {
    fetchCaseData();
  }, [caseId]);

  const fetchCaseData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch case details
      const caseResponse = await getCaseById(decodeURIComponent(caseId));
      const cData = caseResponse.data || caseResponse;
      const numericCaseId = cData.caseId;
      setCaseData({
        ...cData,
        id: cData.evidenceId || cData.caseId,
        title: cData.caseName,
        status: cData.status || "In Progress",
        relatedCaseId: numericCaseId,
        evidenceType: cData.filename,
      });

      // Fetch ALL evidence items for this case (not just the one clicked)
      const allEvidenceRes = await getCases();
      const allEvidence = (allEvidenceRes.data || []).filter(
        (e) => String(e.caseId) === String(numericCaseId)
      );
      setCaseEvidence(
        allEvidence.map((e) => ({ ...e, format: getFileFormat(e.filename), id: e.evidenceId }))
      );

      // Fetch forensic reports for ALL evidence items in this case
      try {
        const allDocs = [];
        for (const ev of allEvidence) {
          try {
            const res = await getForensicReports(ev.evidenceId);
            const docs = res.data || [];
            if (Array.isArray(docs)) allDocs.push(...docs);
          } catch (_) {
            // No docs for this evidenceId — that's fine
          }
        }
        setForensicReports(
          allDocs.map((d) => ({ ...d, id: d.docId, format: d.docType, filename: d.filename }))
        );
      } catch (err) {
        console.log("No forensic reports:", err.message);
        setForensicReports([]);
      }
    } catch (err) {
      console.error("Error fetching case data:", err);
      setError(err.message || "Failed to load case details");
    } finally {
      setLoading(false);
    }
  };

  const handleReportUpload = async (newReport) => {
    setForensicReports((prev) => [newReport, ...prev]);
    
    // Remove "new" flag after animation
    setTimeout(() => {
      setForensicReports((prev) =>
        prev.map((r) => (r.id === newReport.id ? { ...r, isNew: false } : r))
      );
    }, 2000);
  };

  if (loading) {
    return (
      <div className="dashboard view">
        <button className="back-btn" onClick={onBack}>
          ← Back to Cases
        </button>
        <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>
          Loading case details...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard view">
        <button className="back-btn" onClick={onBack}>
          ← Back to Cases
        </button>
        <div
          style={{
            padding: "20px",
            marginTop: "2rem",
            backgroundColor: "rgba(255,0,0,0.1)",
            border: "1px solid #ff6b6b",
            borderRadius: "6px",
            color: "#ff6b6b",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="dashboard view">
        <button className="back-btn" onClick={onBack}>
          ← Back to Cases
        </button>
        <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>
          Case not found.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard view">
      <button className="back-btn" onClick={onBack}>
        ← Back to Cases
      </button>

      <div className="fade-up">
        <p className="dash-eyebrow">Forensic Case Record</p>
        <h1 className="dash-title">{caseData.title}</h1>
        <div className="meta-grid">
          {[
            ["Case ID", caseData.caseId],
            ["Department", caseData.department || "General"],
            ["Filed By", caseData.uploadedBy || "N/A"],
            ["Filed On", caseData.timestamp ? new Date(caseData.timestamp * 1000).toLocaleDateString() : "N/A"],
            ["Analyst", user?.name || "Unknown"],
          ].map(([l, v]) => (
            <div className="meta-item" key={l}>
              <span className="meta-label">{l}</span>
              <span className="meta-value">{v}</span>
            </div>
          ))}
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span
              className="badge"
              style={{
                marginTop: "0.2rem",
                display: "inline-block",
                backgroundColor: `${statusColors[caseData.status] || "#f0d060"}20`,
                color: statusColors[caseData.status] || "#f0d060",
                padding: "0.4rem 0.8rem",
                borderRadius: "4px",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              {caseData.status}
            </span>
          </div>
        </div>
      </div>

      <div className="gold-divider" />

      {/* Original Evidence Section */}
      <div className="mb-36">
        <p className="section-eyebrow">SUBMITTED EVIDENCE</p>
        <h2 className="section-title-lg">Case Evidence Inventory</h2>
      </div>

      {caseEvidence.length === 0 ? (
        <p className="no-evidence-text">
          No evidence inventory documentation available for this case.
        </p>
      ) : (
        <EvidenceSection evidence={caseEvidence} caseId={caseId} />
      )}

      <GoldenDivider />

      {/* Forensic Reports Section */}
      <div className="mb-36">
        <p className="section-eyebrow">FORENSIC ANALYSIS</p>
        <h2 className="section-title-lg">Forensic Reports</h2>
      </div>

      {forensicReports.length === 0 ? (
        <p className="no-evidence-text">
          No forensic reports uploaded for this case yet.
        </p>
      ) : (
        <EvidenceSection evidence={forensicReports} caseId={caseId} />
      )}

      {/* Floating upload button */}
      <button
        className="fab-upload"
        onClick={() => setShowUpload(true)}
        title="Upload Forensic Report"
      >
        <span className="fab-tooltip">Upload Forensic Report</span>
        <PlusIcon />
      </button>

      {/* Upload modal */}
      {showUpload && (
        <ForensicReportUploadModal
          caseId={caseId}
          onClose={() => setShowUpload(false)}
          onUpload={handleReportUpload}
        />
      )}
    </div>
  );
}
