import crypto from "crypto";
import logger from "../../utils/logger.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import { STATUS_CODES, USER_ROLES, VERIFICATION_STATUS, ACCOUNT_STATUS } from "../../utils/constants.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";
import { getCache, isKeyExist, setCache, updateCache, cacheAside, deleteByPattern } from "../../constants/redis/redisOperation.js";
import { ExcludedFields } from "../../helpers/admin/admin.js";
import { AuthKeys } from "../../constants/redis/auth.keys.js";
import { NS } from "../../constants/redis/namespaces.js";

// CREATE INVITE
export const createAdminInvite = async (req, res) => {
    try {
        const { email, role } = req.body;
        const { auth_id: inviterId } = req.user;

        if (role === USER_ROLES.SUPER_ADMIN) {
            return sendError(res, "Cannot invite super admin role", STATUS_CODES.FORBIDDEN);
        }

        const isCached = await isKeyExist(AdminKeys.invite(email));
        if (isCached) {
            return sendError(res, "An invite has already been sent to this email", STATUS_CODES.CONFLICT);
        }

        const existingAdmin = await Admin.findOne({ email }).select("_id verification_status").lean();

        if (existingAdmin?.verification_status === VERIFICATION_STATUS.VERIFIED) {
            return sendError(res, "An active account already exists with this email", STATUS_CODES.CONFLICT);
        }

        const token = crypto.randomBytes(32).toString("hex");
        const inviteLink = `${process.env.CLIENT_URL}/signup?token=${token}`;

        await Admin.create({
            email, role,
            invited_by: inviterId,
        });

        // set invite token
        await setCache(AdminKeys.inviteToken(token), { email, role, inviterId }, AdminTTL.INVITE_TOKEN);
        // set invite email
        await setCache(AdminKeys.invite(email), { email, role, inviterId }, AdminTTL.INVITE);

        // send invite email
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

// RESEND INVITE
export const resendInvite = async (req, res) => {
    try {
        const { id: memberId } = req.params;
        const { auth_id: inviterId } = req.user;


        const memberData = await Admin.findById(memberId)
            .select("_id verification_status email role")
            .lean();

        if (!memberData) {
            return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);
        }

        if (memberData.verification_status === VERIFICATION_STATUS.VERIFIED) {
            return sendError(
                res,
                "An active account already exists with this email",
                STATUS_CODES.CONFLICT
            );
        }

        const email = memberData.email;

        const isCached = await isKeyExist(AdminKeys.invite(email));
        if (!isCached) {
            return sendError(res, "Invite not found for this email", STATUS_CODES.NOT_FOUND);
        }

        const token = crypto.randomBytes(32).toString("hex");
        const inviteLink = `${process.env.CLIENT_URL}/signup?token=${token}`;

        await updateCache(AdminKeys.inviteToken(token), {
            token,
            email,
            role: memberData.role,
            inviterId,
        }, AdminTTL.INVITE_TOKEN);

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
            logger.error("Failed to send invite email:", err.message)
        );

        return sendResponse({
            res,
            statusCode: STATUS_CODES.CREATED,
            message: "Invite sent successfully",
            ...(process.env.NODE_ENV === "development" && {
                data: { inviteLink },
            }),
        });
    } catch (err) {
        logger.error("[resendInvite] Error:", err);
        return sendError(res, "Failed to resend invite");
    }
};

// GET PROFILE
export const getProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;

        const admin = await cacheAside(
            AdminKeys.profile(auth_id),
            AdminTTL.PROFILE,
            () => Admin.findById(auth_id).select(ExcludedFields).lean()
        );

        if (!admin) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "Profile fetched successfully", data: admin });
    } catch (err) {
        logger.error("[getProfile] Error:", err);
        return sendError(res, "Failed to fetch profile");
    }
};

