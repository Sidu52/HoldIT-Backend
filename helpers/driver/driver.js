import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import Booking from "../../models/Booking.js";
import Store from "../../models/Store.js";
import { addJobToQueue } from "../../services/jobService.js";
import { ACCOUNT_STATUS, BOOKING_STATUS, JOB_QUEUES, VERIFICATION_STATUS } from "../../utils/constants.js";
import {
    DRIVER_ASSIGNMENT,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    DRIVER_SEARCH_STATUSES,
    BOOKING_JOB_NAMES,
} from "../../constants/user/booking.js";
import { BookingKeys, BookingTTL } from "../../constants/redis/booking.keys.js";
import { DriverKeys, DriverTTL } from "../../constants/redis/driver.keys.js";
import logger from "../../utils/logger.js";


// Driver assignment
// Always targets the REAL driver search/offer pipeline (DriverAssignWorker).
// type ("PICKUP" | "RETURN") only controls which location handleSearchDrivers uses.
export const scheduleDriverSearch = async (bookingId, type = "PICKUP") => {
    await Promise.all([
        redis.del(BookingKeys.candidates(bookingId)),
        redis.del(BookingKeys.tried(bookingId)),
        redis.del(BookingKeys.searchActive(bookingId)),
    ]);

    await addJobToQueue(
        JOB_QUEUES.DRIVER_ASSIGN,
        {
            name: DRIVER_JOB_NAMES.SEARCH_DRIVERS,
            data: { bookingId, type },
        },
        {
            jobId: `search-drivers-${bookingId}-${type}-retry-${Date.now()}`,
            delay: 2000,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        }
    );
};

// NEW — targets the RETURN validation gate (ReturnProcessWorker).
export const scheduleReturnProcessing = async (bookingId) => {
    await addJobToQueue(
        JOB_QUEUES.RETURN_PROCESS,
        {
            name: BOOKING_JOB_NAMES.PROCESS_RETURN,
            data: { bookingId },
        },
        {
            jobId: `process-return-${bookingId}-${Date.now()}`,
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        }
    );
};
 