export const extractRefreshToken = (req) => {
    const path = req.originalUrl || req.url || "";
    let cookieName = "refreshToken";
    if (path.includes("/admin")) cookieName = "admin_refreshToken";

    if (req.cookies?.[cookieName]) {
        return {
            token: req.cookies[cookieName],
            source: "cookie",
        };
    }

    if (req.cookies?.refreshToken) {
        return {
            token: req.cookies.refreshToken,
            source: "cookie",
        };
    }

    // Prefer explicit refresh token headers to avoid accidentally treating an access token as a refresh token.
    const refreshHeader = req.headers["x-refresh-token"] || req.headers["refresh-token"];
    if (refreshHeader) {
        return {
            token: refreshHeader.trim(),
            source: "header",
        };
    }

    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Refresh ")) {
        const token = authHeader.slice(8).trim();
        if (token) {
            return {
                token,
                source: "header",
            };
        }
    }

    if (req.body?.refreshToken) {
        return {
            token: req.body.refreshToken,
            source: "body",
        };
    }

    return { token: null, source: null };
};