import mongoose from "mongoose";
import crypto from "crypto";
import { BOOKING_STATUS } from "../utils/constants.js";

const LocationSchema = new mongoose.Schema(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String, default: "", maxlength: 500 },
    },
    { _id: false }
);

const DriverAssignmentSchema = new mongoose.Schema(
    {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
        returnOtp: {
            type: String,
            sparse: true,
        },
        otp: {
            type: String,
            sparse: true,
        },
        assignedAt: Date,
        acceptedAt: Date,
        startedAt: Date,
        completedAt: Date,
        cancelledAt: Date,
        cancelReason: String,
    },
    { _id: false }
);

const TimelineEntrySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            required: true,
        },
        note: {
            type: String,
            maxlength: 500,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "timeline.updatedByModel",
        },
        updatedByModel: {
            type: String,
            enum: ["User", "Driver", "Admin", "Store"],
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

// BOOKING SCHEMA
const BookingSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            index: true,
        },
        serviceAreaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ServiceableArea",
            index: true,
        },
        bookingCode: {
            type: String,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(BOOKING_STATUS),
            required: true,
            default: BOOKING_STATUS.CREATED,
            index: true,
        },
        lastStatusUpdatedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        // Luggage
        luggage: {
            small: { type: Number, default: 0, min: 0 },
            medium: { type: Number, default: 0, min: 0 },
            large: { type: Number, default: 0, min: 0 },
            other: { type: Number, default: 0, min: 0 },
            totalCount: { type: Number, min: 1 },
        },
        luggagePhotos: {
            pickup: [{ type: String, maxlength: 500 }],
            store: [{ type: String, maxlength: 500 }],
            delivery: [{ type: String, maxlength: 500 }],
        },

        // Notes
        notes: {
            type: String,
            maxlength: 500,
            default: "",
        },

        // Locations
        pickupLocation: { type: LocationSchema, required: true },
        deliveryLocation: { type: LocationSchema, default: null },

        // Pickup
        pickup: {
            scheduledAt: Date,
            assignment: DriverAssignmentSchema,
        },

        // Storage
        storage: {
            storedAt: Date,
            expectedDurationHours: { type: Number, min: 1 },
            releasedAt: Date,
        },

        // Delivery
        delivery: {
            requestedAt: Date,
            scheduledAt: Date,
            assignment: DriverAssignmentSchema,
        },

        // Pricing
        pricing: {
            perHourRate: { type: Number, min: 0 },
            storageHours: { type: Number, min: 0 },
            distanceCharge: { type: Number, min: 0 },
            totalAmount: { type: Number, min: 0 },
            currency: { type: String, default: "INR" },
            pricingRuleId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "PricingRule",
            },
        },

        // Payment
        payment: {
            status: {
                type: String,
                enum: ["pending", "paid", "failed", "refunded"],
                default: "pending",
                index: true,
            },
            paidAt: Date,
            transactionId: { type: String, sparse: true },
            refundedAt: Date,
            refundAmount: { type: Number, min: 0 },
        },

        // Timeline
        timeline: [TimelineEntrySchema],

        // Cancellation
        cancelledAt: Date,
        cancelledBy: {
            type: String,
            enum: ["USER", "DRIVER", "ADMIN", "SYSTEM"],
        },
        cancelReason: {
            type: String,
            maxlength: 500,
        },
    },
    {
        timestamps: true,
        versionKey: "__v",
        optimisticConcurrency: true,
    }
);

// Generate unique booking code on first save
BookingSchema.pre("save", async function () {
    if (this.bookingCode) return;

    for (let attempt = 0; attempt < 3; attempt++) {
        const code =
            "HLD-" +
            Date.now().toString(36).toUpperCase() +
            "-" +
            crypto.randomBytes(4).toString("hex").toUpperCase();

        const existing = await mongoose.model("Booking").findOne(
            { bookingCode: code },
            { bookingCode: 1 }
        );

        if (!existing) {
            this.bookingCode = code;
            return;
        }
    }

    throw new Error("Failed to generate unique booking code — please retry");
});

// Only runs when luggage is actually modified
BookingSchema.pre("save", async function () {
    if (!this.isModified("luggage")) return;

    const {
        small = 0,
        medium = 0,
        large = 0,
        other = 0,
    } = this.luggage;

    const total = small + medium + large + other;

    if (total < 1) {
        throw new Error("At least one luggage item is required");
    }

    this.luggage.totalCount = total;
});

// Guard against terminal state transitions
const TERMINAL_STATUSES = [
    BOOKING_STATUS.DELIVERED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL
];

BookingSchema.pre(["updateOne", "findOneAndUpdate", "findByIdAndUpdate"], async function () {
    const update = this.getUpdate();
    const newStatus = update.$set?.status || update.status;

    if (!newStatus) return;

    try {
        const docToUpdate = await this.model.findOne(this.getQuery());
        if (!docToUpdate) return;

        if (TERMINAL_STATUSES.includes(docToUpdate.status) && newStatus !== docToUpdate.status) {
            throw new Error(`Strict Error: Cannot transition booking from terminal status '${docToUpdate.status}' to '${newStatus}'`);
        }
    } catch (err) {
        throw err;
    }
});

// INDEXES
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ userId: 1, status: 1, isActive: 1 });
BookingSchema.index({ status: 1, isActive: 1 });
BookingSchema.index({ storeId: 1, status: 1 });
BookingSchema.index({ "pickup.assignment.driverId": 1, status: 1 });
BookingSchema.index({ "delivery.assignment.driverId": 1, status: 1 });

export default mongoose.model("Booking", BookingSchema);