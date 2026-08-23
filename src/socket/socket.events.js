export const SOCKET_EVENTS = {
    // Shared
    CONNECT_ERROR: "connect_error",
    DISCONNECT: "disconnect",
    ERROR: "error",

    // Booking Lifecycle (Server -> Client)
    BOOKING_CREATED: "booking:created",
    BOOKING_STORE_ASSIGNED: "booking:store_assigned",
    BOOKING_DRIVER_SEARCHING: "booking:driver_searching",
    BOOKING_DRIVER_ASSIGNED: "booking:driver_assigned",
    BOOKING_DRIVER_ARRIVED: "booking:driver_arrived",
    BOOKING_PICKED_UP: "booking:picked_up",
    BOOKING_ARRIVED_AT_STORE: "booking:arrived_at_store",
    BOOKING_STORED: "booking:stored",
    BOOKING_RETURN_REQUESTED: "booking:return_requested",
    BOOKING_RETURN_DRIVER_ASSIGNED: "booking:return_driver_assigned",
    BOOKING_OUT_FOR_RETURN: "booking:out_for_return",
    BOOKING_ARRIVED_FOR_DELIVERY: "booking:arrived_for_delivery",
    BOOKING_DELIVERED: "booking:delivered",
    BOOKING_CANCELLED: "booking:cancelled",
    BOOKING_NO_DRIVER: "booking:no_driver_available",

    // Driver Events (Client <-> Server)
    DRIVER_LOCATION_UPDATE: "driver:location:update",
    DRIVER_LOCATION_UPDATED: "driver:location:updated",
    DRIVER_LOCATION_GET: "driver:location:get",
    DRIVER_LOCATION_STALE: "driver:location:stale",
    
    DRIVER_GO_ONLINE: "driver:go_online",
    DRIVER_GO_OFFLINE: "driver:go_offline",
    DRIVER_STATUS_CHANGED: "driver:status:changed",
    DRIVER_NEW_OFFER: "driver:new_offer",
    DRIVER_OFFER_REMOVED: "driver:offer_removed",

    DRIVER_BOOKING_ACCEPT: "driver:booking:accept",
    DRIVER_BOOKING_ACCEPTED: "driver:booking:accepted",
    DRIVER_BOOKING_REJECT: "driver:booking:reject",
    DRIVER_BOOKING_REJECTED: "driver:booking:rejected",

    // User Events (Client -> Server)
    USER_SUBSCRIBE_BOOKING: "user:booking:subscribe",
    USER_SUBSCRIBED_BOOKING: "user:booking:subscribed",
    USER_UNSUBSCRIBE_BOOKING: "user:booking:unsubscribe",

    // Store Events
    STORE_INCOMING_BOOKING: "store:booking:incoming",
    STORE_ACKNOWLEDGE_BOOKING: "store:booking:acknowledge",
    STORE_CAPACITY_WARNING: "store:capacity:warning",

    // Admin Events
    ADMIN_DRIVER_STATUS: "admin:driver:status_changed",
    ADMIN_BOOKING_STATUS: "admin:booking:status_changed",
    ADMIN_STATS_UPDATE: "admin:stats:update",
    ADMIN_ALERT_NO_DRIVER: "admin:alert:no_driver",

    ADMIN_SUBSCRIBE_DRIVER_LOCATION: "admin:subscribe_driver_location",
    ADMIN_UNSUBSCRIBE_DRIVER_LOCATION: "admin:unsubscribe_driver_location",
    ADMIN_SUBSCRIBE_DRIVER_LIST: "admin:subscribe_driver_list",
    ADMIN_UNSUBSCRIBE_DRIVER_LIST: "admin:unsubscribe_driver_list",

    // Support & Live Chat Events
    SUPPORT_TICKET_CREATED: "support:ticket_created",
    SUPPORT_NEW_MESSAGE: "support:new_message",
    SUPPORT_TYPING: "support:typing",
    SUPPORT_STATUS_UPDATED: "support:status_updated",
    SUPPORT_TICKET_ESCALATED: "support:ticket_escalated",
    SUPPORT_TICKET_ASSIGNED: "support:ticket_assigned",
    SUPPORT_JOIN_ROOM: "support:join_room",
    SUPPORT_LEAVE_ROOM: "support:leave_room",
};
