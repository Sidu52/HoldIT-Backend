import crypto from "crypto";
import bcrypt from "bcryptjs";
import TeamJoinRequest, { REQUEST_STATUS } from "../../models/TeamJoinRequest.js";
import Admin from "../../models/Admin.js";
import sendEmail from "../../mailer/emailService.js";
import logger from "../../utils/logger.js";
import { STATUS_CODES, VERIFICATION_STATUS, ACCOUNT_STATUS, USER_ROLES, BCRYPT_SALT_ROUNDS } from "../../utils/constants.js";
import { sendError, sendResponse } from "../../utils/apiResponse.js";
import { buildPagination } from "../../utils/helper.js";
import { setCache, isKeyExist, deleteByPattern } from "../../constants/redis/redisOperation.js";
import { AdminKeys, AdminTTL } from "../../constants/redis/admin.keys.js";

const generateRandomPassword = (length = 12) => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

// PUBLIC: SUBMIT JOIN TEAM REQUEST (Rate-limited, Unauthenticated)
export const submitJoinTeamRequest = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, desired_role, experience_notes } = req.body;

    if (!first_name || !last_name || !email || !phone) {
      return sendError(res, "First name, last name, email, and phone are required.", STATUS_CODES.BAD_REQUEST);
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already has a pending join request
    const existingRequest = await TeamJoinRequest.findOne({
      email: cleanEmail,
      status: REQUEST_STATUS.PENDING,
    }).lean();

    if (existingRequest) {
      return sendError(res, "A team join request for this email is already pending admin review.", STATUS_CODES.CONFLICT);
    }

    // Check if an active verified admin already exists
    const existingAdmin = await Admin.findOne({ email: cleanEmail })
      .select("verification_status")
      .lean();

    if (existingAdmin?.verification_status === VERIFICATION_STATUS.VERIFIED) {
      return sendError(res, "An active team account already exists with this email address.", STATUS_CODES.CONFLICT);
    }

    const normalizedRole = String(desired_role || "customer_support").toLowerCase();

    const newRequest = await TeamJoinRequest.create({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      desired_role: normalizedRole,
      experience_notes: experience_notes ? experience_notes.trim() : "",
      status: REQUEST_STATUS.PENDING,
    });

    return sendResponse({
      res,
      statusCode: STATUS_CODES.CREATED,
      message: "Your team join request has been submitted successfully for admin review.",
      data: {
        id: newRequest._id,
        email: newRequest.email,
        status: newRequest.status,
      },
    });
  } catch (err) {
    logger.error("[submitJoinTeamRequest] Error:", err);
    return sendError(res, "Failed to submit team join request.");
  }
};

// ADMIN: GET JOIN REQUESTS LIST
export const getJoinRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ first_name: regex }, { last_name: regex }, { email: regex }, { phone: regex }];
    }

    const skip = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      TeamJoinRequest.find(filter)
        .populate("reviewedBy", "first_name last_name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TeamJoinRequest.countDocuments(filter),
    ]);

    return sendResponse({
      res,
      message: "Team join requests fetched successfully",
      data: {
        requests,
        pagination: buildPagination(pageNum, limitNum, total),
      },
    });
  } catch (err) {
    logger.error("[getJoinRequests] Error:", err);
    return sendError(res, "Failed to fetch join requests");
  }
};

// ADMIN: APPROVE JOIN REQUEST & SEND SECURE PASSWORD EMAIL
export const approveJoinRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { auth_id: inviterId } = req.user;

    const joinRequest = await TeamJoinRequest.findById(id);
    if (!joinRequest) {
      return sendError(res, "Join request not found", STATUS_CODES.NOT_FOUND);
    }

    if (joinRequest.status !== REQUEST_STATUS.PENDING) {
      return sendError(res, `Join request is already ${joinRequest.status.toLowerCase()}`, STATUS_CODES.BAD_REQUEST);
    }

    // 1. Generate random secure password & hash it
    const tempPassword = generateRandomPassword(12);
    const password_hash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);
    

    // 2. Update Join Request status to APPROVED
    joinRequest.status = REQUEST_STATUS.APPROVED;
    joinRequest.reviewedBy = inviterId;
    joinRequest.reviewedAt = new Date();
    await joinRequest.save();

    // 3. Create or activate Admin account with password
    const { email, desired_role: role, first_name, last_name, phone } = joinRequest;

    let adminRecord = await Admin.findOne({ email });
    if (!adminRecord) {
      adminRecord = await Admin.create({
        first_name: first_name || "",
        last_name: last_name || "",
        email,
        phone: phone || undefined,
        role: role || USER_ROLES.CUSTOMER_SUPPORT,
        invited_by: inviterId,
        password_hash,
        verification_status: VERIFICATION_STATUS.VERIFIED,
        account_status: ACCOUNT_STATUS.ACTIVE,
      });
    } else {
      adminRecord.first_name = first_name || adminRecord.first_name;
      adminRecord.last_name = last_name || adminRecord.last_name;
      if (phone) adminRecord.phone = phone;
      adminRecord.role = role || adminRecord.role;
      adminRecord.password_hash = password_hash;
      adminRecord.verification_status = VERIFICATION_STATUS.VERIFIED;
      adminRecord.account_status = ACCOUNT_STATUS.ACTIVE;
      await adminRecord.save();
    }

    // Invalidate Redis team list cache so new member appears in Team Members table immediately
    await deleteByPattern(AdminKeys.teamListPattern());

    const loginLink = `${process.env.CLIENT_URL}/login`;

    // 4. Send email with login credentials and generated password
    sendEmail({
      to: email,
      subject: "Team Join Request Approved - Welcome to Holdit!",
      template: "join-approval-email.html",
      data: {
        first_name: first_name || "Team Member",
        email,
        password: tempPassword,
        login_link: loginLink,
      },
      rawFields: ["login_link", "password"],
    }).catch((err) => logger.error("Failed to send approval email with password:", err.message));

    logger.info(`[approveJoinRequest] Join request approved for ${email}. Generated password: ${tempPassword}`);

    return sendResponse({
      res,
      message: "Team join request approved and login credentials emailed successfully.",
      data: {
        requestId: id,
        email,
        temporaryPassword: tempPassword,
        status: joinRequest.status,
      },
    });
  } catch (err) {
    logger.error("[approveJoinRequest] Error:", err);
    return sendError(res, "Failed to approve join request");
  }
};

// ADMIN: REJECT JOIN REQUEST
export const rejectJoinRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const { auth_id: inviterId } = req.user;

    const joinRequest = await TeamJoinRequest.findById(id);
    if (!joinRequest) {
      return sendError(res, "Join request not found", STATUS_CODES.NOT_FOUND);
    }

    if (joinRequest.status !== REQUEST_STATUS.PENDING) {
      return sendError(res, `Join request is already ${joinRequest.status.toLowerCase()}`, STATUS_CODES.BAD_REQUEST);
    }

    joinRequest.status = REQUEST_STATUS.REJECTED;
    joinRequest.reviewedBy = inviterId;
    joinRequest.reviewedAt = new Date();
    joinRequest.rejectionReason = rejectionReason ? rejectionReason.trim() : "Request rejected by admin review.";
    await joinRequest.save();

    return sendResponse({
      res,
      message: "Team join request rejected successfully.",
      data: {
        requestId: id,
        email: joinRequest.email,
        status: joinRequest.status,
      },
    });
  } catch (err) {
    logger.error("[rejectJoinRequest] Error:", err);
    return sendError(res, "Failed to reject join request");
  }
};