// UPDATE PROFILE (admin only)
export const updateProfile = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { first_name, last_name, phone, gender, address, date_of_birth } =
            req.validated?.body ?? req.body;

        const updateFields = {
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(phone && { phone: phone.trim() }),
            ...(gender && { gender: gender.toLowerCase() }),
            ...(address && { address: address.trim() }),
            ...(date_of_birth && { date_of_birth: new Date(date_of_birth) }),
        };

        if (!Object.keys(updateFields).length) {
            return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);
        }

        const updatedAdmin = await Admin.findOneAndUpdate(
            { _id: auth_id, verification_status: VERIFICATION_STATUS.VERIFIED },
            { $set: updateFields },
            { new: true, runValidators: true, context: "query" }
        ).select(ExcludedFields).lean();

        if (!updatedAdmin) {
            const exists = await Admin.exists({ _id: auth_id });
            if (!exists) return sendError(res, "Account not found", STATUS_CODES.NOT_FOUND);
            return sendError(res, "Account not verified. Please contact support.", STATUS_CODES.FORBIDDEN);
        }

        // update cache
        await Promise.allSettled([
            setCache(AdminKeys.profile(auth_id), updatedAdmin, AdminTTL.PROFILE),
            deleteByPattern(AdminKeys.teamListPattern()),
        ]).then((results) =>
            results.forEach((r) => r.status === "rejected" && logger.warn("[updateProfile] cache sync failed:", r.reason?.message))
        );

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

        const cacheKey = AdminKeys.teamList({
            requesterId: auth_id,
            page: pageNum,
            limit: limitNum,
            account_status,
            role,
            search,
            sort_by,
            sort_order,
        });

        const responseData = await cacheAside(cacheKey, AdminTTL.TEAM_LIST, async () => {
            const filter = { _id: { $ne: auth_id } };
            if (account_status !== undefined && account_status !== "") {
                filter.account_status = account_status;
            }
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
                Admin.find(filter).select(ExcludedFields).sort(sort).skip(skip).limit(limitNum).lean(),
                Admin.countDocuments(filter),
            ]);

            const totalPages = Math.ceil(total / limitNum);
            return {
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
        });

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

        const team = await cacheAside(
            AdminKeys.profile(id),
            AdminTTL.PROFILE,
            () => Admin.findById(id).select(ExcludedFields).lean()
        );

        if (!team) return sendError(res, "Team member not found", STATUS_CODES.NOT_FOUND);
        return sendResponse({ res, message: "Team member fetched successfully", data: team });
    } catch (err) {
        logger.error("[getTeamMemberById] Error:", err);
        return sendError(res, "Failed to fetch team member");
    }
};

// // GET ADMINS BY ROLE 
// const getAdminsByRole = async (req, res, role) => {
//     try {
//         const {
//             page = 1, limit = 10, search,
//             sort_by = "createdAt", sort_order = "desc",
//         } = req.query;

//         const pageNum = Number(page);
//         const limitNum = Number(limit);

//         const cacheKey = buildCacheKey("admins:list", {
//             limit: limitNum,
//             page: pageNum,
//             role,
//             search: search || "none",
//             sort_by,
//             sort_order,
//         });

//         const cached = await getCache(cacheKey);
//         if (cached) return sendResponse({ res, message: `${role}s fetched successfully`, data: cached });

//         const filter = { role };
//         if (search) {
//             const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//             filter.$or = [
//                 { first_name: { $regex: escaped, $options: "i" } },
//                 { last_name: { $regex: escaped, $options: "i" } },
//                 { email: { $regex: escaped, $options: "i" } },
//             ];
//         }

//         const sort = { [sort_by]: sort_order === "asc" ? 1 : -1 };
//         const skip = (pageNum - 1) * limitNum;

//         const [admins, total] = await Promise.all([
//             Admin.find(filter).select(EXCLUDED_FIELDS).sort(sort).skip(skip).limit(limitNum).lean(),
//             Admin.countDocuments(filter),
//         ]);

//         const totalPages = Math.ceil(total / limitNum);
//         const responseData = {
//             admins,
//             pagination: {
//                 currentPage: pageNum,
//                 totalPages,
//                 totalItems: total,
//                 itemsPerPage: limitNum,
//                 hasNextPage: pageNum < totalPages,
//                 hasPrevPage: pageNum > 1,
//             },
//         };

