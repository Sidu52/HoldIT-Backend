import { STATUS_CODES, ACCOUNT_STATUS, VERIFICATION_STATUS } from "../../utils/constants.js";

// Status check
export const verifyStoreOwner = (owner) => {
    if (owner.account_status === ACCOUNT_STATUS.BLOCKED) {
        return { valid: false, message: "Your account has been suspended.", code: STATUS_CODES.FORBIDDEN };
    }
    if (owner.account_status === ACCOUNT_STATUS.PENDING) {
        return { valid: false, message: "Your account is pending approval.", code: STATUS_CODES.FORBIDDEN };
    }
    if (owner.verification_status !== VERIFICATION_STATUS.VERIFIED) {
        return { valid: false, message: "Please verify your account first.", code: STATUS_CODES.FORBIDDEN };
    }
    return { valid: true };
};