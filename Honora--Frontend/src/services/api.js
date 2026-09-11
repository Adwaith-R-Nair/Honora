// services/api.js — Honora EMS API client
// Aligned with backend endpoints (Express port 3000) + AI service (FastAPI port 8000)

const BASE_URL = "http://localhost:3000/api";
const AI_BASE_URL = "http://localhost:8000";

async function request(endpoint, options = {}, baseUrl = BASE_URL) {
  const token = localStorage.getItem("honora_token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // If FormData is being sent, don't set Content-Type (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || data.detail || `API error: ${res.status}`);
  }

  return data;
}

// ============ AUTHENTICATION ============

export const signup = (name, email, password, role, walletAddress, department) =>
  request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role, department, walletAddress }),
  });

export const login = (email, password) =>
  request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getCurrentUser = () =>
  request("/auth/me", { method: "GET" });

// Logout is client-side only (JWT is stateless)
export const logout = () => {
  localStorage.removeItem("honora_token");
  localStorage.removeItem("honora_user");
  return Promise.resolve({ success: true });
};

// ============ EVIDENCE (Cases) ============

/**
 * Get all evidence items (used as "cases" in the dashboard).
 * Supports pagination: ?page=1&limit=50
 */
export const getCases = (page = 1, limit = 50) =>
  request(`/evidence?page=${page}&limit=${limit}`, { method: "GET" });

/**
 * Get a single evidence item by ID (merged blockchain + MongoDB data).
 */
export const getCaseById = (id) =>
  request(`/evidence/${id}`, { method: "GET" });

/**
 * Upload new police evidence.
 * FormData must contain: file, caseId, caseName, department
 */
export const uploadEvidence = (formData) =>
  request("/evidence/upload", {
    method: "POST",
    body: formData,
  });

/**
 * Alias for uploadEvidence — used by NewCaseModal.
 */
export const createCase = (formData) => {
  if (formData instanceof FormData) {
    return uploadEvidence(formData);
  }
  // If plain object, convert to FormData (shouldn't happen but safety net)
  const fd = new FormData();
  Object.entries(formData).forEach(([k, v]) => fd.append(k, v));
  return uploadEvidence(fd);
};

/**
 * Update case status (Police only).
 * PATCH /api/evidence/:id/status
 * Body: { status: "Open" | "Under Investigation" | "Closed" }
 */
export const updateCaseStatus = (evidenceId, status) =>
  request(`/evidence/${evidenceId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

// ============ CHAIN OF CUSTODY ============

/**
 * Transfer custody of evidence to a new holder.
 * Backend expects: { evidenceId: number, newHolder: "0x..." }
 */
export const transferCustody = (evidenceId, newHolder) =>
  request("/custody/transfer", {
    method: "POST",
    body: JSON.stringify({ evidenceId, newHolder }),
  });

/**
 * Get custody history for an evidence item.
 * Backend endpoint: GET /evidence/:id/history
 */
export const getCustodyHistory = (evidenceId) =>
  request(`/evidence/${evidenceId}/history`, { method: "GET" });

// Alias
export const getEvidenceHistory = getCustodyHistory;

// ============ SUPPORTING DOCUMENTS ============
// Both forensic reports and lawyer documents are "supporting docs" in the backend.

/**
 * Upload a supporting document (Forensic report or Lawyer filing).
 * FormData must contain: file, evidenceId, docType
 */
export const uploadSupportingDoc = (formData) =>
  request("/supporting-docs/upload", {
    method: "POST",
    body: formData,
  });

// Aliases for role-specific upload modals
export const uploadForensicReport = (formData) => uploadSupportingDoc(formData);
export const uploadLawyerDocument = (formData) => uploadSupportingDoc(formData);

/**
 * Get all supporting documents for an evidence item.
 * Returns merged on-chain + MongoDB data.
 */
export const getSupportingDocs = (evidenceId) =>
  request(`/supporting-docs/${evidenceId}`, { method: "GET" });

// Aliases
export const getLawyerDocuments = getSupportingDocs;
export const getForensicReports = getSupportingDocs;

/**
 * Verify evidence integrity (Forensic/Judge only).
 * Upload the same file to recompute hash and compare with on-chain hash.
 * FormData must contain: file
 */
export const verifyIntegrity = (evidenceId, formData) =>
  request(`/supporting-docs/verify/${evidenceId}`, {
    method: "POST",
    body: formData,
  });

/**
 * Verify supporting document integrity (Forensic/Judge only).
 * Upload the same file to recompute hash and compare with on-chain doc hash.
 * FormData must contain: file
 */
export const verifyDocIntegrity = (docId, formData) =>
  request(`/supporting-docs/verify-doc/${docId}`, {
    method: "POST",
    body: formData,
  });

// ============ AI SERVICE (port 8000) ============

/**
 * Semantic search across all indexed evidence.
 * Body: { query: "drug trafficking", top_k: 10 }
 */
export const searchEvidence = (query, topK = 10) =>
  request("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  }, AI_BASE_URL);

/**
 * Get cross-case linkage for an evidence item.
 * Body: { evidenceId: "1", top_k: 10 }
 */
export const getCrossCaseLinkage = (evidenceId, topK = 10) =>
  request("/api/cross-case-linkage", {
    method: "POST",
    body: JSON.stringify({ evidenceId: String(evidenceId), top_k: topK }),
  }, AI_BASE_URL);

/**
 * AI service health check.
 */
export const getAIHealth = () =>
  request("/health", { method: "GET" }, AI_BASE_URL);

// ============ UTILITY ============

export const getAuthToken = () => localStorage.getItem("honora_token");

export const clearAuthToken = () => {
  localStorage.removeItem("honora_token");
  localStorage.removeItem("honora_user");
};

export const setAuthToken = (token, user) => {
  localStorage.setItem("honora_token", token);
  localStorage.setItem("honora_user", JSON.stringify(user));
};

export const getStoredUser = () => {
  const user = localStorage.getItem("honora_user");
  return user ? JSON.parse(user) : null;
};
