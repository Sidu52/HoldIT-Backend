import { getCache, setCache, deleteCache } from "../../utils/cache.js";
import { CACHE_KEYS, CACHE_TTL as ADDRESS_CACHE_TTL } from "../../constants/user/address.js";
import { STORE_CACHE } from "../../constants/user/store.js";

const PROFILE_CACHE_TTL = 300;

const getProfileKey = (userId) => `user:profile:${userId}`;
const getNearestStoreKey = (lat, lng) => `nearest_stores:${lat.toFixed(2)}:${lng.toFixed(2)}`;
const getPublicStoreKey = (storeId) => `store:public:${storeId}`;

export const getUserProfileCache = (userId) => getCache(getProfileKey(userId));
export const setUserProfileCache = (userId, payload) => setCache(getProfileKey(userId), payload, PROFILE_CACHE_TTL);
export const deleteUserProfileCache = (userId) => deleteCache(getProfileKey(userId));

export const getUserAddressesCache = (userId) => getCache(CACHE_KEYS.USER_ADDRESSES(userId));
export const setUserAddressesCache = (userId, payload) => setCache(CACHE_KEYS.USER_ADDRESSES(userId), payload, ADDRESS_CACHE_TTL.LIST);
export const deleteUserAddressesCache = (userId) => deleteCache(CACHE_KEYS.USER_ADDRESSES(userId));

export const getUserAddressDetailCache = (userId, addressId) => getCache(CACHE_KEYS.USER_ADDRESS_DETAIL(userId, addressId));
export const setUserAddressDetailCache = (userId, addressId, payload) =>
    setCache(CACHE_KEYS.USER_ADDRESS_DETAIL(userId, addressId), payload, ADDRESS_CACHE_TTL.DETAIL);
export const deleteUserAddressDetailCache = (userId, addressId) =>
    deleteCache(CACHE_KEYS.USER_ADDRESS_DETAIL(userId, addressId));

export const getNearestStoreCache = (lat, lng) => getCache(getNearestStoreKey(lat, lng));
export const setNearestStoreCache = (lat, lng, payload) =>
    setCache(getNearestStoreKey(lat, lng), payload, STORE_CACHE.NEARBY_TTL);

export const getPublicStoreCache = (storeId) => getCache(getPublicStoreKey(storeId));
export const setPublicStoreCache = (storeId, payload) =>
    setCache(getPublicStoreKey(storeId), payload, STORE_CACHE.DETAIL_TTL);

export const deletePublicStoreCache = (storeId) => deleteCache(getPublicStoreKey(storeId));
