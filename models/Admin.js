
import mongoose from "mongoose";
import bcrypt from "bcrypt";
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
        },
        phone: {
            type: String,
            trim: true,
            maxlength: 15, 
            sparse: true, 
            unique: true,
        },
        address: {
            type: String,
            trim: true,
            maxlength: 500,
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
            index: true,
        },
        gender: {
            type: String,
            enum: Object.values(GENDER_OPTIONS),
        },
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            default: USER_ROLES.ADMIN,
            required: true,
            index: true,
        },
        last_login_at: {
            type: Date,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        invited_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
    },
    { timestamps: true }
);


adminSchema.index({ role: 1, status: 1 });
adminSchema.index({ createdAt: -1 });

// Method to compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password_hash) {
        return false;
    }
    return bcrypt.compare(candidatePassword, this.password_hash);
};

adminSchema.virtual('created_date').get(function () {
    return this.createdAt ? this.createdAt.toLocaleDateString() : null;
});

adminSchema.set('toJSON', { virtuals: true });
adminSchema.set('toObject', { virtuals: true });

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;