# Honora : Blockchain-Based Evidence Management System

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-v3.1.10-yellow)](https://hardhat.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v22-green?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://www.mongodb.com/)
[![IPFS](https://img.shields.io/badge/IPFS-Pinata-65C2CB)](https://pinata.cloud/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-DC244C)](https://qdrant.tech/)
[![Network](https://img.shields.io/badge/Network-Sepolia%20Testnet-blue)](https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

> A secure, tamper-proof evidence management system built on the Ethereum blockchain. Evidence files are stored on IPFS, metadata is anchored on-chain, and an AI-powered semantic search layer enables cross-case linkage detection. Role-based dashboards provide Police, Forensic, Lawyer, and Judge personnel with tailored interfaces for managing digital evidence.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Role-Based Access Control](#role-based-access-control)
- [Smart Contract](#smart-contract)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Important Notes](#important-notes)
- [Roadmap](#roadmap)
- [Team](#team)

---

## Overview

Honora is a university mini-project that demonstrates how blockchain technology can be used to secure digital evidence in law enforcement. The system ensures:

- **Immutability** : Evidence records cannot be altered once registered on-chain
- **Transparency** : Full chain-of-custody history is publicly verifiable on Etherscan
- **Integrity** : SHA-256 file hashing detects any tampering with evidence files
- **Access Control** : Role-based permissions ensure only authorized roles can perform specific actions
- **Decentralized Storage** : Files are stored on IPFS via Pinata, not on a centralized server
- **AI-Powered Search** : Semantic search and cross-case linkage detection using sentence-transformer embeddings

### Live Deployment

| Network | Contract Address | Explorer |
|---|---|---|
| Ethereum Sepolia Testnet | `0xf4e1c0179acC2A54C195e8687621ee070be06B3C` | [View on Etherscan](https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                               │
│            React + Vite Frontend (localhost:5173)                    │
│   Police Dashboard │ Forensic Dashboard │ Lawyer │ Judge            │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │ REST API                         │ REST + WebSocket
┌──────────▼──────────────────┐   ┌───────────▼───────────────────────┐
│       Backend Layer         │   │         AI Layer                   │
│  Node.js + Express + JWT    │   │  FastAPI + sentence-transformers   │
│     (localhost:3000)        │   │      (localhost:8000)              │
└───┬──────────────┬──────────┘   └───────────────┬───────────────────┘
    │ ethers.js v6 │ Mongoose                     │ qdrant-client
┌───▼──────────┐ ┌─▼──────────────────────┐  ┌────▼────────────────────┐
│  Blockchain  │ │    Storage Layer        │  │   Vector Database       │
│  Ethereum    │ │  IPFS via Pinata (files)│  │   Qdrant Cloud          │
│  Hardhat /   │ │  MongoDB Atlas (meta)   │  │   (384-dim embeddings)  │
│  Sepolia     │ └────────────────────────-┘  └─────────────────────────┘
└──────────────┘
```

### Evidence Upload Flow

```
Police uploads file via React dashboard
        ↓
Backend receives file (multer)
        ↓
1. Generate SHA-256 hash
2. Check for duplicate hash on-chain
3. Upload file to IPFS (Pinata) → get CID
4. Register evidence on-chain → get TX hash
5. Save enriched metadata to MongoDB
6. Auto-index to Qdrant via AI service → semantic embeddings
7. Cross-case linkage check → WebSocket alert if matches found
        ↓
Return: evidenceId, ipfsCID, fileHash, txHash, ipfsUrl
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity 0.8.24 |
| Blockchain Framework | Hardhat v3.1.10 |
| Contract Interaction | ethers.js v6 |
| Backend | Node.js v22 + Express |
| Language (Backend) | TypeScript (ESM) |
| Authentication | JWT (HS256) + bcrypt (12 rounds) |
| Database | MongoDB Atlas (Mongoose) |
| File Storage | IPFS via Pinata |
| File Hashing | SHA-256 |
| AI / NLP | FastAPI + sentence-transformers (`all-MiniLM-L6-v2`) |
| Vector Database | Qdrant Cloud (384-dim, cosine distance) |
| Document Processing | PyMuPDF (PDF) + python-docx (DOCX) |
| Frontend | React 18.2 + Vite 5.0 + React Router 6 |
| Styling | Custom CSS with design tokens, glassmorphism, particle effects |
| Real-time | WebSocket (FastAPI) for cross-case linkage alerts |

---

## Features

### Phase 1 : Core Evidence Management
- Upload evidence files to IPFS with SHA-256 integrity hashing
- Register evidence metadata on-chain (immutable)
- Retrieve evidence by ID with full metadata
- Transfer chain-of-custody between authorized wallets
- Full custody history recorded on-chain
- Duplicate file detection via on-chain hash registry

### Phase 2 : RBAC + Authentication
- JWT-based authentication (register / login / profile)
- Role-based access control (Police, Forensic, Lawyer, Judge)
- Upload supporting documents linked to evidence
- Integrity verification : recompute SHA-256 and compare against on-chain hash
- MongoDB user management with bcrypt password hashing
- Role enforcement middleware returning clear 403 errors

### Phase 3 : Metadata Enrichment
- MongoDB evidence collection stores `caseName`, `department`, `filename`, `status`
- Merged on-chain + off-chain data in single API response
- Supporting document metadata stored in MongoDB
- Case status management (Open / Under Investigation / Closed)

### Phase 4 : Testnet Deployment
- Contract deployed and verified on Ethereum Sepolia testnet
- Publicly verifiable on Etherscan

### Phase 5 : AI Layer
- **Semantic search** across all indexed evidence using `all-MiniLM-L6-v2` embeddings
- **Multi-factor ranking** : semantic similarity (0.85) + recency (0.10) + metadata match (0.05)
- **Cross-case linkage detection** with configurable similarity threshold (default: 0.72)
- **Real-time WebSocket alerts** when new evidence matches existing cases
- **Document preprocessing** : PDF table detection (PyMuPDF), DOCX parsing, text normalization
- Qdrant Cloud vector database with 384-dimensional cosine distance
- Auto-indexing of evidence and supporting documents on upload

### Phase 6 : Frontend
- **4 role-based dashboards** : Police, Forensic, Lawyer, Judge — each with tailored UI
- **Evidence upload** : Police can upload files with case metadata; auto-registered on-chain
- **Case management** : Search, filter, and browse cases with real-time status updates
- **Chain of custody timeline** : Visual history of all custody transfers
- **Integrity verification UI** : Forensic/Judge can upload files to verify against on-chain hash
- **Custody transfer UI** : Police/Forensic can transfer evidence to new wallet holders
- **AI semantic search** : Global search bar with ranked results and direct navigation
- **Cross-case linkage popup** : Real-time WebSocket notifications for linked cases
- **Supporting document management** : Forensic reports and lawyer filings per evidence item
- **Dark theme** with gold accents, glassmorphism, and canvas particle background
- **Protected routes** with JWT-based authentication and role guards

---

## Role-Based Access Control

| Action | Police | Forensic | Lawyer | Judge |
|---|:---:|:---:|:---:|:---:|
| Upload evidence | yes | - | - | - |
| Upload supporting docs | - | yes | yes | - |
| View evidence | yes | yes | yes | yes |
| Verify integrity | - | yes | - | yes |
| Transfer custody | yes | yes | - | - |
| Update case status | yes | - | - | - |
| AI semantic search | yes | yes | yes | yes |
| Cross-case linkage | yes | yes | yes | yes |
| Assign roles | - | - | - | - |

> Role assignment is restricted to the contract owner (deployer wallet) only.

---

## Smart Contract

**File:** `contracts/EvidenceRegistry.sol`

### Key Functions

| Function | Access | Description |
|---|---|---|
| `addEvidence(caseId, ipfsCID, fileHash)` | Police | Register new evidence on-chain |
| `addSupportingDoc(evidenceId, ipfsCID, fileHash, docType)` | Forensic, Lawyer | Link supporting document to evidence |
| `transferCustody(evidenceId, newHolder)` | Police, Forensic | Transfer evidence to new holder |
| `recordIntegrityCheck(evidenceId, passed)` | Forensic, Judge | Record integrity verification result |
| `assignRole(address, role)` | Owner | Assign role to wallet address |
| `revokeRole(address)` | Owner | Revoke role from wallet address |
| `getEvidence(evidenceId)` | View | Fetch evidence record |
| `getCustodyHistory(evidenceId)` | View | Fetch full custody chain |
| `getSupportingDocs(evidenceId)` | View | Fetch all supporting documents |
| `isFileHashRegistered(fileHash)` | View | Check for duplicate files |

---

## API Endpoints

### Backend (Express — port 3000)

All endpoints except `/api/auth/*` require `Authorization: Bearer <token>` header.

#### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT token |
| GET | `/api/auth/me` | Get current authenticated user profile |

**Register body:**
```json
{
  "name": "Officer John",
  "email": "john@police.gov",
  "password": "yourpassword",
  "role": "Police",
  "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

#### Evidence
| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/evidence/upload` | Police | Upload file + register on-chain |
| GET | `/api/evidence` | All | List all evidence (paginated) |
| GET | `/api/evidence/:id` | All | Get evidence + merged metadata |
| GET | `/api/evidence/:id/history` | All | Get custody history |
| PATCH | `/api/evidence/:id/status` | Police | Update case status |

#### Supporting Documents
| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/supporting-docs/upload` | Forensic, Lawyer | Upload supporting document |
| GET | `/api/supporting-docs/:evidenceId` | All | Get supporting docs for evidence |
| POST | `/api/supporting-docs/verify/:evidenceId` | Forensic, Judge | Verify primary evidence integrity |
| POST | `/api/supporting-docs/verify-doc/:docId` | Forensic, Judge | Verify supporting document integrity |

#### Custody
| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/custody/transfer` | Police, Forensic | Transfer custody |

**Upload form-data fields:**

| Key | Type | Description |
|---|---|---|
| `file` | File | Evidence file |
| `caseId` | Text | Case number |
| `caseName` | Text | e.g. "State v. Richardson" |
| `department` | Text | e.g. "financial-crimes" |

### AI Service (FastAPI — port 8000)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check + connected WebSocket clients |
| WS | `/ws` | WebSocket for real-time cross-case linkage alerts |
| POST | `/api/index` | Index single evidence file to vector DB |
| POST | `/api/index-supporting` | Index all supporting docs for an evidence |
| POST | `/api/search` | Semantic search across all indexed evidence |
| POST | `/api/cross-case-linkage` | Find semantically similar cases |

**Search body:**
```json
{
  "query": "drug trafficking evidence",
  "top_k": 10
}
```

**Cross-case linkage body:**
```json
{
  "evidenceId": "1",
  "top_k": 10
}
```

### Example Response : GET /api/evidence/:id
```json
{
  "success": true,
  "data": {
    "evidenceId": "1",
    "caseId": "2",
    "caseName": "State v. Richardson",
    "department": "financial-crimes",
    "filename": "evidence.jpg",
    "ipfsCID": "bafkrei...",
    "fileHash": "8597a983...",
    "uploadedBy": "0x70997970...",
    "timestamp": "1773501720",
    "currentHolder": "0x70997970...",
    "status": "Under Investigation",
    "ipfsUrl": "https://gateway.pinata.cloud/ipfs/bafkrei..."
  }
}
```

---

## Project Structure

```
Honora/
├── contracts/
│   └── EvidenceRegistry.sol              # Smart contract with RBAC
├── scripts/
│   ├── setup.ts                          # One-command: deploy + assign all roles
│   ├── deploy.ts                         # Local deployment
│   ├── deploy-sepolia.ts                 # Sepolia testnet deployment
│   └── assignRole.ts                     # Standalone role assignment
├── backend/
│   └── src/
│       ├── config/
│       │   ├── env.ts                    # Environment variable loader
│       │   └── db.ts                     # MongoDB connection
│       ├── models/
│       │   ├── user.model.ts             # User schema (MongoDB)
│       │   └── evidence.model.ts         # Evidence + SupportingDoc schemas
│       ├── middleware/
│       │   ├── auth.middleware.ts         # JWT verification
│       │   ├── role.middleware.ts         # Role-based access control
│       │   └── upload.middleware.ts       # Multer file upload handler
│       ├── services/
│       │   ├── contract.service.ts       # All blockchain interactions
│       │   ├── hash.service.ts           # SHA-256 file hashing
│       │   ├── pinata.service.ts         # IPFS file upload via Pinata
│       │   └── auth.service.ts           # Register/login business logic
│       ├── controllers/
│       │   ├── auth.controller.ts
│       │   ├── evidence.controller.ts
│       │   ├── custody.controller.ts
│       │   └── supportingDoc.controller.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── evidence.routes.ts
│       │   ├── custody.routes.ts
│       │   ├── supportingDoc.routes.ts
│       │   └── seed.routes.ts
│       ├── app.ts                        # Express app entry point
│       └── seed.ts                       # Database seeder
├── ailayer-querying/
│   ├── main.py                           # FastAPI app with all AI endpoints
│   ├── embeddings.py                     # Sentence-transformer model management
│   ├── vector_store.py                   # Qdrant vector database client
│   ├── search.py                         # Multi-factor semantic search
│   ├── cross_case.py                     # Cross-case linkage detection
│   ├── preprocessing.py                  # PDF/DOCX extraction & cleaning
│   └── requirements.txt                  # Python dependencies
├── Honora--Frontend/
│   ├── App.jsx                           # Root with Router + AuthProvider
│   ├── main.jsx                          # React entry point
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── useAuth.jsx           # Auth context (JWT + localStorage)
│   │   │   │   ├── ProtectedRoute.jsx    # Role-based route guard
│   │   │   │   ├── Navbar.jsx            # Top navigation bar
│   │   │   │   ├── HomeSection.jsx       # Landing page hero
│   │   │   │   ├── LoginModal.jsx        # Login form
│   │   │   │   ├── RoleSelection.jsx     # Role picker
│   │   │   │   ├── EvidenceModal.jsx     # Evidence viewer + blockchain actions
│   │   │   │   ├── EvidenceSection.jsx   # Evidence list
│   │   │   │   ├── EvidenceCard.jsx      # Evidence item card
│   │   │   │   ├── SearchBar.jsx         # AI semantic search
│   │   │   │   ├── CrossCasePopup.jsx    # WebSocket linkage alerts
│   │   │   │   └── Shared.jsx            # ParticleField, GoldenDivider
│   │   │   ├── police/
│   │   │   │   ├── PoliceDashboard.jsx
│   │   │   │   ├── CaseCard.jsx
│   │   │   │   ├── CaseDetails.jsx
│   │   │   │   ├── NewCaseModal.jsx
│   │   │   │   └── UploadEvidenceModal.jsx
│   │   │   ├── forensic/
│   │   │   │   ├── ForensicDashboard.jsx
│   │   │   │   ├── ForensicCaseCard.jsx
│   │   │   │   ├── ForensicCaseDetails.jsx
│   │   │   │   └── ForensicReportUploadModal.jsx
│   │   │   ├── lawyer/
│   │   │   │   ├── LawyerDashboard.jsx
│   │   │   │   ├── LawyerCaseCard.jsx
│   │   │   │   ├── LawyerCaseDetails.jsx
│   │   │   │   └── LawyerUploadModal.jsx
│   │   │   └── judge/
│   │   │       ├── JudgeDashboard.jsx
│   │   │       ├── JudgeCaseCard.jsx
│   │   │       └── JudgeCaseDetails.jsx
│   │   ├── services/
│   │   │   └── api.js                    # API client (backend + AI service)
│   │   ├── styles/
│   │   │   ├── variables.css             # Design tokens
│   │   │   ├── global.css                # Global styles
│   │   │   ├── components.css            # Shared component styles
│   │   │   ├── animations.css            # Keyframe animations
│   │   │   ├── police.css
│   │   │   ├── forensic.css
│   │   │   ├── lawyer.css
│   │   │   └── judge.css
│   │   ├── assets/icons/
│   │   │   └── Icons.jsx                 # SVG icon components
│   │   └── utils/
│   │       └── helpers.js                # Utility functions
│   ├── package.json
│   └── vite.config.js
├── hardhat.config.ts
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js v22+
- Python 3.10+
- npm
- Git

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Adwaith-R-Nair/Honora.git
cd Honora
```

**2. Install root dependencies (Hardhat + contracts)**
```bash
npm install
```

**3. Install backend dependencies**
```bash
cd backend && npm install && cd ..
```

**4. Install frontend dependencies**
```bash
cd Honora--Frontend && npm install && cd ..
```

**5. Install AI layer dependencies**
```bash
cd ailayer-querying && pip install -r requirements.txt && cd ..
```

**6. Set up environment variables**

Create `backend/.env`:
```env
PINATA_JWT=your_pinata_jwt_here
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=                        # filled after running setup.ts
PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
PORT=3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h
CORS_ORIGINS=http://localhost:5173

# Role-specific signing keys — REQUIRED for Forensic, Lawyer, and Judge on-chain actions
# These are Hardhat deterministic test accounts (safe for local dev only — never use real keys here)
FORENSIC_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
LAWYER_PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
JUDGE_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

Create `ailayer-querying/.env`:
```env
EMS_BACKEND_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256
QDRANT_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key
COLLECTION_NAME=evidence_vectors
PORT=8000
SIMILARITY_THRESHOLD=0.72
SEMANTIC_THRESHOLD=0.0
CROSS_CASE_MAX_RESULTS=10
```

Create root `.env` (for Sepolia deployment only):
```env
SEPOLIA_RPC_URL=your_alchemy_sepolia_url
SEPOLIA_PRIVATE_KEY=your_wallet_private_key
```

**7. Compile the smart contract**
```bash
npx hardhat compile
```

### Running Locally

You need 4 terminals:

**Terminal 1 — Hardhat node:**
```bash
npx hardhat node
```

**Terminal 2 — Deploy contract + assign roles:**
```bash
npx hardhat run scripts/setup.ts --network localhost
```
Copy the `CONTRACT_ADDRESS` from the output and paste it into `backend/.env`.

**Terminal 3 — Backend server:**
```bash
cd backend
npm run dev
```
Backend runs at `http://localhost:3000`

**Terminal 4 — AI service:**
```bash
cd ailayer-querying
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
AI service runs at `http://localhost:8000`

**Terminal 5 — Frontend dev server:**
```bash
cd Honora--Frontend
npm run dev
```
Frontend runs at `http://localhost:5173`

---

## Deployment

### Sepolia Testnet

**1. Get free Sepolia ETH** from [Google's faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)

**2. Set up root `.env`** with your Alchemy RPC URL and wallet private key

**3. Deploy:**
```bash
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
```

**Live deployment:**
```
Network  : Ethereum Sepolia Testnet
Chain ID : 11155111
Address  : 0xf4e1c0179acC2A54C195e8687621ee070be06B3C
Deployer : 0x22B02554A3Bc11825B4D2Bbb9AB9C4E694587c70
Etherscan: https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C
```

---

## Important Notes

- **Local blockchain resets** every time `npx hardhat node` restarts : all on-chain data is wiped
- Run `setup.ts` after every node restart to redeploy and reassign roles
- **MongoDB and IPFS data persists** across node restarts : only blockchain state is lost
- The seed route (`DELETE /api/seed/clear`) can clear MongoDB evidence data for a fresh start during development
- Never commit `.env` files to GitHub : they are gitignored
- The `PRIVATE_KEY` in `backend/.env` for local dev is Hardhat Account #1 (deterministic test wallet, not real)
- The AI service requires a running Qdrant instance (cloud or local) for vector storage
- The `JWT_SECRET` must match between the backend and AI service for token validation

---

## Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | Smart contract + IPFS + Backend API | Complete |
| 2 | RBAC + JWT Auth + MongoDB + Supporting Docs | Complete |
| 3 | MongoDB metadata enrichment (caseName, department, status) | Complete |
| 4 | Sepolia testnet deployment | Complete |
| 5 | AI Layer : semantic search + cross-case linkage + WebSocket alerts | Complete |
| 6 | React Frontend : role-based dashboards with full blockchain integration | Complete |
| 7 | Final documentation + submission | Complete |

---

## Team

| Name | Responsibility |
|---|---|
| Adwaith R Nair | Blockchain + Backend + Testing |
| Diya | AI Layer [NLP Querying] (FastAPI + Qdrant + sentence-transformers) + Documentation |
| Abhi | Frontend (React) + testing |
| Meghna | Cross-Case Linkage + Frontend (React) + documentation |

---
