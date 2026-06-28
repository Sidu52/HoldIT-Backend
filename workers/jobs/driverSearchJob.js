import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../../services/redisService.js";
import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import Booking from "../../models/Booking.js";
import {
    DRIVER_ASSIGNMENT,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    AUTO_CANCEL_REASONS,
    REDIS_KEYS,
} from "../../constants/user/booking.js";
import {
    storeCandidates,
    popNextCandidate,
    getRemainingCandidateCount,
    markDriverTried,
    createDriverOffer,
    getOfferStatus,
    clearOffer,
    cleanupBookingRedisKeys,
    markSearchActive,
    clearSearchActive,
    getDriverGeoKeys,
    searchNearbyDrivers,
    verifyDriversInDB,
    cleanStaleDrivers,
    isBookingAwaitingDriver,
    getBookingForDriverSearch,
    updateBookingStatus,
    scheduleOfferNextDriver,
    scheduleOfferTimeoutCheck,
    getDriverName,
    handleReturnDriverNotFound,
} from "../../helpers/user/driverAssignHelper.js";
import { autoCancelBooking } from "../../helpers/user/bookingHelper.js";
import { getIO } from "../../src/socket/index.js";
import { emitBookingDriverSearching, emitBookingNoDriverAvailable } from "../../src/socket/emitters/booking.emitter.js";
import { emitAdminAlertNoDriver, emitDriverNewOffer, emitDriverOfferRemoved } from "../../src/socket/emitters/driver.emitter.js";
import logger from "../../utils/logger.js";

/** Safely get the Socket.IO instance; returns null if not initialized. */
const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

let worker;

// JOB_HANDLERS must be declared BEFORE createDriverAssignWorker so the
// closure can resolve the map. Function declarations (handleSearchDrivers etc.)
// are hoisted, so forward-referencing them here is safe.
const JOB_HANDLERS = {
    [DRIVER_JOB_NAMES.SEARCH_DRIVERS]: handleSearchDrivers,
    [DRIVER_JOB_NAMES.OFFER_NEXT_DRIVER]: handleOfferNextDriver,
    [DRIVER_JOB_NAMES.CHECK_OFFER_TIMEOUT]: handleOfferTimeout,
};

export const createDriverAssignWorker = () => {
    worker = new Worker(
        DRIVER_ASSIGN_QUEUE,
        async (job) => {
            const handler = JOB_HANDLERS[job.name];

            if (!handler) {
                logger.warn(`[DriverAssign] Unknown job: ${job.name}`);
                return { success: false, reason: "unknown_job" };
            }

            return handler(job);
        },
        {
            connection: sharedWorkerConnection,
            concurrency: 10,
            settings: { lockDuration: 60000 },
        }
    );

    worker.on("error", (err) => {
        logger.error(`[DriverAssign] Worker error: ${err.message}`);
    });

    worker.on("completed", (job, result) => {
        if (result?.driverAssigned) {
            logger.info(
                `[DriverAssign] ${result.driverName} assigned → ${result.bookingId}`
            );
        }
    });

    worker.on("failed", async (job, err) => {
        logger.error(
            `[DriverAssign] Job ${job.name} failed for ${job.data?.bookingId}: ${err.message} (attempt ${job.attemptsMade})`
        );
    });

    return worker;
};

