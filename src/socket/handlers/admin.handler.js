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
                    status: { $in: [
                        BOOKING_STATUS.DRIVER_ASSIGNED, 
                        BOOKING_STATUS.PICKED_UP, 
                        BOOKING_STATUS.OUT_FOR_RETURN
                    ]}
                }),
                Booking.countDocuments({ status: BOOKING_STATUS.PENDING }),
                Booking.countDocuments({ 
                    status: BOOKING_STATUS.DELIVERED,
                    "pickup.assignment.completedAt": { $gte: today } 
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
    const { role } = socket.user;
    
    if (role !== USER_ROLES.SUPER_ADMIN && role !== USER_ROLES.OPERATION_MANAGER) return;

    adminConnectedCount++;
    startStatsInterval(io);

    socket.on("disconnect", () => {
        adminConnectedCount--;
        if (adminConnectedCount < 0) adminConnectedCount = 0;
        
        if (adminConnectedCount === 0) {
            stopStatsInterval();
        }
    });

    socket.on("error", (err) => {
        logger.error(`[Socket:Admin] Error from ${socket.user.id}: ${err.message}`);
    });
};
