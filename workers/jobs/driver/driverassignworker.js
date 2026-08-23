import { Worker } from "bullmq";
import { sharedWorkerConnection } from "../../../services/redisService.js";
import Driver from "../../../models/Driver.js";
import Booking from "../../../models/Booking.js";
import {
    DRIVER_ASSIGNMENT,
    DRIVER_JOB_NAMES,
    DRIVER_ASSIGN_QUEUE,
    AUTO_CANCEL_REASONS,
} from "../../../constants/user/booking.js";
import { DriverKeys } from "../../../constants/redis/driver.keys.js";
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
    failDriverSearch,
} from "../../../helpers/user/driverAssignHelper.js";
import { autoCancelBooking } from "../../../helpers/user/bookingHelper.js";
import { getIO } from "../../../src/socket/index.js";
import { emitBookingDriverSearching, emitBookingNoDriverAvailable } from "../../../src/socket/emitters/booking.emitter.js";
import { emitAdminAlertNoDriver, emitDriverNewOffer, emitDriverOfferRemoved } from "../../../src/socket/emitters/driver.emitter.js";
import logger from "../../../utils/logger.js";
import redis from "../../../services/redisService.js";
import { JOB_QUEUES } from "../../../utils/constants.js";

const safeGetIO = () => {
    try { return getIO(); } catch { return null; }
};

let worker;

const JOB_HANDLERS = {
    [DRIVER_JOB_NAMES.SEARCH_DRIVERS]: handleSearchDrivers,
    [DRIVER_JOB_NAMES.OFFER_NEXT_DRIVER]: handleOfferNextDriver,
    [DRIVER_JOB_NAMES.CHECK_OFFER_TIMEOUT]: handleOfferTimeout,
};

export const createDriverAssignWorker = () => {
    worker = new Worker(
        JOB_QUEUES.DRIVER_ASSIGN,
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
            logger.info(`[DriverAssign] ${result.driverName} assigned → ${result.bookingId}`);
        }
    });

    // FINAL-FAILURE SAFETY NET: if a job has exhausted all BullMQ retry attempts,
    // the booking could otherwise be left stuck in "searching" forever with no
    // active job and no user-facing signal. Force-cancel it instead.
    worker.on("failed", async (job, err) => {
        const bookingId = job?.data?.bookingId;
        const attemptsMade = job?.attemptsMade ?? 0;
        const maxAttempts = job?.opts?.attempts ?? 1;

        logger.error(
            `[DriverAssign] Job ${job?.name} failed for ${bookingId}: ${err.message} (attempt ${attemptsMade}/${maxAttempts})`
        );

        if (!bookingId || attemptsMade < maxAttempts) return; // more retries pending, don't clean up yet

        logger.error(`[DriverAssign] Job for ${bookingId} exhausted all retries — force-cancelling to avoid a stuck booking`);
        try {
            const type = job?.data?.type ?? "PICKUP";
            const failReason = AUTO_CANCEL_REASONS.SEARCH_JOB_FAILED ?? AUTO_CANCEL_REASONS.NO_DRIVER_FOUND;

            await failDriverSearch(bookingId, type, failReason);
            await clearSearchActive(bookingId);
        } catch (cleanupErr) {
            logger.error(`[DriverAssign] Cleanup after final failure also failed for ${bookingId}:`, cleanupErr.message);
        }
    });

    return worker;
};