// --- Job Handler Functions ---
async function handleSearchDrivers(job) {
    const { bookingId, type = "PICKUP" } = job.data;
    const searchLocked = await markSearchActive(bookingId);

    if (!searchLocked) {
        return { success: false, reason: "search_already_active" };
    }

    try {
        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

        if (!awaiting) {
            await clearSearchActive(bookingId);
            return { success: false, reason };
        }

        const booking = await getBookingForDriverSearch(bookingId);
        if (!booking) {
            await clearSearchActive(bookingId);
            return { success: false, reason: "booking_not_found" };
        }

        if (booking.userId) {
            emitBookingDriverSearching(safeGetIO(), bookingId, booking.userId);
        }

        const location = type === "PICKUP"
            ? booking.pickupLocation
            : booking.deliveryLocation;

        if (!location?.lat || !location?.lng) {
            const failReason = AUTO_CANCEL_REASONS.INVALID_LOCATION;
            if (type === "RETURN") {
                await handleReturnDriverNotFound(bookingId, failReason);
            } else {
                await autoCancelBooking(bookingId, failReason);
            }
            await clearSearchActive(bookingId);
            return { success: false, reason: "invalid_location" };
        }

        const geoKeys = await getDriverGeoKeys(booking.serviceAreaId);

        const nearbyDrivers = await searchNearbyDrivers(
            geoKeys,
            location.lng,   // ← lng first
            location.lat,   // ← lat second
            bookingId
        );

        if (nearbyDrivers.length === 0) {
            const failReason = AUTO_CANCEL_REASONS.NO_DRIVER_FOUND;
            if (type === "RETURN") {
                await handleReturnDriverNotFound(bookingId, failReason);
            } else {
                await autoCancelBooking(bookingId, failReason);
            }
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_drivers_nearby" };
        }

        const driverIds = nearbyDrivers.map((d) => d.driverId);
        const verifiedDrivers = await verifyDriversInDB(driverIds);

        const verifiedSet = new Set(verifiedDrivers.map((d) => d._id.toString()));
        const staleIds = driverIds.filter((id) => !verifiedSet.has(id));

        if (staleIds.length > 0) {
            await cleanStaleDrivers(geoKeys, staleIds);
        }

        const validCandidates = nearbyDrivers
            .filter((d) => verifiedSet.has(d.driverId))
            .slice(0, DRIVER_ASSIGNMENT.MAX_OFFER_ATTEMPTS);

        if (validCandidates.length === 0) {
            const failReason = AUTO_CANCEL_REASONS.NO_DRIVER_FOUND;
            if (type === "RETURN") {
                await handleReturnDriverNotFound(bookingId, failReason);
            } else {
                await autoCancelBooking(bookingId, failReason);
            }
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_verified_drivers" };
        }

        await storeCandidates(bookingId, validCandidates.map((d) => d.driverId));
        await scheduleOfferNextDriver(bookingId, type, 1);
        logger.info(`[Search] ✅ Search complete — ${validCandidates.length} candidate(s) queued`);
        return { success: true, candidateCount: validCandidates.length, bookingId };
    } catch (err) {
        logger.error(`[Search] FATAL ERROR for ${bookingId}:`, err);
        await clearSearchActive(bookingId);
        throw err;
    }
}