//         await setCache(cacheKey, responseData, CACHE_TTL.LIST);
//         return sendResponse({ res, message: `${role}s fetched successfully`, data: responseData });
//     } catch (err) {
//         logger.error(`[getAdminsByRole:${role}] Error:`, err);
//         return sendError(res, `Failed to fetch ${role}s`);
//     }
// };

// export const getAdmins = (req, res) => getAdminsByRole(req, res, USER_ROLES.ADMIN);
// export const getSuperAdmins = (req, res) => getAdminsByRole(req, res, USER_ROLES.SUPER_ADMIN);

// UPDATE TEAM MEMBER
export const updateTeamMember = async (req, res) => {
    try {
        const { auth_id } = req.user;
        const { id: team_id } = req.params;
        const { first_name, last_name, email, phone, gender, date_of_birth, address, verification_status } = req.body;

        if (auth_id === team_id?.toString()) {
            return sendError(res, "You cannot update your own details from this endpoint", STATUS_CODES.FORBIDDEN);
        }

        const updateFields = {
            ...(first_name && { first_name: first_name.trim() }),
            ...(last_name && { last_name: last_name.trim() }),
            ...(email && { email: email.toLowerCase() }),
            ...(phone && { phone }),
            ...(gender && { gender }),
            ...(date_of_birth && { date_of_birth }),
            ...(address && { address }),
            ...((verification_status === VERIFICATION_STATUS.VERIFIED || verification_status === VERIFICATION_STATUS.REJECTED) && { verification_status }),
        };

        if (!Object.keys(updateFields).length) {
            return sendError(res, "No fields provided to update", STATUS_CODES.BAD_REQUEST);
        }

        const updatedAdmin = await Admin.findOneAndUpdate(
            { _id: team_id },   
            { $set: updateFields },
            { new: true, runValidators: true, context: "query" }
        ).select(ExcludedFields).lean();

        if (!updatedAdmin) {
            return sendError(res, "Team member not found", STATUS_CODES.NOT_FOUND);
        }

        await Promise.allSettled([
            setCache(AdminKeys.profile(team_id), updatedAdmin, AdminTTL.PROFILE),   // ← team_id
            deleteByPattern(AdminKeys.teamListPattern()),
        ]).then((results) =>
            results.forEach((r) => r.status === "rejected" && logger.warn("[updateTeamMember] cache sync failed:", r.reason?.message))
        );

        return sendResponse({ res, message: "Team member updated successfully", data: updatedAdmin });
    } catch (err) {
        logger.error("[updateTeamMember] Error:", err);
        return sendError(res, "Failed to update team member");
    }
};

// UPDATE ACCOUNT STATUS
export const updateAccountStatus = async (req, res) => {
    try {
        const { id: team_id } = req.params;
        const { account_status, reason } = req.body;
        const { auth_id: currentUserId, role: currentRole } = req.user;

        if (team_id === currentUserId.toString()) {
            return sendError(res, "You cannot change your own account status", STATUS_CODES.FORBIDDEN);
        }

        const updateData = {
            account_status,
            status_updated_at: new Date(),
            status_updated_by: currentUserId,
            block_reason: account_status === ACCOUNT_STATUS.BLOCKED ? (reason ?? null) : null,
        };

        const updatedAdmin = await Admin.findOneAndUpdate(
            { _id: team_id, role: { $ne: USER_ROLES.SUPER_ADMIN } },
            { $set: updateData },
            { new: true, runValidators: true, context: "query" }
        ).select(ExcludedFields).lean();

        if (!updatedAdmin) {
            const exists = await Admin.exists({ _id: team_id });
            if (!exists) return sendError(res, "Admin not found", STATUS_CODES.NOT_FOUND);
            return sendError(res, "Cannot modify super admin accounts", STATUS_CODES.FORBIDDEN);
        }

        const sideEffects = [
            setCache(AdminKeys.profile(team_id), updatedAdmin, AdminTTL.PROFILE),
            deleteByPattern(AdminKeys.teamListPattern()),
        ];
        if (account_status === ACCOUNT_STATUS.BLOCKED || account_status === ACCOUNT_STATUS.INACTIVE) {
            sideEffects.push(deleteByPattern(AuthKeys.refreshTokenPattern(NS.ADMIN, team_id)));
        }

        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[updateAccountStatus] side effect failed:", r.reason?.message));

        return sendResponse({ res, message: "Account status updated successfully", data: updatedAdmin });
    } catch (err) {
        logger.error("[updateAccountStatus] Error:", err);
        return sendError(res, "Failed to update account status");
    }
};