// Job Handler
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

        let location = null;
        if (booking.criticalHandoverLocation?.lat && booking.criticalHandoverLocation?.lng) {
            location = booking.criticalHandoverLocation;
        } else if (type === "RETURN" && booking.storeId) {
            // For return deliveries, driver starts at the Store to pick up the stored luggage
            const Store = (await import("../../../models/Store.js")).default;
            const storeDoc = await Store.findById(booking.storeId).select("location").lean();
            if (storeDoc?.location?.coordinates?.length >= 2) {
                location = {
                    lng: storeDoc.location.coordinates[0],
                    lat: storeDoc.location.coordinates[1],
                };
            }
        }

        if (!location) {
            location = (type === "PICKUP" ? booking.pickupLocation : booking.deliveryLocation);
        }

        logger.debug(`[Search] Location for ${bookingId}:`, location);

        if (!location?.lat || !location?.lng) {
            logger.warn(`[Search] Invalid coordinates for ${bookingId}, cancelling. lat=${location?.lat} lng=${location?.lng}`);
            await failDriverSearch(bookingId, type, AUTO_CANCEL_REASONS.INVALID_LOCATION);
            await clearSearchActive(bookingId);
            return { success: false, reason: "invalid_location" };
        }

        const geoKeys = await getDriverGeoKeys(booking.serviceAreaId);

        const nearbyDrivers = await searchNearbyDrivers(
            geoKeys,
            location.lng, 
            location.lat,
            bookingId
        );
        logger.debug(`[Search] ${nearbyDrivers.length} nearby driver(s) found for ${bookingId}`);

        if (nearbyDrivers.length === 0) {
            logger.info(`[Search] No drivers found nearby for ${bookingId}, cancelling.`);
            await failDriverSearch(bookingId, type, AUTO_CANCEL_REASONS.NO_DRIVER_FOUND);
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_drivers_nearby" };
        }

        const driverIds = nearbyDrivers.map((d) => d.driverId);
        const verifiedDrivers = await verifyDriversInDB(driverIds);

        const verifiedSet = new Set(verifiedDrivers.map((d) => d._id.toString()));
        const staleIds = driverIds.filter((id) => !verifiedSet.has(id));

        if (staleIds.length > 0) {
            logger.debug(`[Search] Cleaning ${staleIds.length} stale driver Redis key(s)`);
            await cleanStaleDrivers(geoKeys, staleIds);
        }

        const validCandidates = nearbyDrivers
            .filter((d) => verifiedSet.has(d.driverId))
            .slice(0, DRIVER_ASSIGNMENT.MAX_OFFER_ATTEMPTS);

        if (validCandidates.length === 0) {
            logger.info(`[Search] No valid verified candidates for ${bookingId}, cancelling.`);
            await failDriverSearch(bookingId, type, AUTO_CANCEL_REASONS.NO_DRIVER_FOUND);
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_verified_drivers" };
        }

        await storeCandidates(bookingId, validCandidates.map((d) => d.driverId));
        await scheduleOfferNextDriver(bookingId, type, 1);
        logger.info(`[Search] Search complete for ${bookingId} — ${validCandidates.length} candidate(s) queued`);
        return { success: true, candidateCount: validCandidates.length, bookingId };
    } catch (err) {
        logger.error(`[Search] FATAL ERROR for ${bookingId}:`, err);
        await clearSearchActive(bookingId);
        throw err;
    }
}

