import { set, get } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import { ACCOUNT_STATUS, USER_ROLES, STATUS_CODES, INVITE_TOKEN_EXPIRY } from "../../utils/constants.js";
import crypto from "crypto";

// Get Admin Profile
export const getProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const cacheKey = `admin:profile:${auth_id}`;

        // Check Redis first
        const cachedProfile = await get(cacheKey);
        if (cachedProfile) {
            return sendResponse({
                res,
                message: "User profile fetched successfully",
                data: JSON.parse(cachedProfile),
            });
        }

        // Fetch from DB
        const admin = await Admin.findById(auth_id)
            .select("-password_hash -__v")
            .lean()
            .populate("role");

        if (!admin) {
            return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
        }

        // Store in Redis
        await set(cacheKey, JSON.stringify(admin), "EX", 300);

        sendResponse({
            res,
            message: "User profile fetched successfully",
            data: admin,
        });
    } catch (err) {
        console.error("Get Admin Profile Error:", err);
        sendError(res, "Failed to fetch profile");
    }
};


// Get Admins
const getAdminsByRole = async (role, res) => {
    const cacheKey = `admins:role:${role}`;

    const cached = await get(cacheKey);
    if (cached) {
        return sendResponse({
            res,
            message: `${role} fetched successfully`,
            data: JSON.parse(cached),
        });
    }

    const admins = await Admin.find({ role })
        .select("-password -__v")
        .lean();

    await set(cacheKey, JSON.stringify(admins), "EX", 300);

    sendResponse({
        res,
        message: `${role} fetched successfully`,
        data: admins,
    });
};

export const getAdmins = (req, res) =>
    getAdminsByRole(USER_ROLES.ADMIN, res);

export const getSuperAdmins = (req, res) =>
    getAdminsByRole(USER_ROLES.SUPER_ADMIN, res);


// Create admin invite
export const createAdminInvite = async (req, res) => {
    try {
        const { email } = req.body;
        const { auth_id: inviterId } = req.user;

        if (!email) {
            return sendError(res, "Email is required", STATUS_CODES.BAD_REQUEST);
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return sendError(res, "Invalid email format", STATUS_CODES.BAD_REQUEST);
        }

        // Prevent duplicate active invites
        const inviteExists = await get(`admin-invite-email:${email}`);
        if (inviteExists) {
            return sendError(res, "Invite already sent", STATUS_CODES.CONFLICT);
        }

        // Check admin existence
        let admin = await Admin.findOne({ email });

        if (admin?.isVerified) {
            return sendError(res, "Admin already exists", STATUS_CODES.CONFLICT);
        }

        if (!admin) {
            admin = await Admin.create({
                email,
                role: USER_ROLES.ADMIN,
                isVerified: false,
                invited_by: inviterId,
                status: ACCOUNT_STATUS.PENDING,
            });
        }

        // Generate unique token
        const token = crypto.randomBytes(32).toString("hex");

        const invitePayload = {
            email,
            adminId: admin._id,
            inviterId,
        };

        // Store in Redis
        await Promise.all([
            set(
                `admin-invite:${token}`,
                JSON.stringify(invitePayload),
                "EX",
                INVITE_TOKEN_EXPIRY
            ),
            set(
                `admin-invite-email:${email}`,
                token,
                "EX",
                INVITE_TOKEN_EXPIRY
            ),
        ]);

        const inviteLink = `${process.env.ADMIN_UI_URL}/admin/signup?token=${token}`;

        sendResponse({
            res,
            message: "Admin invite sent successfully",
            data: { inviteLink },
        });
    } catch (err) {
        console.error("Create Admin Invite Error:", err);
        sendError(res, "Failed to create admin invite");
    }
};


// Update account
export const updateAccountStatus = async (req, res) => {
    try {
        const { status, adminId } = req.body;

        if (!adminId || !status) {
            return sendError(res, "adminId and status are required");
        }

        if (!Object.values(ACCOUNT_STATUS).includes(status)) {
            return sendError(res, "Invalid account status");
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return sendError(res, "Admin not found", STATUS_CODES.NOT_FOUND);
        }

        admin.status = status;
        await admin.save();

        // Invalidate cache
        await set(`admin:profile:${adminId}`, "", "EX", 1);

        sendResponse({
            res,
            message: "Account status updated successfully",
        });
    } catch (err) {
        console.error("Update Account Error:", err);
        sendError(res, "Failed to update account status");
    }
};