const ROLE_RANK = Object.freeze({
    [USER_ROLES.SUPER_ADMIN]: 3,
    [USER_ROLES.ADMIN]: 2,
    [USER_ROLES.OPERATION_MANAGER]: 1,
    [USER_ROLES.SUPPORT_MANAGER]: 1,
});

const MAX_BULK_SIZE = 50;

// BULK DEACTIVATE ADMINS
export const bulkDeactivateAdmins = async (req, res) => {
    try {
        const { ids, reason } = req.body;
        const { auth_id: currentUserId, role: currentRole } = req.user;

        if (!Array.isArray(ids) || ids.length === 0) {
            return sendError(res, "No admin IDs provided", STATUS_CODES.BAD_REQUEST);
        }
        if (ids.length > MAX_BULK_SIZE) {
            return sendError(res, `Cannot process more than ${MAX_BULK_SIZE} accounts at once`, STATUS_CODES.BAD_REQUEST);
        }

        const uniqueIds = [...new Set(ids.map(String))];
        if (uniqueIds.includes(currentUserId.toString())) {
            return sendError(res, "You cannot deactivate your own account", STATUS_CODES.FORBIDDEN);
        }

        const candidates = await Admin.find({
            _id: { $in: uniqueIds },
            account_status: ACCOUNT_STATUS.ACTIVE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
        }).select("_id role").lean();

        if (candidates.length === 0) {
            return sendError(res, "No active admins found with the provided IDs", STATUS_CODES.NOT_FOUND);
        }

        const currentRank = ROLE_RANK[currentRole] ?? 0;
        const allowed = [];
        const skipped = [];
        for (const admin of candidates) {
            if ((ROLE_RANK[admin.role] ?? 0) >= currentRank) {
                skipped.push({ id: admin._id.toString(), reason: "Insufficient permission to modify this role" });
            } else {
                allowed.push(admin._id);
            }
        }

        if (allowed.length === 0) {
            return sendError(res, "You do not have permission to deactivate any of the selected accounts", STATUS_CODES.FORBIDDEN);
        }

        const result = await Admin.updateMany(
            { _id: { $in: allowed }, account_status: ACCOUNT_STATUS.ACTIVE },
            {
                $set: {
                    account_status: ACCOUNT_STATUS.BLOCKED,
                    block_reason: reason ?? "Admin bulk deactivation",
                    status_updated_by: currentUserId,
                    status_updated_at: new Date(),
                },
            }
        );

        const sideEffects = [
            ...allowed.map((id) => setCache(AdminKeys.profile(id), null, 1).catch(() => deleteCache(AdminKeys.profile(id)))),
            deleteByPattern(AdminKeys.teamListPattern()),
            ...allowed.map((id) => deleteByPattern(AuthKeys.refreshTokenPattern(NS.ADMIN, id))),
        ];
        const results = await Promise.allSettled(sideEffects);
        results.forEach((r) => r.status === "rejected" && logger.warn("[bulkDeactivateAdmins] side effect failed:", r.reason?.message));

        return sendResponse({
            res,
            message: `${result.modifiedCount} admin(s) deactivated successfully`,
            data: {
                requested: uniqueIds.length,
                deactivated: result.modifiedCount,
                skipped,
            },
        });
    } catch (err) {
        logger.error("[bulkDeactivateAdmins] Error:", err);
        return sendError(res, "Failed to deactivate admins");
    }
};