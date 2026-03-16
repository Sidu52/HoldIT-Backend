import crypto from "crypto";
import { set, get, del } from "../../services/redisService.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import {
    ACCOUNT_STATUS,
    USER_ROLES,
    STATUS_CODES,
    INVITE_TOKEN_EXPIRY,
} from "../../utils/constants.js";

// CONSTANTS
const INVITE_TOKEN_EXPIRY_SECONDS = INVITE_TOKEN_EXPIRY * 60 * 60; // hours → seconds
const PROFILE_CACHE_TTL = 300; // 5 minutes
const LIST_CACHE_TTL = 120; // 2 minutes

// Fields that can be updated via profile update
const ALLOWED_PROFILE_FIELDS = [
    "first_name",
    "last_name",
    "phone",
    "gender",
    "address",
    "date_of_birth",
];

// Fields to exclude from responses
const EXCLUDED_FIELDS = "-password_hash -invited_by -__v";

// ============================================
// HELPER: Invalidate Team List Cache
// ============================================
const invalidateTeamCache = async () => {
    try {
        const { keys } = await scanKeys("team:*");
        if (keys.length > 0) {
            await Promise.all(keys.map((key) => del(key)));
        }
    } catch (err) {
        console.error("Failed to invalidate team cache:", err);
    }
};

// Import scanKeys from redis service
import { scanKeys } from "../../services/redisService.js";

// Escape Regex Special Characters
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// CREATE ADMIN INVITE
export const createAdminInvite = async (req, res) => {
    try {
        const { email, role } = req.body;
        const { auth_id: inviterId } = req.user;

        // Prevent inviting super_admin role
        if (role === USER_ROLES.SUPER_ADMIN) {
            return sendError(
                res,
                "Cannot invite super admin role",
                STATUS_CODES.FORBIDDEN
            );
        }

        // Prevent duplicate active invites
        const existingInvite = await get(`admin-invite-email:${email}`);
        if (existingInvite) {
            return sendError(
                res,
                "An invite has already been sent to this email",
                STATUS_CODES.CONFLICT
            );
        }

        // Check if admin already exists
        let admin = await Admin.findOne({ email })
            .select("_id isVerified")
            .lean();

        if (admin?.isVerified) {
            return sendError(
                res,
                "An active account already exists with this email",
                STATUS_CODES.CONFLICT
            );
        }

        // Create admin record if doesn't exist
        if (!admin) {
            admin = await Admin.create({
                email,
                role,
                isVerified: false,
                invited_by: inviterId,
                status: ACCOUNT_STATUS.PENDING,
            });
        }

        // Generate secure token
        const token = crypto.randomBytes(32).toString("hex");

        const invitePayload = {
            email,
            adminId: admin._id,
            inviterId,
        };

        // Store in Redis with expiry
        await Promise.all([
            set(
                `admin-invite:${token}`,
                JSON.stringify(invitePayload),
                "EX",
                INVITE_TOKEN_EXPIRY_SECONDS
            ),
            set(
                `admin-invite-email:${email}`,
                token,
                "EX",
                INVITE_TOKEN_EXPIRY_SECONDS
            ),
        ]);

        const inviteLink = `${process.env.CLIENT_URL}/signup?token=${token}`;

        // Send invite email (fire and forget)
        sendEmail({
            to: email,
            subject: "Invitation to Join Holdit",
            template: "invite-email.html",
            data: {
                first_name: "Team Member",
                invitation_link: inviteLink,
            },
            rawFields: ["invitation_link"],
        }).catch((err) =>
            console.error("Failed to send invite email:", err.message)
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Invite sent successfully",
            // Don't expose inviteLink in production
            ...(process.env.NODE_ENV === "development" && {
                data: { inviteLink },
            }),
        });
    } catch (err) {
        console.error("Create Admin Invite Error:", err);
        return sendError(res, "Failed to send invite");
    }
};

// GET PROFILE
export const getProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const cacheKey = `admin:profile:${auth_id}`;

        // Check Redis cache
        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Profile fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Fetch from DB
        const admin = await Admin.findById(auth_id)
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!admin) {
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Cache the result
        await set(cacheKey, JSON.stringify(admin), "EX", PROFILE_CACHE_TTL);

        return sendResponse({
            res,
            message: "Profile fetched successfully",
            data: admin,
        });
    } catch (err) {
        console.error("Get Profile Error:", err);
        return sendError(res, "Failed to fetch profile");
    }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const updates = {};
        ALLOWED_PROFILE_FIELDS.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return sendError(
                res,
                "No valid fields to update",
                STATUS_CODES.BAD_REQUEST
            );
        }

        const admin = await Admin.findByIdAndUpdate(
            auth_id,
            { $set: updates },
            {
                new: true,
                runValidators: true,
            }
        )
            .select(EXCLUDED_FIELDS)
            .lean();

        if (!admin) {
            return sendError(
                res,
                "Account not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Invalidate profile cache
        await del(`admin:profile:${auth_id}`);

        return sendResponse({
            res,
            message: "Profile updated successfully",
            data: admin,
        });
    } catch (err) {
        console.error("Update Profile Error:", err);
        return sendError(res, "Failed to update profile");
    }
};

