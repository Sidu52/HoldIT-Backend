export const extractRefreshToken = (req) => {
    if (req.cookies?.refreshToken) {
        return {
            token: req.cookies.refreshToken,
            source: "cookie",
        };
    }

    // Authorization header
    const authHeader = req.headers["x-refresh-token"] || req.headers["authorization"];
    if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : authHeader.startsWith("Refresh ")
                ? authHeader.slice(8)
                : authHeader;

        if (token) {
            return {
                token: token.trim(),
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