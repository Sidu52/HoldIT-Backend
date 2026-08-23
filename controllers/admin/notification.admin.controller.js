import asyncHandler from "../../utils/asyncHandler.js";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES, ACCOUNT_STATUS } from "../../utils/constants.js";
import User from "../../models/User.js";
import Driver from "../../models/Driver.js";
import NotificationLog from "../../models/NotificationLog.js";
import NotificationService from "../../services/NotificationService.js";
import logger from "../../utils/logger.js";

/**
 * Send Manual Push Notification to Target Audience
 */
export const sendManualPushNotification = asyncHandler(async (req, res) => {
    const {
        title,
        body,
        targetAudience,
        targetRecipientId,
        screen = "home",
        customData = {},
        priority = "high",
        sound = "default",
    } = req.body;

    const adminUser = req.user;
    let tokens = [];
    let recipientName = null;

    // 1. Resolve Target Tokens based on Audience Selection
    switch (targetAudience) {
        case "ALL_USERS": {
            const users = await User.find({
                push_token: { $exists: true, $ne: null, $ne: "" },
            }).select("push_token").lean();
            tokens = users.map((u) => u.push_token);
            break;
        }

        case "ALL_ACTIVE_USERS": {
            const users = await User.find({
                account_status: ACCOUNT_STATUS.ACTIVE,
                push_token: { $exists: true, $ne: null, $ne: "" },
            }).select("push_token").lean();
            tokens = users.map((u) => u.push_token);
            break;
        }

        case "ALL_DRIVERS": {
            const drivers = await Driver.find({
                push_token: { $exists: true, $ne: null, $ne: "" },
            }).select("push_token").lean();
            tokens = drivers.map((d) => d.push_token);
            break;
        }

        case "ALL_ONLINE_DRIVERS": {
            const drivers = await Driver.find({
                is_online: true,
                push_token: { $exists: true, $ne: null, $ne: "" },
            }).select("push_token").lean();
            tokens = drivers.map((d) => d.push_token);
            break;
        }

        case "BROADCAST_ALL": {
            const [users, drivers] = await Promise.all([
                User.find({ push_token: { $exists: true, $ne: null, $ne: "" } }).select("push_token").lean(),
                Driver.find({ push_token: { $exists: true, $ne: null, $ne: "" } }).select("push_token").lean(),
            ]);
            tokens = [...users.map((u) => u.push_token), ...drivers.map((d) => d.push_token)];
            break;
        }

        case "SPECIFIC_USER": {
            if (!targetRecipientId) {
                return sendError(res, "targetRecipientId is required for specific user", STATUS_CODES.BAD_REQUEST);
            }
            const user = await User.findById(targetRecipientId).select("first_name last_name push_token").lean();
            if (!user) {
                return sendError(res, "User not found", STATUS_CODES.NOT_FOUND);
            }
            if (!user.push_token) {
                return sendError(res, "This user has not registered any push token device yet", STATUS_CODES.BAD_REQUEST);
            }
            recipientName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User";
            tokens = [user.push_token];
            break;
        }

        case "SPECIFIC_DRIVER": {
            if (!targetRecipientId) {
                return sendError(res, "targetRecipientId is required for specific driver", STATUS_CODES.BAD_REQUEST);
            }
            const driver = await Driver.findById(targetRecipientId).select("first_name last_name push_token").lean();
            if (!driver) {
                return sendError(res, "Driver not found", STATUS_CODES.NOT_FOUND);
            }
            if (!driver.push_token) {
                return sendError(res, "This driver has not registered any push token device yet", STATUS_CODES.BAD_REQUEST);
            }
            recipientName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || "Driver";
            tokens = [driver.push_token];
            break;
        }

        default:
            return sendError(res, "Invalid targetAudience provided", STATUS_CODES.BAD_REQUEST);
    }

    if (tokens.length === 0) {
        return sendError(
            res,
            "No reachable devices found with registered push tokens for the selected audience.",
            STATUS_CODES.BAD_REQUEST
        );
    }

    // 2. Dispatch Push Notification via NotificationService
    const payloadData = {
        ...customData,
        screen,
        source: "ADMIN_BROADCAST",
        timestamp: Date.now(),
    };

    const pushResult = await NotificationService.sendExpoPushNotification({
        to: tokens,
        title,
        body,
        data: payloadData,
        priority,
        sound,
    });

    const isSuccess = Boolean(pushResult);
    const successCount = isSuccess ? tokens.length : 0;
    const failureCount = isSuccess ? 0 : tokens.length;

    // 3. Save Audit Log
    const log = await NotificationLog.create({
        title,
        body,
        targetAudience,
        targetRecipientId: targetRecipientId || null,
        targetRecipientName: recipientName,
        screen,
        customData: payloadData,
        recipientCount: tokens.length,
        successCount,
        failureCount,
        sentBy: adminUser.auth_id,
        sentByName: adminUser.name || adminUser.email || "Admin",
        sentByRole: adminUser.role,
        status: isSuccess ? "COMPLETED" : "FAILED",
    });

    logger.info(
        `[AdminPush] Manual push "${title}" sent by ${adminUser.role} (${adminUser.auth_id}) to ${tokens.length} recipient(s)`
    );

    return sendResponse({
        res,
        message: `Push notification sent successfully to ${tokens.length} device(s)`,
        data: {
            logId: log._id,
            recipientCount: tokens.length,
            targetAudience,
            status: log.status,
        },
    });
});

