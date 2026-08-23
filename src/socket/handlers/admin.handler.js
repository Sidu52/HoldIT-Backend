import logger from "../../../utils/logger.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";
import { USER_ROLES, BOOKING_STATUS } from "../../../utils/constants.js";
import Driver from "../../../models/Driver.js";
import Booking from "../../../models/Booking.js";

let adminConnectedCount = 0;
let statsInterval = null;

const startStatsInterval = (io) => {
    if (statsInterval) return;
    logger.info("[Socket:Admin] Starting stats update interval");

    statsInterval = setInterval(async () => {
        try {
            if (adminConnectedCount <= 0) {
                stopStatsInterval();
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const [onlineDrivers, activeBookings, pendingBookings, completedToday] = await Promise.all([
                Driver.countDocuments({ is_online: true }),
                Booking.countDocuments({
                    status: {
                        $in: [
                            BOOKING_STATUS.DRIVER_ASSIGNED,
                            BOOKING_STATUS.DRIVER_ARRIVED,
                            BOOKING_STATUS.PICKED_UP,
                            BOOKING_STATUS.AT_STORE,
                            BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
                            BOOKING_STATUS.OUT_FOR_DELIVERY,
                            BOOKING_STATUS.ARRIVED_FOR_DELIVERY
                        ]
                    }
                }),
                Booking.countDocuments({ status: BOOKING_STATUS.STORE_ASSIGNED }),
                Booking.countDocuments({
                    status: BOOKING_STATUS.DELIVERED,
                    "delivery.assignment.completedAt": { $gte: today }
                })
            ]);

            io.to(rooms.adminDashboard()).emit(SOCKET_EVENTS.ADMIN_STATS_UPDATE, {
                activeBookings,
                onlineDrivers,
                pendingBookings,
                completedToday,
            });
        } catch (error) {
            logger.error(`[Socket:Admin] Stats update error: ${error.message}`);
        }
    }, 60000); // 60s
};

const stopStatsInterval = () => {
    if (statsInterval) {
        logger.info("[Socket:Admin] Stopping stats update interval (0 admins online)");
        clearInterval(statsInterval);
        statsInterval = null;
    }
};

export const registerAdminHandlers = (io, socket) => {
    const { role, id: adminId } = socket.user;

    if (role !== USER_ROLES.ADMIN && role !== USER_ROLES.SUPER_ADMIN && role !== USER_ROLES.OPERATION_MANAGER) return;

    adminConnectedCount++;
    startStatsInterval(io);

    // Join admin dashboard room for global updates
    socket.join(rooms.adminDashboard());
    logger.info(`[Socket:Admin] Admin ${adminId} connected to dashboard. Total: ${adminConnectedCount}`);

    // Handle specific driver location subscription
    socket.on(SOCKET_EVENTS.ADMIN_SUBSCRIBE_DRIVER_LOCATION, async (payload) => {
        try {
            const { driverId } = payload;
            if (!driverId) {
                socket.emit("error", { message: "driverId required" });
                return;
            }

            // Validate driver exists and admin has permission
            const driver = await Driver.findById(driverId).select("_id is_online").lean();
            if (!driver) {
                socket.emit("error", { message: "Driver not found" });
                return;
            }

            // Subscribe to driver-specific room
            socket.join(rooms.driverLocation(driverId));
            logger.info(`[Socket:Admin] Admin ${adminId} subscribed to driver ${driverId} location`);

            socket.emit(SOCKET_EVENTS.ADMIN_SUBSCRIBE_DRIVER_LIST, {
                driverId,
                success: true,
                message: `Subscribed to driver ${driverId} location updates`,
            });
        } catch (error) {
            logger.error(`[Socket:Admin] Subscription failed: ${error.message}`);
            socket.emit("error", { message: "Subscription failed" });
        }
    });

    // Handle driver location unsubscription
    socket.on(SOCKET_EVENTS.ADMIN_UNSUBSCRIBE_DRIVER_LOCATION, (payload) => {
        try {
            const { driverId } = payload;
            if (!driverId) return;

            socket.leave(rooms.driverLocation(driverId));
            logger.info(`[Socket:Admin] Admin ${adminId} unsubscribed from driver ${driverId}`);

            socket.emit(SOCKET_EVENTS.ADMIN_UNSUBSCRIBE_DRIVER_LIST, {
                driverId,
                success: true,
            });
        } catch (error) {
            logger.error(`[Socket:Admin] Unsubscription failed: ${error.message}`);
        }
    });

    // Handle bulk driver location subscription (for driver list page)
    socket.on(SOCKET_EVENTS.ADMIN_SUBSCRIBE_DRIVER_LIST, async (payload) => {
        try {
            const { driverIds } = payload;
            if (!Array.isArray(driverIds) || driverIds.length === 0) {
                socket.emit("error", { message: "driverIds array required" });
                return;
            }

            // Subscribe to each driver's location room
            driverIds.forEach((driverId) => {
                socket.join(rooms.driverLocation(driverId));
            });

            logger.info(`[Socket:Admin] Admin ${adminId} subscribed to ${driverIds.length} drivers`);
            socket.emit(SOCKET_EVENTS.ADMIN_SUBSCRIBE_DRIVER_LIST, {
                count: driverIds.length,
                success: true,
            });
        } catch (error) {
            logger.error(`[Socket:Admin] Bulk subscription failed: ${error.message}`);
            socket.emit("error", { message: "Bulk subscription failed" });
        }
    });

    socket.on("disconnect", () => {
        adminConnectedCount--;
        if (adminConnectedCount < 0) adminConnectedCount = 0;

        logger.info(`[Socket:Admin] Admin ${adminId} disconnected. Total: ${adminConnectedCount}`);

        if (adminConnectedCount === 0) {
            stopStatsInterval();
        }
    });

    socket.on("error", (err) => {
        logger.error(`[Socket:Admin] Error from admin ${adminId}: ${err.message}`);
    });
};