// GET TEAM MEMBERS
export const getTeamsMember = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { first_name: { $regex: escapedSearch, $options: "i" } },
                { last_name: { $regex: escapedSearch, $options: "i" } },
                { email: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        // Build sort
        const sortDirection = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDirection };

        // Cache key includes all query params
        const cacheKey = `team:${pageNum}:${limitNum}:${status || "all"}:${search || "none"}:${sort_by}:${sort_order}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: "Team members fetched successfully",
                data: JSON.parse(cached),
            });
        }

        // Execute query and count in parallel
        const [teams, total] = await Promise.all([
            Admin.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Admin.countDocuments(filter),
        ]);

        const responseData = {
            teams,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < Math.ceil(total / limitNum),
                hasPrevPage: pageNum > 1,
            },
        };

        // Cache result
        await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);

        return sendResponse({
            res,
            message: "Team members fetched successfully",
            data: responseData,
        });
    } catch (err) {
        console.error("Get Team Members Error:", err);
        return sendError(res, "Failed to fetch team members");
    }
};

//  GET ADMINS BY ROLE
const getAdminsByRole = async (req, res, role) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            sort_by = "createdAt",
            sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const filter = { role };

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { first_name: { $regex: escapedSearch, $options: "i" } },
                { last_name: { $regex: escapedSearch, $options: "i" } },
                { email: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        const sortDirection = sort_order === "asc" ? 1 : -1;
        const sort = { [sort_by]: sortDirection };

        const cacheKey = `admins:${role}:${pageNum}:${limitNum}:${search || "none"}:${sort_by}:${sort_order}`;

        const cached = await get(cacheKey);
        if (cached) {
            return sendResponse({
                res,
                message: `${role}s fetched successfully`,
                data: JSON.parse(cached),
            });
        }

        const [admins, total] = await Promise.all([
            Admin.find(filter)
                .select(EXCLUDED_FIELDS)
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Admin.countDocuments(filter),
        ]);

        const responseData = {
            admins,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < Math.ceil(total / limitNum),
                hasPrevPage: pageNum > 1,
            },
        };

        await set(cacheKey, JSON.stringify(responseData), "EX", LIST_CACHE_TTL);

        return sendResponse({
            res,
            message: `${role}s fetched successfully`,
            data: responseData,
        });
    } catch (err) {
        console.error(`Get ${role}s Error:`, err);
        return sendError(res, `Failed to fetch ${role}s`);
    }
};

export const getAdmins = (req, res) =>
    getAdminsByRole(req, res, USER_ROLES.ADMIN);

export const getSuperAdmins = (req, res) =>
    getAdminsByRole(req, res, USER_ROLES.SUPER_ADMIN);

// UPDATE ACCOUNT STATUS
export const updateAccountStatus = async (req, res) => {
    try {
        const { auth_id, status, reason } = req.body;
        const { auth_id: currentUserId } = req.user;

        // Prevent self-modification
        if (auth_id === currentUserId.toString()) {
            return sendError(
                res,
                "You cannot change your own account status",
                STATUS_CODES.FORBIDDEN
            );
        }

        const admin = await Admin.findById(auth_id)
            .select("_id role status")
            .lean();

        if (!admin) {
            return sendError(
                res,
                "Admin not found",
                STATUS_CODES.NOT_FOUND
            );
        }

        // Prevent modifying super_admin accounts
        if (admin.role === USER_ROLES.SUPER_ADMIN) {
            return sendError(
                res,
                "Cannot modify super admin accounts",
                STATUS_CODES.FORBIDDEN
            );
        }

        // Prevent setting same status
        if (admin.status === status) {
            return sendError(
                res,
                `Account is already ${status}`,
                STATUS_CODES.CONFLICT
            );
        }

        // Build update
        const updateData = {
            status,
            status_updated_at: new Date(),
            status_updated_by: currentUserId,
        };

        if (status === ACCOUNT_STATUS.BLOCKED && reason) {
            updateData.block_reason = reason;
        }

        await Admin.findByIdAndUpdate(auth_id, { $set: updateData });

        // Invalidate caches
        await Promise.all([
            del(`admin:profile:${auth_id}`),
            invalidateTeamCache(),
        ]);

        // If blocking, invalidate all their sessions
        if (status === ACCOUNT_STATUS.BLOCKED || status === ACCOUNT_STATUS.INACTIVE) {
            const { keys } = await scanKeys(`refresh:${auth_id}:*`);
            if (keys.length > 0) {
                await Promise.all(keys.map((key) => del(key)));
            }
        }

        return sendResponse({
            res,
            message: `Account status updated to ${status}`,
        });
    } catch (err) {
        console.error("Update Account Status Error:", err);
        return sendError(res, "Failed to update account status");
    }
};