/**
 * Get Audience Reach Count Statistics
 */
export const getAudienceSummary = asyncHandler(async (req, res) => {
    const [
        totalUsers,
        usersWithToken,
        activeUsersWithToken,
        totalDrivers,
        driversWithToken,
        onlineDriversWithToken,
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ push_token: { $exists: true, $ne: null, $ne: "" } }),
        User.countDocuments({
            account_status: ACCOUNT_STATUS.ACTIVE,
            push_token: { $exists: true, $ne: null, $ne: "" },
        }),
        Driver.countDocuments(),
        Driver.countDocuments({ push_token: { $exists: true, $ne: null, $ne: "" } }),
        Driver.countDocuments({
            is_online: true,
            push_token: { $exists: true, $ne: null, $ne: "" },
        }),
    ]);

    return sendResponse({
        res,
        message: "Audience reach summary fetched successfully",
        data: {
            users: {
                total: totalUsers,
                withToken: usersWithToken,
                activeWithToken: activeUsersWithToken,
            },
            drivers: {
                total: totalDrivers,
                withToken: driversWithToken,
                onlineWithToken: onlineDriversWithToken,
            },
            totalReachableDevices: usersWithToken + driversWithToken,
        },
    });
});

/**
 * Get Push Notification Audit History
 */
export const getNotificationHistory = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const search = req.query.search?.trim();

    const query = {};
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: "i" } },
            { body: { $regex: search, $options: "i" } },
            { sentByName: { $regex: search, $options: "i" } },
            { targetRecipientName: { $regex: search, $options: "i" } },
        ];
    }

    const [logs, total] = await Promise.all([
        NotificationLog.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        NotificationLog.countDocuments(query),
    ]);

    return sendResponse({
        res,
        message: "Notification logs fetched successfully",
        data: {
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
});

/**
 * Search users or drivers to select for specific push notifications
 */
export const searchPushRecipients = asyncHandler(async (req, res) => {
    const { query = "", type = "USER" } = req.query;
    const searchStr = query.trim();

    if (type === "DRIVER") {
        const filter = {};
        if (searchStr) {
            filter.$or = [
                { first_name: { $regex: searchStr, $options: "i" } },
                { last_name: { $regex: searchStr, $options: "i" } },
                { phone: { $regex: searchStr, $options: "i" } },
            ];
        }
        const drivers = await Driver.find(filter)
            .select("first_name last_name phone push_token is_online vehicle_type")
            .limit(20)
            .lean();

        const formatted = drivers.map((d) => ({
            _id: d._id,
            name: `${d.first_name || ""} ${d.last_name || ""}`.trim() || "Driver",
            phone: d.phone,
            hasPushToken: Boolean(d.push_token),
            isOnline: d.is_online,
            type: "DRIVER",
        }));

        return sendResponse({
            res,
            message: "Driver recipients fetched",
            data: formatted,
        });
    }

    // Default USER
    const filter = {};
    if (searchStr) {
        filter.$or = [
            { first_name: { $regex: searchStr, $options: "i" } },
            { last_name: { $regex: searchStr, $options: "i" } },
            { phone: { $regex: searchStr, $options: "i" } },
            { email: { $regex: searchStr, $options: "i" } },
        ];
    }
    const users = await User.find(filter)
        .select("first_name last_name phone email push_token account_status")
        .limit(20)
        .lean();

    const formatted = users.map((u) => ({
        _id: u._id,
        name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || "User",
        phone: u.phone,
        email: u.email,
        hasPushToken: Boolean(u.push_token),
        accountStatus: u.account_status,
        type: "USER",
    }));

    return sendResponse({
        res,
        message: "User recipients fetched",
        data: formatted,
    });
});
