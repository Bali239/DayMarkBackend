import { Router } from "express";
import requireAuth from "../middlewares/requireAuth.js";
import {
  createReminder,
  getReminders,
  removeReminder,
  toggleReminder,
  updateReminder,
  updateReminderAdvance,
} from "../controller/reminder.js";

const router = Router();

router.use(requireAuth);
router.get("/", getReminders);
router.post("/", createReminder);
router.patch("/preferences/advance", updateReminderAdvance);
router.patch("/:id/complete", toggleReminder);
router.patch("/:id", updateReminder);
router.delete("/:id", removeReminder);

export default router;
