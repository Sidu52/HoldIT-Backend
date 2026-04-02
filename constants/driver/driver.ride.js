import { BOOKING_STATUS } from "../../utils/constants.js";


export const DRIVER_RIDE_CACHE = {
    ASSIGNED_KEY: (driverId) => `driver:assigned_rides:${driverId}`,
    ACTIVE_KEY: (driverId) => `driver:active_ride:${driverId}`,
    RIDE_DETAIL_KEY: (driverId, bookingId) => `driver:ride:${driverId}:${bookingId}`,
    HISTORY_KEY: (driverId, page, limit) => `driver:ride_history:${driverId}:${page}:${limit}`,

    ASSIGNED_TTL: 30,
    ACTIVE_TTL: 60,
    DETAIL_TTL: 120,
    HISTORY_TTL: 180,
};

export const DRIVER_VISIBLE_STATUSES = [
    BOOKING_STATUS.DRIVER_ASSIGNED,
    BOOKING_STATUS.DRIVER_ARRIVED,
    BOOKING_STATUS.PICKED_UP,
    BOOKING_STATUS.AT_STORE,
    BOOKING_STATUS.RETURN_DRIVER_ASSIGNED,
    BOOKING_STATUS.OUT_FOR_RETURN,
    BOOKING_STATUS.ARRIVED_FOR_DELIVERY,
];


export const PICKUP_STARTABLE_STATUSES = [
    BOOKING_STATUS.DRIVER_ASSIGNED,
];

export const DRIVER_HISTORY_STATUSES = [
    BOOKING_STATUS.DELIVERED,
    BOOKING_STATUS.CANCELLED,
];

export const DRIVER_RIDE_SELECT = {
    LIST: "bookingCode status pickupLocation deliveryLocation luggage pickup delivery pricing payment.status userId createdAt",
    DETAIL: "-__v -timeline.updatedBy -timeline.updatedByModel",
    MINIMAL: "bookingCode status pickupLocation luggage pickup.scheduledAt",
};

export const DRIVER_RIDE_MESSAGES = {
    ASSIGNED_RIDES_FETCHED: "Assigned rides fetched successfully.",
    RIDE_ACCEPTED: "Ride accepted successfully.",
    RIDE_DETAIL_FETCHED: "Ride details fetched successfully.",
    PICKUP_STARTED: "Pickup started successfully.",
    PICKUP_COMPLETED: "Pickup completed. Luggage collected.",
    ACTIVE_RIDE_FETCHED: "Active ride fetched successfully.",
    HISTORY_FETCHED: "Ride history fetched successfully.",
    RIDE_REJECTED: "Ride offer rejected.",

    NO_ASSIGNED_RIDES: "No assigned rides found.",
    RIDE_NOT_FOUND: "Ride not found.",
    OFFER_EXPIRED: "This offer has expired or does not exist.",
    OFFER_NOT_YOURS: "This offer was not sent to you.",
    ALREADY_ACCEPTED: "This ride has already been accepted.",
    RIDE_NOT_AVAILABLE: "This ride is no longer available.",
    CANNOT_START_PICKUP: (status) => `Cannot start pickup in "${status}" status.`,
    CANNOT_COMPLETE_PICKUP: (status) => `Cannot complete pickup in "${status}" status.`,
    NOT_YOUR_RIDE: "This ride is not assigned to you.",
    NO_ACTIVE_RIDE: "No active ride found.",
    ACCEPT_FAILED: "Failed to accept ride.",
    REJECT_FAILED: "Failed to reject ride.",
    FETCH_FAILED: "Failed to fetch rides.",
    DETAIL_FAILED: "Failed to fetch ride details.",
    START_PICKUP_FAILED: "Failed to start pickup.",
    COMPLETE_PICKUP_FAILED: "Failed to complete pickup.",
    HISTORY_FAILED: "Failed to fetch ride history.",
};