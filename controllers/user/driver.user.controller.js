import mongoose from "mongoose";
import { sendResponse, sendError } from "../../utils/apiResponse.js";
import { STATUS_CODES } from "../../utils/constants.js";
import {
    DRIVER_CACHE,
    DRIVER_SELECT,
    DRIVER_MESSAGES,
} from "../../constants/user/driver.js";
import {
    getCachedData,
    setCacheData,
    findVisibleDriverById,
    fetchDriverReviews,
    fetchDriverRatingSummary,
    transformDriverProfile,
    buildPagination,
} from "../../helpers/user/driverHelper.js";

export const getDriverDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const cacheKey = DRIVER_CACHE.DETAIL_KEY(id);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_MESSAGES.DETAIL_SUCCESS,
                data: cached,
            });
        }

        const driver = await findVisibleDriverById(id, DRIVER_SELECT.DETAIL);

        if (!driver) {
            return sendError(
                res,
                DRIVER_MESSAGES.DRIVER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const profile = transformDriverProfile(driver);
        const ratingSummary = await fetchDriverRatingSummary(
            new mongoose.Types.ObjectId(id)
        );

        const responseData = {
            driver: profile,
            ratings: ratingSummary,
        };
        await setCacheData(cacheKey, responseData, DRIVER_CACHE.DETAIL_TTL);

        return sendResponse({
            res,
            message: DRIVER_MESSAGES.DETAIL_SUCCESS,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Driver Details Error:", err);
        return sendError(res, DRIVER_MESSAGES.DETAIL_FAILED);
    }
};

export const getDriverReviews = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.validated?.query || req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // ---- Cache check ----
        const cacheKey = DRIVER_CACHE.REVIEWS_KEY(id, pageNum, limitNum);
        const cached = await getCachedData(cacheKey);

        if (cached) {
            return sendResponse({
                res,
                message: DRIVER_MESSAGES.REVIEWS_SUCCESS,
                data: cached,
            });
        }
        const driver = await findVisibleDriverById(id, "first_name last_name");

        if (!driver) {
            return sendError(
                res,
                DRIVER_MESSAGES.DRIVER_NOT_FOUND,
                STATUS_CODES.NOT_FOUND
            );
        }

        const driverObjectId = new mongoose.Types.ObjectId(id);
        const { reviews, total } = await fetchDriverReviews(
            driverObjectId,
            skip,
            limitNum
        );
        const ratingSummary = await fetchDriverRatingSummary(driverObjectId);

        const responseData = {
            driverId: id,
            driverName: [driver.first_name, driver.last_name]
                .filter(Boolean)
                .join(" "),
            ratingSummary,
            reviews,
            pagination: buildPagination(pageNum, limitNum, total),
        };

        await setCacheData(cacheKey, responseData, DRIVER_CACHE.REVIEWS_TTL);

        return sendResponse({
            res,
            message: DRIVER_MESSAGES.REVIEWS_SUCCESS,
            data: responseData,
        });
    } catch (err) {
        console.error("Get Driver Reviews Error:", err);
        return sendError(res, DRIVER_MESSAGES.REVIEWS_FAILED);
    }
};