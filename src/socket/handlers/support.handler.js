import { SOCKET_EVENTS } from "../socket.events.js";
import { rooms } from "../socket.rooms.js";
import logger from "../../../utils/logger.js";

export const registerSupportHandlers = (io, socket) => {
    // Join a live chat / ticket room
    socket.on(SOCKET_EVENTS.SUPPORT_JOIN_ROOM, ({ ticketId }) => {
        if (!ticketId) return;
        const roomName = rooms.supportTicket(ticketId);
        socket.join(roomName);
        logger.info(`[Socket:Support] Socket ${socket.id} joined room ${roomName}`);
    });

    // Leave a live chat / ticket room
    socket.on(SOCKET_EVENTS.SUPPORT_LEAVE_ROOM, ({ ticketId }) => {
        if (!ticketId) return;
        const roomName = rooms.supportTicket(ticketId);
        socket.leave(roomName);
        logger.info(`[Socket:Support] Socket ${socket.id} left room ${roomName}`);
    });

    // Real-time typing indicator
    socket.on(SOCKET_EVENTS.SUPPORT_TYPING, ({ ticketId, isTyping }) => {
        if (!ticketId) return;
        socket.to(rooms.supportTicket(ticketId)).emit(SOCKET_EVENTS.SUPPORT_TYPING, {
            ticketId,
            userId: socket.user?.id,
            role: socket.user?.role,
            isTyping: !!isTyping,
        });
    });
};
