import { Router } from "express";
import { register, login, getMe, challenge } from "../controllers/auth.controller.js";
import { authenticateJWT } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/auth/challenge — step 1: get a nonce to sign, proving wallet ownership
router.post("/challenge", challenge);

// POST /api/auth/register — register a new user
router.post("/register", register);

// POST /api/auth/login — login and receive JWT token
router.post("/login", login);

// GET /api/auth/me — get current user profile
router.get("/me", authenticateJWT, getMe);

export default router;