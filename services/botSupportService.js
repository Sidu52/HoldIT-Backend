import { CHAT_TYPE, TICKET_STATUS, SENDER_MODEL } from "../utils/constants.js";
import logger from "../utils/logger.js";

/**
 * Knowledge Base & Intent Rules per Role
 */
const FAQ_KNOWLEDGE_BASE = {
    User: [
        {
            keywords: ["track", "status", "where", "luggage", "location"],
            answer: "You can view your luggage status in real-time under the 'Active Bookings' tab in your app. Once a driver is assigned, live GPS tracking will automatically activate.",
        },
        {
            keywords: ["cancel", "refund", "money"],
            answer: "You can cancel your booking anytime before the driver picks up your luggage for a full refund. Refunds are credited back to your original payment method within 3-5 business days.",
        },
        {
            keywords: ["payment", "price", "charge", "razorpay", "fee"],
            answer: "Holdit charges a base storage fee + pickup/delivery charges. Advance payment is required upon scheduling, and any final delivery adjustments are collected prior to return delivery dispatch.",
        },
        {
            keywords: ["store", "safety", "secure", "hours"],
            answer: "All Holdit partner stores are verified, insured, and monitored. Luggage is tagged and stored in dedicated secure storage bays.",
        },
    ],
    Driver: [
        {
            keywords: ["offer", "accept", "ride", "assign"],
            answer: "When a new ride offer is dispatched, you have a limited time window to accept it in your Driver App. Ensure your status is set to 'ONLINE'.",
        },
        {
            keywords: ["otp", "pickup", "delivery", "verify"],
            answer: "Always verify the 4-digit OTP with the customer at pickup and with the store staff/customer at delivery before completing the job in your app.",
        },
        {
            keywords: ["payout", "earning", "salary", "payment"],
            answer: "Driver earnings are calculated per completed trip including tips and distance base pay. Weekly payouts are automatically transferred to your registered bank account.",
        },
        {
            keywords: ["cancel", "customer cancel", "rejected"],
            answer: "If a customer cancels after you arrived at pickup, a cancellation fee credit will be added to your driver wallet.",
        },
    ],
    Store: [
        {
            keywords: ["incoming", "parcel", "receive", "stored"],
            answer: "When a pickup driver arrives with luggage, verify the parcel details, scan/confirm in your Store App, assign a shelf tag, and tap 'Confirm Stored'.",
        },
        {
            keywords: ["return", "otp", "driver pickup"],
            answer: "Before handing over stored luggage to a return driver, verify the 4-digit Return OTP displayed on the driver's app.",
        },
        {
            keywords: ["capacity", "full", "space"],
            answer: "You can update your store's active capacity or toggle 'OFFLINE' in your Store App if your storage facility reaches maximum limit.",
        },
    ],
    StoreOwner: [
        {
            keywords: ["store", "add", "new location"],
            answer: "To register a new store branch under your owner account, go to 'My Stores' > 'Add Store'. Our operations team will verify the location within 24 hours.",
        },
        {
            keywords: ["revenue", "commission", "earnings", "payout"],
            answer: "Store owner payouts are calculated monthly based on total luggage storage hours hosted across all your store branches.",
        },
    ],
};

const ESCALATION_KEYWORDS = [
    "agent",
    "human",
    "talk to agent",
    "support agent",
    "live chat",
    "escalate",
    "help me",
    "issue",
    "urgent",
    "complain",
    "stolen",
    "lost",
    "damage",
];

export const botSupportService = {
    /**
     * Checks if a user message should trigger escalation to a live support agent.
     */
    shouldEscalate(messageText) {
        if (!messageText) return false;
        const text = messageText.toLowerCase().trim();
        return ESCALATION_KEYWORDS.some((kw) => text.includes(kw));
    },

    /**
     * Generates automated Bot response based on role knowledge base.
     */
    generateBotResponse(requesterModel, messageText) {
        const text = (messageText || "").toLowerCase().trim();
        const roleFaqs = FAQ_KNOWLEDGE_BASE[requesterModel] || FAQ_KNOWLEDGE_BASE.User;

        for (const faq of roleFaqs) {
            if (faq.keywords.some((kw) => text.includes(kw))) {
                return {
                    message: `${faq.answer}\n\nDid this answer your question? Reply 'AGENT' if you would like to connect with a live support representative.`,
                    matched: true,
                };
            }
        }

        // Fallback response if no specific keyword matched
        return {
            message: `Hello! I'm the Holdit Virtual Assistant 🤖. I can help with general inquiries regarding bookings, payments, tracking, and store policies.\n\nIf you need personalized assistance from our team, please reply with 'AGENT' or tap 'Escalate to Live Chat' to connect with a live support representative.`,
            matched: false,
        };
    },

    /**
     * Gets default FAQ suggestions for a given role.
     */
    getFaqSuggestions(requesterModel) {
        const faqs = FAQ_KNOWLEDGE_BASE[requesterModel] || FAQ_KNOWLEDGE_BASE.User;
        return faqs.map((f) => ({
            keyword: f.keywords[0],
            topic: f.answer.substring(0, 80) + "...",
            fullAnswer: f.answer,
        }));
    },
};
