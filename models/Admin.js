import mongoose from "mongoose";
import { ACCOUNT_STATUS, GENDER_OPTIONS, USER_ROLES } from "../utils/constants.js";

const adminSchema = new mongoose.Schema(
    {
        first_name: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        last_name: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        phone: {
            type: String,
            trim: true,
            maxlength: 10,
            index: true,
        },
        address: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        date_of_birth: {
            type: Date,
        },
        password_hash: {
            type: String,
            required: function () {
                return this.isVerified;
            },
        },
        status: {
            type: String,
            enum: Object.values(ACCOUNT_STATUS),
            default: ACCOUNT_STATUS.PENDING,
        },
        gender: {
            type: String,
            enum: GENDER_OPTIONS,
        },
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            default: USER_ROLES.ADMIN,
            required: true,
        },
        last_login_at: {
            type: Date,
        },
        // permissions: {
        //     dashboard: {
        //         view: { type: Boolean, default: false },
        //     },

        //     users: {
        //         view: { type: Boolean, default: false },
        //         create: { type: Boolean, default: false },
        //         update: { type: Boolean, default: false },
        //         delete: { type: Boolean, default: false },
        //     },

        //     booking: {
        //         view: { type: Boolean, default: false },
        //         create: { type: Boolean, default: false },
        //         assign: { type: Boolean, default: false },
        //         cancel: { type: Boolean, default: false },
        //     },

        //     stores: {
        //         view: { type: Boolean, default: false },
        //         create: { type: Boolean, default: false },
        //         update: { type: Boolean, default: false },
        //         delete: { type: Boolean, default: false },
        //     },
        // },
        isVerified: { type: Boolean, default: false },
        invited_by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    },
    { timestamps: true }
);

// Indexes
adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ role: 1, status: 1 });
adminSchema.index({ created_at: -1 });


// Method to compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password_hash);
};

// Virtual for formatted created date
adminSchema.virtual('created_date').get(function () {
    return this.created_at.toLocaleDateString();
});

const Admin = mongoose.model('admin', adminSchema);

export default Admin;