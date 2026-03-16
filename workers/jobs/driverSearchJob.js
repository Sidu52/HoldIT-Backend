import { Worker } from "bullmq";
import { createBullConnection } from "../../services/redisService.js";
import redis from "../../services/redisService.js";
import Driver from "../../models/Driver.js";
import { BOOKING_STATUS } from "../../utils/constants.js";
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
    autoCancelBooking,
    scheduleOfferNextDriver,
    scheduleOfferTimeoutCheck,
    getDriverName,
} from "../../helpers/user/driverAssignHelper.js";

let worker;

export const createDriverAssignWorker = () => {
    worker = new Worker(
        DRIVER_ASSIGN_QUEUE,
        async (job) => {
            const handler = JOB_HANDLERS[job.name];

            if (!handler) {
                console.warn(`[DriverAssign] Unknown job: ${job.name}`);
                return { success: false, reason: "unknown_job" };
            }

            return handler(job);
        },
        {
            connection: createBullConnection("Driver Assign Worker"),
            concurrency: 10,
            settings: { lockDuration: 60000 },
        }
    );

    worker.on("error", (err) => {
        console.error("[DriverAssign] Worker error:", err.message);
    });

    worker.on("completed", (job, result) => {
        if (result?.driverAssigned) {
            console.log(
                `[DriverAssign] ${result.driverName} assigned → ${result.bookingId}`
            );
        }
    });

    worker.on("failed", async (job, err) => {
        console.error(
            `[DriverAssign] Job ${job.name} failed for ${job.data?.bookingId}:`,
            err.message,
            `(attempt ${job.attemptsMade})`
        );
    });

    return worker;
};

const JOB_HANDLERS = {
    [DRIVER_JOB_NAMES.SEARCH_DRIVERS]: handleSearchDrivers,
    [DRIVER_JOB_NAMES.OFFER_NEXT_DRIVER]: handleOfferNextDriver,
    [DRIVER_JOB_NAMES.CHECK_OFFER_TIMEOUT]: handleOfferTimeout,
};

