import mongoose from "mongoose";

const RefreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

 const RefreshToken = mongoose.model("RefreshToken", RefreshTokenSchema);
 export default RefreshToken;

