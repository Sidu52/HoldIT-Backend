import StoreOwnerAuth from "./storeOwner.auth.route.js";
import StoreOwner from "./storeOwner.route.js";
import StoreOwnerSupport from "./support.storeOwner.routes.js";

const StoreOwnerRoutes = (app) => {
    app.use("/api/v1/store-owner/auth", StoreOwnerAuth);
    app.use("/api/v1/store-owner/support", StoreOwnerSupport);
    app.use("/api/v1/store-owner", StoreOwner);
}

export default StoreOwnerRoutes;