// Find all candidates, store in Redis, start offering
async function handleSearchDrivers(job) {
    const { bookingId, type = "PICKUP" } = job.data;

    console.log(`\n[Search] ══════════════════════════════════════`);
    console.log(`[Search] Starting ${type} driver search for ${bookingId}`);

    // Prevent duplicate searches
    const searchLocked = await markSearchActive(bookingId);
    if (!searchLocked) {
        console.log(`[Search] Search already active for ${bookingId}. Skipping.`);
        return { success: false, reason: "search_already_active" };
    }

    try {
        // Pre-check BookingDetail
        const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

        if (!awaiting) {
            console.log(`[Search] Booking ${bookingId} doesn't need driver: ${reason}`);
            await clearSearchActive(bookingId);
            return { success: false, reason };
        }

        // Get booking details
        const booking = await getBookingForDriverSearch(bookingId);

        if (!booking) {
            await clearSearchActive(bookingId);
            return { success: false, reason: "booking_not_found" };
        }

        if (booking.status === BOOKING_STATUS.CANCELLED) {
            await clearSearchActive(bookingId);
            return { success: false, reason: "booking_cancelled" };
        }

        if (type === "PICKUP" && !booking.storeId) {
            console.log(`[Search] No store assigned for ${bookingId}`);
            await autoCancelBooking(bookingId, AUTO_CANCEL_REASONS.NO_STORE_ASSIGNED);
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_store" };
        }

        // Get location
        const location = type === "PICKUP"
            ? booking.pickupLocation
            : booking.deliveryLocation;

        if (!location?.lat || !location?.lng) {
            console.log(`[Search] Invalid location for ${bookingId}`);
            await autoCancelBooking(bookingId, AUTO_CANCEL_REASONS.INVALID_LOCATION);
            await clearSearchActive(bookingId);
            return { success: false, reason: "invalid_location" };
        }

        // Update status to DRIVER_SEARCH
        await updateBookingStatus(
            bookingId,
            BOOKING_STATUS.DRIVER_SEARCH,
            `Searching for ${type.toLowerCase()} driver`
        );

        // Search Redis geo keys
        const geoKeys = await getDriverGeoKeys(booking.serviceAreaId);
        console.log(`[Search] Scanning ${geoKeys.length} geo keys`);

        const nearbyDrivers = await searchNearbyDrivers(
            geoKeys,
            location.lng,
            location.lat,
            bookingId
        );

        console.log(`[Search] Redis found ${nearbyDrivers.length} candidates`);

        if (nearbyDrivers.length === 0) {
            console.log(`[Search] No drivers nearby for ${bookingId}`);
            await autoCancelBooking(bookingId, AUTO_CANCEL_REASONS.NO_DRIVER_FOUND);
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_drivers_nearby" };
        }

        // Verify in MongoDB
        const driverIds = nearbyDrivers.map((d) => d.driverId);
        const verifiedDrivers = await verifyDriversInDB(driverIds);
        const verifiedSet = new Set(verifiedDrivers.map((d) => d._id.toString()));

        // Identify and clean stale Redis entries
        const staleIds = driverIds.filter((id) => !verifiedSet.has(id));
        if (staleIds.length > 0) {
            await cleanStaleDrivers(geoKeys, staleIds);
            console.log(`[Search] Cleaned ${staleIds.length} stale drivers`);
        }

        // Build verified candidate list
        const verifiedMap = new Map(
            verifiedDrivers.map((d) => [d._id.toString(), d])
        );

        const validCandidates = nearbyDrivers
            .filter((d) => verifiedSet.has(d.driverId))
            .slice(0, DRIVER_ASSIGNMENT.MAX_OFFER_ATTEMPTS)
            .map((d) => ({
                ...d,
                name: getDriverName(verifiedMap.get(d.driverId)),
            }));

        console.log(`[Search] ${validCandidates.length} verified candidates:`);
        validCandidates.forEach((d, i) => {
            console.log(`  ${i + 1}. ${d.name} — ${d.distanceKm}km`);
        });

        if (validCandidates.length === 0) {
            console.log(`[Search] No verified drivers for ${bookingId}`);
            await autoCancelBooking(bookingId, AUTO_CANCEL_REASONS.NO_DRIVER_FOUND);
            await clearSearchActive(bookingId);
            return { success: false, reason: "no_verified_drivers" };
        }

        // Store candidates in Redis
        const storedCount = await storeCandidates(
            bookingId,
            validCandidates.map((d) => d.driverId)
        );

        console.log(`[Search] Stored ${storedCount} candidates in Redis`);

        // Start offering to first driver
        await scheduleOfferNextDriver(bookingId, type, 1);

        console.log(`[Search] ══════════════════════════════════════\n`);

        return {
            success: true,
            candidateCount: validCandidates.length,
            bookingId,
        };
    } catch (err) {
        console.error(`[Search] Error for ${bookingId}:`, err);
        await clearSearchActive(bookingId);
        throw err;
    }
}

