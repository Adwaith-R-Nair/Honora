import { useAuth } from "../common/useAuth.jsx";
import { getCaseById, getLawyerDocuments, getCases } from "../../services/api.js";
import EvidenceSection from "../common/EvidenceSection.jsx";
import LawyerUploadModal from "./LawyerUploadModal.jsx";
import { useState, useEffect } from "react";

const getFileFormat = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return "Video";
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return "Photo";
  if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) return "Text Document";
  if (['mp3', 'wav', 'm4a'].includes(ext)) return "Voice Note";
  return "Other";
};

export default function LawyerCaseDetails({ caseId, onBack }) {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [supportingDocuments, setSupportingDocuments] = useState([]);
  const [forensicReports, setForensicReports] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCaseData();
  }, [caseId]);

  const fetchCaseData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch case details (evidence item from backend)
      const caseResponse = await getCaseById(decodeURIComponent(caseId));
      const cData = caseResponse.data || caseResponse;
      const numericCaseId = cData.caseId;
      setCaseData({
        ...cData,
        id: cData.evidenceId || cData.caseId,
        title: cData.caseName,
        status: cData.status || "Open",
      });

      // Fetch ALL evidence items for this case
      const allEvidenceRes = await getCases();
      const allEvidence = (allEvidenceRes.data || []).filter(
        (e) => String(e.caseId) === String(numericCaseId)
      );
      setEvidence(
        allEvidence.map((e) => ({ ...e, format: getFileFormat(e.filename), id: e.evidenceId }))
      );

      // Fetch supporting docs for ALL evidence items in this case
      try {
        const allDocs = [];
        for (const ev of allEvidence) {
          try {
            const res = await getLawyerDocuments(ev.evidenceId);
            const docs = res.data || [];
            if (Array.isArray(docs)) allDocs.push(...docs);
          } catch (_) {
            // No docs for this evidenceId
          }
        }
        const lawyerDocs = [];
        const forensicDocs = [];
        for (const doc of allDocs) {
          const mapped = { ...doc, id: doc.docId, format: doc.docType, filename: doc.filename };
          if (["forensic_report", "dna_analysis", "fingerprint_analysis", "digital_forensics", "chemical_analysis", "toxicology"].some(t => doc.docType?.includes(t))) {
            forensicDocs.push(mapped);
          } else {
            lawyerDocs.push(mapped);
          }
        }
        setSupportingDocuments(lawyerDocs);
        setForensicReports(forensicDocs);
      } catch (err) {
        console.log("No supporting documents:", err.message);
        setSupportingDocuments([]);
        setForensicReports([]);
      }
    } catch (err) {
      console.error("Error fetching case data:", err);
      setError(err.message || "Failed to load case details");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (newDoc) => {
    setSupportingDocuments((prev) => [...prev, newDoc]);
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

      <div style={{ animation: "fadeUp 0.45s ease both" }}>
        <p className="dash-eyebrow">Case Record</p>
        <h1 className="dash-title">{caseData.title}</h1>
        <div className="meta-grid">
          {[
            ["Case ID", caseData.caseId],
            ["Department", caseData.department || "General"],
            ["Filed By", caseData.uploadedBy || "N/A"],
            ["Filed On", caseData.timestamp ? new Date(caseData.timestamp * 1000).toLocaleDateString() : "N/A"],
            ["Counsel", user?.name || "Unknown"],
          ].map(([l, v]) => (
            <div className="meta-item" key={l}>
              <span className="meta-label">{l}</span>
              <span className="meta-value">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gold-divider" />

      {evidence.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px", marginTop: "1rem" }}>
          No evidence has been filed for this case yet.
        </p>
      ) : (
        <EvidenceSection evidence={evidence} caseId={caseId} />
      )}

      <div className="gold-divider" />

      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <p
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.3em",
                color: "var(--gold)",
                fontWeight: 600,
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              SUPPORTING DOCUMENTS
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.3rem,3vw,2rem)",
                color: "var(--text)",
                fontWeight: 700,
              }}
            >
              Trial Preparation Materials
            </h2>
          </div>
          <button
            className="btn-gold"
            onClick={() => setShowUploadModal(true)}
            style={{ padding: "8px 16px", fontSize: "14px" }}
          >
            + Upload Document
          </button>
        </div>

        {supportingDocuments.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px" }}>
            No supporting documents uploaded yet.
          </p>
        ) : (
          <EvidenceSection evidence={supportingDocuments} caseId={caseId} />
        )}
      </div>

      {forensicReports.length > 0 && (
        <>
          <div className="gold-divider" />
          <div style={{ marginBottom: 36 }}>
            <p
              style={{
                fontSize: "0.72rem",
                letterSpacing: "0.3em",
                color: "var(--gold)",
                fontWeight: 600,
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              FORENSIC ANALYSIS
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.3rem,3vw,2rem)",
                color: "var(--text)",
                fontWeight: 700,
              }}
            >
              Forensic Report
            </h2>
          </div>
          <EvidenceSection evidence={forensicReports} caseId={caseId} />
        </>
      )}

      {showUploadModal && (
        <LawyerUploadModal
          caseId={caseId}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          lawyerName={user?.name || "Unknown Lawyer"}
        />
      )}
    </div>
  );
}
