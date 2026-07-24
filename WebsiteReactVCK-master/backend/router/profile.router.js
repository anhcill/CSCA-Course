import express from "express";
import { getProfileDashboard } from "../controllers/profile.controllers.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/dashboard", protectRoute, getProfileDashboard);

export default router;
