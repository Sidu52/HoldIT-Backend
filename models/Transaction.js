import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      unique: true
    },
    amount: Number,
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"]
    },
    paymentMethod: String
  },
  { timestamps: true }
);
 
const Transaction = mongoose.model("Transaction", TransactionSchema);

export default Transaction;