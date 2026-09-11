import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import evidenceRoutes from "./routes/evidence.routes.js";
import custodyRoutes from "./routes/custody.routes.js";
import supportingDocRoutes from "./routes/supportingDoc.routes.js";
import seedRoutes from "./routes/seed.routes.js";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ENV.CORS_ORIGINS,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "EMS Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api/custody", custodyRoutes);
app.use("/api/supporting-docs", supportingDocRoutes);
app.use("/api/seed", seedRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

export default app;

// ── Connect to MongoDB then start server ──────────────────────────────────────
// Only bootstrap when this file is run directly (`npm run dev` / `node dist/app.js`),
// not when imported — e.g. by integration tests via supertest, which drive `app`
// directly and manage their own DB connection and lifecycle.
if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDB();

  app.listen(ENV.PORT, () => {
    console.log(`\n🚀 EMS Backend running on http://localhost:${ENV.PORT}`);
    console.log(`📋 Health check: http://localhost:${ENV.PORT}/health`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/auth/register`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/auth/login`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/evidence/upload            [Police]`);
    console.log(`  GET  http://localhost:${ENV.PORT}/api/evidence                   [All]`);
    console.log(`  GET  http://localhost:${ENV.PORT}/api/evidence/:id               [All]`);
    console.log(`  GET  http://localhost:${ENV.PORT}/api/evidence/:id/history       [All]`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/custody/transfer           [Police, Forensic]`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/supporting-docs/upload     [Forensic, Lawyer]`);
    console.log(`  GET  http://localhost:${ENV.PORT}/api/supporting-docs/:id        [All]`);
    console.log(`  POST http://localhost:${ENV.PORT}/api/supporting-docs/verify/:id [Forensic, Judge]`);
  });
}