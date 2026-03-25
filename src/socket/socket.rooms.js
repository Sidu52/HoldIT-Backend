/**
 * Centralized room name generators.
 * Using pure functions ensures typos don't break room broadcasting
 * and makes it easy to change naming conventions later.
 */
export const rooms = {
    booking: (bookingId) => `booking:${bookingId}`,
    driver: (driverId) => `driver:${driverId}`,
    user: (userId) => `user:${userId}`,
    store: (storeId) => `store:${storeId}`,
    adminDashboard: () => `admin:dashboard`,
    driverLocation: (bookingId) => `location:${bookingId}`,
};