async function handleOfferNextDriver(job) {
    const { bookingId, type, attemptNumber } = job.data;

    console.log(
        `\n[Offer] ── Attempt #${attemptNumber} for ${bookingId} ──`
    );

    // ---- Step 1: Pre-check booking ----
    const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

    if (!awaiting) {
        console.log(`[Offer] Booking ${bookingId} resolved: ${reason}`);
        await cleanupBookingRedisKeys(bookingId);
        return { success: false, reason };
    }

    // Pop next candidate
    const nextDriverId = await popNextCandidate(bookingId);

    if (!nextDriverId) {
        // ALL CANDIDATES EXHAUSTED  AUTO CANCEL
        console.log(`[Offer] All candidates exhausted for ${bookingId}`);
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
        console.log(`[Offer] Driver ${nextDriverId} now unavailable. Skipping.`);
        await markDriverTried(bookingId, nextDriverId);
        return tryNextDriver(bookingId, type, attemptNumber);
    }

    // Check if driver has pending offer from another booking
    const driverLockKey = REDIS_KEYS.DRIVER_OFFERED(nextDriverId);
    const existingLock = await redis.get(driverLockKey);

    if (existingLock && existingLock !== bookingId) {
        console.log(
            `[Offer] Driver ${nextDriverId} has pending offer for ${existingLock}. Skipping.`
        );
        await markDriverTried(bookingId, nextDriverId);
        return tryNextDriver(bookingId, type, attemptNumber);
    }

    // Create offer in Redis
    const { created, reason: offerReason } = await createDriverOffer(
        bookingId,
        nextDriverId
    );

    if (!created) {
        console.log(`[Offer] Cannot offer to ${nextDriverId}: ${offerReason}`);
        await markDriverTried(bookingId, nextDriverId);
        return tryNextDriver(bookingId, type, attemptNumber);
    }

    // Get driver details
    const driver = await Driver.findById(nextDriverId)
        .select("first_name last_name phone vehicle_type")
        .lean();

    const driverName = getDriverName(driver);

    console.log(
        `[Offer] Offer sent to ${driverName} (${nextDriverId})`
    );
    console.log(
        `[Offer] Timeout in ${DRIVER_ASSIGNMENT.OFFER_TIMEOUT_SECONDS}s`
    );


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
}

async function tryNextDriver(bookingId, type, currentAttempt) {
    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        console.log(`[Offer] No more candidates for ${bookingId}`);
        await autoCancelBooking(
            bookingId,
            AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED
        );
        return { success: false, reason: "all_exhausted" };
    }

    console.log(`[Offer] ${remaining} candidates remaining. Trying next...`);

    // Schedule immediately
    await scheduleOfferNextDriver(bookingId, type, currentAttempt + 1);

    return { success: true, reason: "trying_next", remaining };
}

async function handleOfferTimeout(job) {
    const { bookingId, type, driverId, attemptNumber } = job.data;

    console.log(
        `\n[Timeout] Checking offer: ${bookingId} → driver ${driverId}`
    );

    const { awaiting, reason } = await isBookingAwaitingDriver(bookingId);

    if (!awaiting) {
        // Driver accepted, or booking was cancelled by user
        console.log(`[Timeout] Booking ${bookingId} already resolved: ${reason}`);
        await clearOffer(bookingId, driverId);
        return { success: true, reason: "already_resolved" };
    }

    //  Check offer status in Redis
    const { exists, offer } = await getOfferStatus(bookingId);

    if (!exists) {
        console.log(`[Timeout] Offer expired for ${bookingId}`);
        await handleDriverTimeout(bookingId, type, driverId, attemptNumber);
        return { success: true, reason: "offer_expired" };
    }

    // Driver accepted between offer creation and timeout check
    if (offer.status === "accepted") {
        console.log(`[Timeout] Driver accepted just before timeout for ${bookingId}`);
        return { success: true, reason: "accepted_in_time" };
    }

    // Different driver in offer (shouldn't happen, but safety check)
    if (offer.driverId !== driverId) {
        console.log(`[Timeout] Different driver in offer. Expected ${driverId}, got ${offer.driverId}`);
        return { success: true, reason: "different_driver" };
    }

    // Offer still pending → driver timed out
    console.log(`[Timeout] Driver ${driverId} timed out for ${bookingId}`);
    await handleDriverTimeout(bookingId, type, driverId, attemptNumber);

    return { success: true, reason: "driver_timed_out" };
}

async function handleDriverTimeout(bookingId, type, driverId, attemptNumber) {
    await clearOffer(bookingId, driverId);
    await markDriverTried(bookingId, driverId);

    const remaining = await getRemainingCandidateCount(bookingId);

    if (remaining === 0) {
        // ALL DRIVERS EXHAUSTED → AUTO CANCEL
        console.log(
            `[Timeout] All candidates exhausted for ${bookingId}. Auto-cancelling.`
        );
        await autoCancelBooking(
            bookingId,
            AUTO_CANCEL_REASONS.ALL_DRIVERS_EXHAUSTED
        );
        return;
    }
    console.log(
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