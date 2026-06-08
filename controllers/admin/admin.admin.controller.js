import crypto from "crypto";
import logger from "../../utils/logger.js";
import {
    isKeyExist,
    buildCacheKey,
    getCache,
    setCache,
    updateCache,
    incrementCache,
    deleteCache,
    deleteManyCache,
    deleteByPattern,
} from "../../utils/cache.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import { CACHE_TTL, STATUS_CODES, USER_ROLES, VERIFICATION_STATUS } from "../../utils/constants.js";

const EXCLUDED_FIELDS = "-password_hash -__v";

const adminProfileKey = (id) => buildCacheKey("admin:profile", { id });
const teamMemberKey = (id) => buildCacheKey("team:member", { id });
const teamListPattern = "team:list:*";
const adminsListPattern = "admins:list:*";

// CREATE INVITE
export const createAdminInvite = async (req, res) => {
    try {
        const { email, role } = req.body;
        const { auth_id: inviterId } = req.user;

        if (role === USER_ROLES.SUPER_ADMIN) {
            return sendError(res, "Cannot invite super admin role", STATUS_CODES.FORBIDDEN);
        }

        const existingAdmin = await Admin.findOne({ email }).select("_id verification_status").lean();

        if (existingAdmin?.verification_status === VERIFICATION_STATUS.VERIFIED) {
            return sendError(res, "An active account already exists with this email", STATUS_CODES.CONFLICT);
        }

        const cacheKey = buildCacheKey("admin:invite", { email });
        if (await isKeyExist(cacheKey)) {
            return sendError(res, "An invite has already been sent to this email", STATUS_CODES.CONFLICT);
        }

        const token = crypto.randomBytes(32).toString("hex");
        await setCache(cacheKey, { email, role, inviterId }, CACHE_TTL.DAY);

        const inviteLink = `${process.env.CLIENT_URL}/signup?token=${token}`;

        sendEmail({
            to: email,
            subject: "Invitation to Join Holdit",
            template: "invite-email.html",
            data: { first_name: "Team Member", invitation_link: inviteLink },
            rawFields: ["invitation_link"],
        }).catch((err) => logger.error("Failed to send invite email:", err.message));

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Invite sent successfully",
            ...(process.env.NODE_ENV === "development" && { data: { inviteLink } }),
        });
    } catch (err) {
        logger.error("[createAdminInvite] Error:", err);
        return sendError(res, "Failed to send invite");
    }
};

// GET PROFILE
export const getProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const cacheKey = adminProfileKey(auth_id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Profile fetched successfully", data: cached });

        const admin = await Admin.findById(auth_id).select(EXCLUDED_FIELDS).lean();
        if (!admin) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);

        await setCache(cacheKey, admin, CACHE_TTL.DETAIL);
        return sendResponse({ res, message: "Profile fetched successfully", data: admin });
    } catch (err) {
        logger.error("[getProfile] Error:", err);
        return sendError(res, "Failed to fetch profile");
    }
};

// UPDATE PROFILE
export const updateProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { first_name, last_name, phone, gender, address, date_of_birth } = req.body;

        const admin = await Admin.findById(auth_id).select("_id verification_status").lean();
        if (!admin) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);
        if (admin.verification_status !== VERIFICATION_STATUS.VERIFIED) {
            return sendError(res, "Account not verified. Please contact support.", STATUS_CODES.FORBIDDEN);
        }

        const updateFields = {
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(phone && { phone: phone.trim() }),
            ...(gender && { gender: gender.toLowerCase() }),
            ...(address && { address: address.trim() }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
        };

        const updatedAdmin = await Admin.findByIdAndUpdate(
            auth_id,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (!updatedAdmin) return sendError(res, "Failed to update profile", STATUS_CODES.INTERNAL_SERVER_ERROR);

        await updateCache(adminProfileKey(auth_id), updatedAdmin, CACHE_TTL.DETAIL);
        return sendResponse({ res, message: "Profile updated successfully", data: updatedAdmin });
    } catch (err) {
        logger.error("[updateProfile] Error:", err);
        return sendError(res, "Failed to update profile");
    }
};

