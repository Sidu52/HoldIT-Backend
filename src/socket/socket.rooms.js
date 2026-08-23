// Rooms for broadcasting events
export const rooms = {
    booking: (bookingId) => `booking:${bookingId}`,
    driver: (driverId) => `driver:${driverId}`,
    user: (userId) => `user:${userId}`,
    store: (storeId) => `store:${storeId}`,
    adminDashboard: () => `admin:dashboard`,
    adminSupport: () => `admin:support`,
    supportTicket: (ticketId) => `support:ticket:${ticketId}`,
    driverLocation: (bookingId) => `location:${bookingId}`,
};