async function handleOfferNextDriver(job) {
    try {
        const { bookingId, type, attemptNumber } = job.data;
        logger.info(
            `\n[Offer] ── Attempt #${attemptNumber} for ${bookingId} ──`
        );

        // Pre-check booking
        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

        if (!awaiting) {
            await cleanupBookingRedisKeys(bookingId);
            return { success: false, reason };
        }

        // Pop next candidate
        const nextDriverId = await popNextCandidate(bookingId);

        if (!nextDriverId) {
            // ALL CANDIDATES EXHAUSTED  AUTO CANCEL
            await autoCancelBooking(bookingId, AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED);
            return { success: false, reason: "all_exhausted" };
        }

        // Quick Redis re-check
        const metaKey = REDIS_KEYS.DRIVER_META(nextDriverId);
        const meta = await redis.hgetall(metaKey);

        const isUnavailable =
            meta?.is_on_trip === "true" ||
            meta?.is_online !== "true";

        if (isUnavailable) {
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        // Check if driver has pending offer from another booking
        const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(nextDriverId);
        const existingLock = await redis.get(driverLockKey);

        if (existingLock && existingLock !== bookingId) {
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        // Create offer in Redis
        const { created, reason: offerReason } = await createDriverOffer(
            bookingId,
            nextDriverId,
            attemptNumber
        );

        if (!created) {
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        // Get driver details
        const driver = await Driver.findById(nextDriverId)
            .select("first_name last_name phone vehicle_type")
            .lean();

        const driverName = getDriverName(driver);

        logger.info(
            `[Offer] Offer sent to ${driverName} (${nextDriverId})`
        );
        logger.info(
            `[Offer] Timeout in ${DRIVER_ASSIGNMENT.OFFER_TIMEOUT_SECONDS}s`
        );

        const booking = await getBookingForDriverSearch(bookingId);

        emitDriverNewOffer(safeGetIO(), nextDriverId, {
            bookingId,
            type,
            pickupLocation: booking?.pickupLocation,
            deliveryLocation: booking?.deliveryLocation,
            attemptNumber,
            expiresInSeconds: DRIVER_ASSIGNMENT.OFFER_TIMEOUT_SECONDS,
        });

        await scheduleOfferTimeoutCheck(
            bookingId,
            type,
            nextDriverId,
            attemptNumber
        );

        return {
            success: true,
            offeredTo: nextDriverId,
            driverName,
            attemptNumber,
            bookingId,
        };
    } catch (error) {
        if (job.moveToFailed) await job.moveToFailed(error, job.token);
        throw error;
    }
}

async function tryNextDriver(bookingId, type, currentAttempt) {
    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        const failReason = AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED;
        if (type === "RETURN") {
            await handleReturnDriverNotFound(bookingId, failReason);
        } else {
            await autoCancelBooking(bookingId, failReason);
        }

        try {
            const bookingForSocket = await Booking.findById(bookingId).select("userId pickupLocation").lean();
            if (bookingForSocket) {
                emitBookingNoDriverAvailable(safeGetIO(), bookingId, bookingForSocket.userId);
                emitAdminAlertNoDriver(safeGetIO(), bookingId, bookingForSocket.userId, bookingForSocket.pickupLocation, currentAttempt, "All drivers exhausted");
            }
        } catch (e) {
            logger.error("[SocketEmitter] Failed to fetch booking details for failure notification:", e.message);
        }

        return { success: false, reason: "all_exhausted" };
    }

    logger.info(`[Offer] ${remaining} candidates remaining. Trying next...`);

    // Schedule immediately
    await scheduleOfferNextDriver(bookingId, type, currentAttempt + 1);

    return { success: true, reason: "trying_next", remaining };
}

async function handleOfferTimeout(job) {
    try {
        const { bookingId, type, driverId, attemptNumber } = job.data;

        logger.info(
            `\n[Timeout] Checking offer: ${bookingId} → driver ${driverId}`
        );

        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

        if (!awaiting) {
            // Driver accepted, or booking was cancelled by user
            logger.info(`[Timeout] Booking ${bookingId} already resolved: ${reason}`);
            await clearOffer(bookingId, driverId);
            return { success: true, reason: "already_resolved" };
        }

        //  Check offer status in Redis
        const { exists, offer } = await getOfferStatus(bookingId);

        if (!exists) {
            logger.info(`[Timeout] Offer expired for ${bookingId}`);
            await handleDriverTimeout(bookingId, type, driverId, attemptNumber);
            return { success: true, reason: "offer_expired" };
        }

        // Driver accepted between offer creation and timeout check
        if (offer.status === "accepted") {
            logger.info(`[Timeout] Driver accepted just before timeout for ${bookingId}`);
            return { success: true, reason: "accepted_in_time" };
        }

        // Different driver in offer (shouldn't happen, but safety check)
        if (offer.driverId !== driverId) {
            logger.info(`[Timeout] Different driver in offer. Expected ${driverId}, got ${offer.driverId}`);
            return { success: true, reason: "different_driver" };
        }

        // Offer still pending → driver timed out
        logger.info(`[Timeout] Driver ${driverId} timed out for ${bookingId}`);
        await handleDriverTimeout(bookingId, type, driverId, attemptNumber);

        return { success: true, reason: "driver_timed_out" };
    } catch (error) {
        if (job.moveToFailed) await job.moveToFailed(error, job.token);
        throw error;
    }
}

async function handleDriverTimeout(bookingId, type, driverId, attemptNumber) {
    await clearOffer(bookingId, driverId);
    emitDriverOfferRemoved(safeGetIO(), driverId, {
        bookingId,
        reason: "timeout",
    });
    await markDriverTried(bookingId, driverId);

    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        // ALL DRIVERS EXHAUSTED
        const failReason = AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED;
        logger.info(
            `[Timeout] All candidates exhausted for ${bookingId}. Handling failure (Type: ${type}).`
        );
        if (type === "RETURN") {
            await handleReturnDriverNotFound(bookingId, failReason);
        } else {
            await autoCancelBooking(bookingId, failReason);
        }
        return;
    }
    logger.info(
        `[Timeout] ${remaining} candidates remaining. Offering next for ${bookingId}`
    );

    await scheduleOfferNextDriver(
        bookingId,
        type,
        attemptNumber + 1,
        DRIVER_ASSIGNMENT.SEARCH_RETRY_DELAY_MS
    );
}

export const getWorker = () => worker;