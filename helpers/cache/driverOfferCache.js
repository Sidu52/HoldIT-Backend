import redis from "../../services/redisService.js";
import { BookingKeys, BookingTTL } from "../../constants/redis/booking.keys.js";
import { DriverKeys, DriverTTL } from "../../constants/redis/driver.keys.js";

// CANDIDATE PIPELINE
export const storeCandidates = async (bookingId, driverIds) => {
    if (!driverIds.length) return 0;

    const key = BookingKeys.candidates(bookingId);
    const pipeline = redis.pipeline();
    pipeline.del(key);
    pipeline.rpush(key, ...driverIds);
    pipeline.expire(key, BookingTTL.CANDIDATES);
    await pipeline.exec();

    return driverIds.length;
};

export const popNextCandidate = async (bookingId) => {
    return redis.lpop(BookingKeys.candidates(bookingId));
};

export const getRemainingCandidateCount = async (bookingId) => {
    return redis.llen(BookingKeys.candidates(bookingId));
};

// TRIED-DRIVERS SET
export const markDriverTried = async (bookingId, driverId) => {
    const key = BookingKeys.tried(bookingId);
    const pipeline = redis.pipeline();
    pipeline.sadd(key, driverId.toString());
    pipeline.expire(key, BookingTTL.TRIED_DRIVERS);
    await pipeline.exec();
};

export const wasDriverTried = async (bookingId, driverId) => {
    const result = await redis.sismember(
        BookingKeys.tried(bookingId),
        driverId.toString()
    );
    return result === 1;
};

// OFFER STATE
export const createDriverOffer = async (bookingId, driverId, attemptNumber = 1) => {
    const offerKey = BookingKeys.offer(bookingId);
    const driverLockKey = DriverKeys.offered(driverId);

    const existingLock = await redis.get(driverLockKey);
    if (existingLock) {
        return { created: false, reason: "DRIVER_HAS_PENDING_OFFER" };
    }

    const currentOffer = await redis.hgetall(offerKey);
    if (currentOffer?.driverId && currentOffer?.status === "pending") {
        return { created: false, reason: "BOOKING_HAS_ACTIVE_OFFER" };
    }

    const pipeline = redis.pipeline();
    pipeline.hset(offerKey, {
        driverId: driverId.toString(),
        offeredAt: Date.now().toString(),
        status: "pending",
        attemptNumber: attemptNumber.toString(),
    });
    pipeline.expire(offerKey, BookingTTL.OFFER);
    pipeline.set(driverLockKey, bookingId.toString(), "EX", BookingTTL.OFFER);
    await pipeline.exec();

    return { created: true, reason: null };
};

export const getOfferStatus = async (bookingId) => {
    const offer = await redis.hgetall(BookingKeys.offer(bookingId));
    if (!offer || !offer.driverId) return { exists: false, offer: null };
    return { exists: true, offer };
};

export const markOfferAccepted = async (bookingId) => {
    await redis.hset(BookingKeys.offer(bookingId), "status", "accepted");
};

export const clearOffer = async (bookingId, driverId) => {
    await Promise.all([
        redis.del(BookingKeys.offer(bookingId)),
        redis.del(DriverKeys.offered(driverId)),
    ]);
};
