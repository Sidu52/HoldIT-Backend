import mongoose from "mongoose";
import crypto from "crypto";
import { BOOKING_STATUS } from "../utils/constants.js";

// Sub-schemas
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
        returnOtp: { type: String, sparse: true }, // Pickup Return OTP
        storageOtp: { type: String, sparse: true }, // Store Conform OTP
        storageReturnOtp: { type: String, sparse: true }, // Pickup Return OTP
        otp: { type: String, sparse: true, }, // Pickup OTP
        assignedAt: Date,
        acceptedAt: Date,
        startedAt: Date,
        completedAt: Date,
        cancelledAt: Date,
        cancelReason: String,
        notes: { type: String, maxlength: 500, default: "" },
    },
    { _id: false }
);

const TimelineEntrySchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        note: { type: String, maxlength: 500 },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "timeline.updatedByModel",
        },
        updatedByModel: {
            type: String,
            enum: ["User", "Driver", "Admin", "Store"],
        },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// Booking schema
const TERMINAL_STATUSES = new Set([
    BOOKING_STATUS.DELIVERED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.DRIVER_CANCELLED_CRITICAL,
]);

const BookingSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        userInfo: {
            firstName: { type: String, maxlength: 100, default: "" },
            lastName: { type: String, maxlength: 100, default: "" },
            phone: { type: String, maxlength: 20, default: "" },
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

        pickupLocation: { type: LocationSchema, required: true },
        storageLocation: { type: LocationSchema, required: true },
        deliveryLocation: { type: LocationSchema, default: null },

        pickup: {
            scheduledAt: Date,
            assignment: DriverAssignmentSchema,
        },

        storage: {
            storedAt: Date,
            expectedDurationHours: { type: Number, min: 1 },
            releasedAt: Date,
        },

        tipAmount: { type: Number, min: 0, default: 0 },
        coupenCode: { type: String, maxlength: 50 },

        delivery: {
            requestedAt: Date,
            assignment: DriverAssignmentSchema,
        },

        pricing: {
            perHourRate: { type: Number, min: 0 },
            storageHours: { type: Number, min: 0 },
            distanceCharge: { type: Number, min: 0 },
            totalAmount: { type: Number, min: 0 },
            currency: { type: String, default: "INR", maxlength: 3 },
            pricingRuleId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "PricingRule",
            },
        },

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

        timeline: { type: [TimelineEntrySchema], default: [] },

        cancelledAt: Date,
        cancelledBy: {
            type: String,
            enum: ["USER", "DRIVER", "ADMIN", "SYSTEM"],
        },
        cancelReason: { type: String, maxlength: 500 },
        isActive: { type: Boolean, default: true, index: true },
    },
    {
        timestamps: true,
        optimisticConcurrency: true,
    }
);

// Pre-save: generate bookingCode
BookingSchema.pre("save", async function () {
    if (this.bookingCode) return;

    for (let attempt = 0; attempt < 5; attempt++) {
        const code = "HLD-" + crypto.randomBytes(8).toString("hex").toUpperCase();
        const collision = await mongoose
            .model("Booking")
            .exists({ bookingCode: code });

        if (!collision) {
            this.bookingCode = code;
            return;
        }
    }

    throw new Error("Failed to generate a unique booking code — please retry.");
});

// sync totalCount & isActive
BookingSchema.pre("save", function () {
    // Keep totalCount in sync whenever luggage is touched
    if (this.isModified("luggage")) {
        const { small = 0, medium = 0, large = 0, other = 0 } = this.luggage;
        const total = small + medium + large + other;
        if (total < 1) throw new Error("At least one luggage item is required.");
        this.luggage.totalCount = total;
    }

    // Keep isActive in sync with terminal statuses
    if (this.isModified("status")) {
        this.isActive = !TERMINAL_STATUSES.has(this.status);
        this.lastStatusUpdatedAt = new Date();
    }
});

// terminal status guard + isActive sync
// Prevents moving a booking out of a terminal status via findOneAndUpdate / updateOne,
// AND keeps isActive in sync so query filters work correctly.
BookingSchema.pre(
    ["updateOne", "findOneAndUpdate", "findByIdAndUpdate"],
    async function () {
        const update = this.getUpdate();
        const newStatus = update?.$set?.status ?? update?.status;
        if (!newStatus) return;

        const doc = await this.model.findOne(this.getQuery()).select("status").lean();
        if (!doc) return;

        if (TERMINAL_STATUSES.has(doc.status) && newStatus !== doc.status) {
            throw new Error(
                `Cannot transition booking from terminal status '${doc.status}' to '${newStatus}'.`
            );
        }

        // Keep isActive in sync for update operations (pre-save only fires on .save())
        const isActive = !TERMINAL_STATUSES.has(newStatus);
        if (!update.$set) update.$set = {};
        update.$set.isActive = isActive;
        update.$set.lastStatusUpdatedAt = new Date();
    }
);

// Indexes
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ userId: 1, status: 1, isActive: 1 });
BookingSchema.index({ status: 1, isActive: 1 });
BookingSchema.index({ storeId: 1, status: 1 });
BookingSchema.index({ "pickup.assignment.driverId": 1, status: 1 });
BookingSchema.index({ "delivery.assignment.driverId": 1, status: 1 });
// Useful for the history query (filtered by userId + status set, sorted by date)
BookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Booking", BookingSchema);