async function handleOfferNextDriver(job) {
    const { bookingId, type, attemptNumber } = job.data;
    try {
        logger.info(`[Offer] ── Attempt #${attemptNumber} for ${bookingId} ──`);

        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);
        if (!awaiting) {
            await cleanupBookingRedisKeys(bookingId);
            return { success: false, reason };
        }

        const nextDriverId = await popNextCandidate(bookingId);
        logger.debug(`[Offer] Popped candidate ${nextDriverId} for ${bookingId}`);

        if (!nextDriverId) {
            logger.info(`[Offer] No candidates remaining for ${bookingId}, failing search.`);
            await failDriverSearch(bookingId, type, AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED);
            return { success: false, reason: "all_exhausted" };
        }

        // Quick Redis re-check driver could have gone offline/on-trip since being added as a candidate
        const meta = await redis.hgetall(DriverKeys.meta(nextDriverId));
        const isUnavailable = meta?.is_on_trip === "true" || meta?.is_online !== "true";

        if (isUnavailable) {
            logger.debug(`[Offer] Driver ${nextDriverId} busy/offline, skipping.`);
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        // Check if driver already has a pending offer from another booking
        const existingLock = await redis.get(DriverKeys.offered(nextDriverId));
        if (existingLock && existingLock !== bookingId) {
            logger.debug(`[Offer] Driver ${nextDriverId} already locked to booking ${existingLock}, skipping.`);
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        const { created } = await createDriverOffer(bookingId, nextDriverId, attemptNumber);
        if (!created) {
            await markDriverTried(bookingId, nextDriverId);
            return tryNextDriver(bookingId, type, attemptNumber);
        }

        const driver = await Driver.findById(nextDriverId).select("first_name last_name phone vehicle_type").lean();
        const driverName = getDriverName(driver);

        logger.info(`[Offer] Offer sent to ${driverName} (${nextDriverId}), timeout in ${DRIVER_ASSIGNMENT.OFFER_TIMEOUT_SECONDS}s`);

        const booking = await getBookingForDriverSearch(bookingId);

        const timeoutSeconds = DRIVER_ASSIGNMENT.OFFER_TIMEOUT_SECONDS || 60;
        const now = Date.now();
        const expiresAt = now + timeoutSeconds * 1000;

        const isReturn = type === "RETURN";
        const fee = isReturn
            ? (booking?.pricing?.distanceCharge ?? 0)
            : (booking?.pricing?.advanceBreakdown?.deliveryFee ?? 0);
        const fare = fee + (booking?.tipAmount ?? 0);

        const pickupLoc = isReturn
            ? (booking?.storageLocation || booking?.storeId?.location)
            : booking?.pickupLocation;
        const dropoffLoc = isReturn
            ? booking?.deliveryLocation
            : (booking?.storageLocation || booking?.storeId?.location);

        emitDriverNewOffer(safeGetIO(), nextDriverId, {
            bookingId,
            type,
            pickupLocation: pickupLoc,
            deliveryLocation: dropoffLoc,
            storeDetails: booking?.storeId,
            user: booking?.userId,
            fare,
            driverEarnings: fare,
            pricing: booking?.pricing,
            tipAmount: booking?.tipAmount || 0,
            luggage: booking?.luggage,
            attemptNumber,
            expiresInSeconds: timeoutSeconds,
            offeredAt: now,
            expiresAt: expiresAt,
        });

        // Send Push Notification to Driver for Instant Alert
        import("../../../services/NotificationService.js")
            .then(({ default: NotificationService }) => {
                NotificationService.sendPushToDriver(nextDriverId, {
                    title: "New Ride Offer 🛵",
                    body: type === "RETURN"
                        ? "New return delivery request available! Tap to review and accept."
                        : "New luggage pickup request available! Tap to review and accept.",
                    data: {
                        screen: "dashboard",
                        type: "RIDE_OFFER",
                        bookingId,
                    },
                });
            })
            .catch(() => {});

        await scheduleOfferTimeoutCheck(bookingId, type, nextDriverId, attemptNumber);

        return { success: true, offeredTo: nextDriverId, driverName, attemptNumber, bookingId };
    } catch (error) {
        // Just throw — BullMQ marks the job failed itself. Manually calling
        // job.moveToFailed() here as well races BullMQ's own state transition
        // and can throw "Job is not in the state..." errors.
        logger.error(`[Offer] Error on attempt #${attemptNumber} for ${bookingId}:`, error.message);
        throw error;
    }
}

async function tryNextDriver(bookingId, type, currentAttempt) {
    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        const failReason = AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED;
        await failDriverSearch(bookingId, type, failReason);

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

    logger.info(`[Offer] ${remaining} candidate(s) remaining for ${bookingId}. Trying next...`);
    await scheduleOfferNextDriver(bookingId, type, currentAttempt + 1);
    return { success: true, reason: "trying_next", remaining };
}

async function handleOfferTimeout(job) {
    const { bookingId, type, driverId, attemptNumber } = job.data;
    try {
        logger.info(`[Timeout] Checking offer: ${bookingId} → driver ${driverId}`);

        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);
        if (!awaiting) {
            logger.info(`[Timeout] Booking ${bookingId} already resolved: ${reason}`);
            await clearOffer(bookingId, driverId);
            return { success: true, reason: "already_resolved" };
        }

        const { exists, offer } = await getOfferStatus(bookingId);

        if (!exists) {
            logger.info(`[Timeout] Offer expired for ${bookingId}`);
            await handleDriverTimeout(bookingId, type, driverId, attemptNumber);
            return { success: true, reason: "offer_expired" };
        }

        if (offer.status === "accepted") {
            logger.info(`[Timeout] Driver accepted just before timeout for ${bookingId}`);
            return { success: true, reason: "accepted_in_time" };
        }

        if (offer.driverId !== driverId) {
            logger.info(`[Timeout] Different driver in offer. Expected ${driverId}, got ${offer.driverId}`);
            return { success: true, reason: "different_driver" };
        }

        logger.info(`[Timeout] Driver ${driverId} timed out for ${bookingId}`);
        await handleDriverTimeout(bookingId, type, driverId, attemptNumber);
        return { success: true, reason: "driver_timed_out" };
    } catch (error) {
        logger.error(`[Timeout] Error checking offer for ${bookingId}:`, error.message);
        throw error; // same fix — no manual moveToFailed
    }
}

async function handleDriverTimeout(bookingId, type, driverId, attemptNumber) {
    await clearOffer(bookingId, driverId);
    emitDriverOfferRemoved(safeGetIO(), driverId, { bookingId, reason: "timeout" });
    await markDriverTried(bookingId, driverId);

    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        const failReason = AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED;
        logger.info(`[Timeout] All candidates exhausted for ${bookingId}. Handling failure (Type: ${type}).`);
        await failDriverSearch(bookingId, type, failReason);
        return;
    }

    logger.info(`[Timeout] ${remaining} candidate(s) remaining. Offering next for ${bookingId}`);
    await scheduleOfferNextDriver(bookingId, type, attemptNumber + 1, DRIVER_ASSIGNMENT.SEARCH_RETRY_DELAY_MS);
}

export const getWorker = () => worker;