// GET TEAM MEMBERS
export const getTeamsMember = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const {
            page = 1, limit = 10,
            account_status, role, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("team:list", {
            account_status: account_status || "all",
            limit: limitNum,
            page: pageNum,
            role: role || "all",
            search: search || "none",
            sort_by,
            sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Team members fetched successfully", data: cached });

        const filter = { _id: { $ne: auth_id } };
        if (account_status) filter.account_status = account_status;
        if (role) filter.role = role;
        if (search) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { first_name: { $regex: escaped, $options: "i" } },
                { last_name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
            ];
        }

        const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [teams, total] = await Promise.all([
            Admin.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
            Admin.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            teams,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
        return sendResponse({ res, message: "Team members fetched successfully", data: responseData });
    } catch (err) {
        logger.error("[getTeamsMember] Error:", err);
        return sendError(res, "Failed to fetch team members");
    }
};

// GET TEAM MEMBER BY ID
export const getTeamMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = teamMemberKey(id);

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: "Team member fetched successfully", data: cached });

        const team = await Admin.findById(id).select(EXCLUDED_FIELDS).lean();
        if (!team) return sendError(res, "Team member not found", STATUS_CODES.NOT_FOUND);

        await setCache(cacheKey, team, CACHE_TTL.DETAIL);
        return sendResponse({ res, message: "Team member fetched successfully", data: team });
    } catch (err) {
        logger.error("[getTeamMemberById] Error:", err);
        return sendError(res, "Failed to fetch team member");
    }
};

// GET ADMINS BY ROLE 
const getAdminsByRole = async (req, res, role) => {
    try {
        const {
            page = 1, limit = 10, search,
            sort_by = "createdAt", sort_order = "desc",
        } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);

        const cacheKey = buildCacheKey("admins:list", {
            limit: limitNum,
            page: pageNum,
            role,
            search: search || "none",
            sort_by,
            sort_order,
        });

        const cached = await getCache(cacheKey);
        if (cached) return sendResponse({ res, message: `${role}s fetched successfully`, data: cached });

        const filter = { role };
        if (search) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { first_name: { $regex: escaped, $options: "i" } },
                { last_name: { $regex: escaped, $options: "i" } },
                { email: { $regex: escaped, $options: "i" } },
            ];
        }

        const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
        const skip = (pageNum - 1) * limitNum;

        const [admins, total] = await Promise.all([
            Admin.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
            Admin.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limitNum);
        const responseData = {
            admins,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
            },
        };

        await setCache(cacheKey, responseData, CACHE_TTL.LIST);
        return sendResponse({ res, message: `${role}s fetched successfully`, data: responseData });
    } catch (err) {
        logger.error(`[getAdminsByRole:${role}] Error:`, err);
        return sendError(res, `Failed to fetch ${role}s`);
    }
};

export const getAdmins = (req, res) => getAdminsByRole(req, res, USER_ROLES.ADMIN);
export const getSuperAdmins = (req, res) => getAdminsByRole(req, res, USER_ROLES.SUPER_ADMIN);

// UPDATE TEAM MEMBER
export const updateTeamMember = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { id: team_id } = req.params;
        const { first_name, last_name, email, phone, gender, date_of_birth, address, verification_status } = req.body;

        if (auth_id === team_id?.toString()) {
            return sendError(res, "You cannot update your own details via this endpoint", STATUS_CODES.FORBIDDEN);
        }

        const teamMember = await Admin.findById(team_id).select("_id email").lean();
        if (!teamMember) return sendError(res, "Team member not found", STATUS_CODES.NOT_FOUND);

        if (email && email !== teamMember.email) {
            const conflict = await Admin.exists({ email: email.toLowerCase() });
            if (conflict) return sendError(res, "Email already in use", STATUS_CODES.CONFLICT);
        }

        const updatePayload = {
            ...(first_name && { first_name }),
            ...(last_name && { last_name }),
            ...(email && { email: email.toLowerCase() }),
            ...(phone && { phone }),
            ...(gender && { gender }),
            ...(date_of_birth && { date_of_birth }),
            ...(address && { address }),
            ...(verification_status && { verification_status }),
        };

        if (Object.keys(updatePayload).length === 0) {
            return sendError(res, "No update fields provided", STATUS_CODES.BAD_REQUEST);
        }

        const updatedTeamMember = await Admin.findByIdAndUpdate(
            team_id,
            { $set: updatePayload },
            { new: true, runValidators: true }
        ).select(EXCLUDED_FIELDS).lean();

        if (!updatedTeamMember) return sendError(res, "Failed to update team member", STATUS_CODES.INTERNAL_SERVER_ERROR);

        await Promise.all([
            updateCache(teamMemberKey(team_id), updatedTeamMember, CACHE_TTL.DETAIL),
            deleteByPattern(teamListPattern),
        ]);

        return sendResponse({ res, message: "Team member details updated successfully", data: updatedTeamMember });
    } catch (err) {
        logger.error("[updateTeamMember] Error:", err);
        return sendError(res, "Failed to update team member");
    }
};

