import userAuthRoute from "./auth.user.js";

export default function userRoutes(app) {
    app.use("/api/v1/user/auth", userAuthRoute);

}
