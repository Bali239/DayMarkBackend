import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    picture: { type: String, default: "" },
    emailVerified: { type: Boolean, default: false },
    reminderAdvanceMinutes: {
      type: Number,
      enum: [0, 5, 15, 30, 60, 1440],
      default: 15,
    },
    pushTokens: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.User || mongoose.model("User", userSchema);