// UPDATE ACCOUNT STATUS
export const updateAccountStatus = async (req, res) => {
    try {
        const { auth_id, account_status, reason } = req.body;
        const { auth_id: currentUserId, role: currentRole } = req.user;

        if (auth_id === currentUserId.toString()) {
            return sendError(res, "You cannot change your own account status", STATUS_CODES.FORBIDDEN);
        }

        const target = await Admin.findById(auth_id).select("_id role").lean();
        if (!target) return sendError(res, "Admin not found", STATUS_CODES.NOT_FOUND);
        if (target.role === USER_ROLES.SUPER_ADMIN) {
            return sendError(res, "Cannot modify super admin accounts", STATUS_CODES.FORBIDDEN);
        }

        const updateData = {
            account_status,
            status_updated_at: new Date(),
            status_updated_by: currentUserId,
            ...(account_status === ACCOUNT_STATUS.BLOCKED && reason && { block_reason: reason }),
        };

        const updatedAdmin = await Admin.findByIdAndUpdate(
            auth_id,
            { $set: updateData },
            { new: true }
        ).select(EXCLUDED_FIELDS).lean();

        await Promise.all([
            updateCache(teamMemberKey(auth_id), updatedAdmin, CACHE_TTL.DETAIL),
            deleteByPattern(teamListPattern),
        ]);

        return sendResponse({ res, message: "Account status updated successfully" });
    } catch (err) {
        logger.error("[updateAccountStatus] Error:", err);
        return sendError(res, "Failed to update account status");
    }
};

// BULK DEACTIVATE ADMINS
export const bulkDeactivateAdmins = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const { auth_id: currentUserId, role: currentRole } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            return sendError(res, "No admin IDs provided", STATUS_CODES.BAD_REQUEST);
        }
        if (ids.includes(currentUserId.toString())) {
            return sendError(res, "You cannot deactivate your own account", STATUS_CODES.FORBIDDEN);
        }

        const activeAdmins = await Admin.find({
            _id: { $in: ids },
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        }).select("_id role").lean();

        if (activeAdmins.length === 0) {
            return sendError(res, "No active admins found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        if (currentRole !== USER_ROLES.SUPER_ADMIN && activeAdmins.some((a) => a.role === USER_ROLES.SUPER_ADMIN)) {
            return sendError(res, "You cannot deactivate super admin accounts", STATUS_CODES.FORBIDDEN);
        }

        const activeIds = activeAdmins.map((a) => a._id);

        const result = await Admin.updateMany(
            { _id: { $in: activeIds } },
            {
                $set: {
                    account_status: ACCOUNT_STATUS.BLOCKED,
                    block_reason: reason ?? "Admin bulk deactivation",
                    status_updated_by: currentUserId,
                    status_updated_at: new Date(),
                },
            }
        );

        await Promise.all([
            deleteManyCache(activeIds.map((id) => teamMemberKey(id))),
            deleteByPattern(teamListPattern),
            deleteByPattern(adminsListPattern),
        ]);

        return sendResponse({
            res,
            message: `${result.modifiedCount} admin(s) deactivated successfully`,
            data: { requested: ids.length, deactivated: result.modifiedCount },
        });
    } catch (err) {
        logger.error("[bulkDeactivateAdmins] Error:", err);
        return sendError(res, "Failed to deactivate admins");
    }
};