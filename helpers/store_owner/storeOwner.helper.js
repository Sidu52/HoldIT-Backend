import { ACCOUNT_STATUS } from "../../utils/constants.js";
import { STATUS_CODES } from "../../utils/constants.js";

export const verifyStoreOwner = (owner) => {
    if (!owner) {
        return { valid: false, message: "Account not found.", code: STATUS_CODES.NOT_FOUND };
    }

    if (!owner.is_active) {
        return { valid: false, message: "This account has been deactivated.", code: STATUS_CODES.FORBIDDEN };
    }

    if (owner.status === ACCOUNT_STATUS.BLOCKED) {
        return { valid: false, message: "This account has been suspended.", code: STATUS_CODES.FORBIDDEN };
    }

    return { valid: true };
};