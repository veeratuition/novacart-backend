import jwt from "jsonwebtoken";

function getSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("JWT_SECRET is not configured.");
  return secret;
}

export function requireJwtAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Bearer JWT token required.",
      });
    }

    const token = header.slice(7).trim();
    const decoded = jwt.verify(token, getSecret(), {
      issuer: "novacart",
    });

    req.user = {
      ...decoded,
      uid: decoded.uid || decoded.sub,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired JWT token.",
    });
  }
}
