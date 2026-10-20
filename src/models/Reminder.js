import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  dueAt: { type: Date, required: true, index: true },
  category: { type: String, enum: ["Personal", "Work", "Health", "Other"], default: "Personal" },
  completedAt: { type: Date, default: null },
  emailSentAt: { type: Date, default: null },
  emailSuppressed: { type: Boolean, default: false },
}, { timestamps: true });

reminderSchema.index({ user: 1, dueAt: 1 });
reminderSchema.index({ emailSentAt: 1, completedAt: 1, dueAt: 1 });
export default mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
