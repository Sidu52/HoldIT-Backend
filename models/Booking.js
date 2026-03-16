import mongoose from "mongoose";
import crypto from "crypto";
import { BOOKING_STATUS } from "../utils/constants.js";

const LocationSchema = new mongoose.Schema(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String, required: true, maxlength: 500 },
    },
    { _id: false }
);

const DriverAssignmentSchema = new mongoose.Schema(
    {
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
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
        luggage: {
            small: { type: Number, default: 0, min: 0 },
            medium: { type: Number, default: 0, min: 0 },
            large: { type: Number, default: 0, min: 0 },
            other: { type: Number, default: 0, min: 0 },
            totalCount: {
                type: Number,
                min: 1,
            },
        },
        luggagePhotos: {
            pickup: [{ type: String, maxlength: 500 }],
            store: [{ type: String, maxlength: 500 }],
            delivery: [{ type: String, maxlength: 500 }],
        },
        pickupLocation: {
            type: LocationSchema,
            required: true,
        },
        deliveryLocation: {
            type: LocationSchema,
            default: null,
        },
        pickup: {
            scheduledAt: Date,
            assignment: DriverAssignmentSchema,
        },
        storage: {
            storedAt: Date,
            expectedDurationHours: {
                type: Number,
                min: 1,
            },
            releasedAt: Date,
        },
        delivery: {
            requestedAt: Date,
            scheduledAt: Date,
            assignment: DriverAssignmentSchema,
        },
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
        payment: {
            status: {
                type: String,
                enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
                default: "PENDING",
                index: true,
            },
            paidAt: Date,
            transactionId: {
                type: String,
                sparse: true,
            },
            refundedAt: Date,
            refundAmount: {
                type: Number,
                min: 0,
            },
        },
        timeline: [TimelineEntrySchema],

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

// Auto generate booking code
BookingSchema.pre("save", async function () {
    if (!this.bookingCode) {
        this.bookingCode =
            "HLD-" +
            Date.now().toString(36).toUpperCase() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();
    }
});

// Luggage validation & total count
BookingSchema.pre("save", async function () {
    if (!this.isModified("luggage")) return;

    if (this.luggage) {
        const { small = 0, medium = 0, large = 0, other = 0 } = this.luggage;
        const total = small + medium + large + other;

        if (total < 1) {
            throw new Error("At least one luggage item is required");
        }

        this.luggage.totalCount = total;
    }
});

// Auto-track status changes in timeline
BookingSchema.pre("save", async function () {
    if (this.isModified("status")) {
        this.timeline.push({
            status: this.status,
            note: "Status updated",
            createdAt: new Date(),
        });
        this.lastStatusUpdatedAt = new Date();
    }
});

// Indexes
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ status: 1, isActive: 1 });
BookingSchema.index({ storeId: 1, status: 1 });
BookingSchema.index({ "pickup.assignment.driverId": 1, status: 1 });
BookingSchema.index({ "delivery.assignment.driverId": 1, status: 1 });

export default mongoose.model("Booking", BookingSchema);