import env from "./env.js";

// Shiprocket Environment Object ను సురక్షితంగా రీడ్ చేయడం
const shiprocketEnv = env?.shiprocket || {};

// Shiprocket Credentials Check
if (!shiprocketEnv.email || !shiprocketEnv.password) {
  console.warn("⚠️ WARNING: Shiprocket EMAIL or PASSWORD is missing in environment variables!");
}

const shiprocketConfig = {
  baseUrl: shiprocketEnv.baseUrl || process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external",
  email: shiprocketEnv.email || process.env.SHIPROCKET_EMAIL,
  password: shiprocketEnv.password || process.env.SHIPROCKET_PASSWORD,

  // Token Management (In-Memory Cache)
  token: null,
  tokenExpiry: null, // UNIX Timestamp in milliseconds

  /**
   * Current cached token చెల్లుబాటులో ఉందో లేదో చెక్ చేస్తుంది
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.token || !this.tokenExpiry) return false;
    // Current time కంటే Expiry time ఎక్కువ ఉందో లేదో చూస్తుంది (10-second safety margin)
    return Date.now() < (this.tokenExpiry - 10000);
  },

  /**
   * కొత్త Token ని సేవ్ చేసి ఎక్స్‌పైరీ టైమ్‌ని సెట్ చేస్తుంది (Default: 10 రోజులు)
   * @param {string} token - Bearer Token received from Shiprocket
   * @param {number} expiresInDays - Days until token expires (Default: 10 days)
   */
  setToken(token, expiresInDays = 10) {
    if (!token) return;
    this.token = token;
    // 10 రోజుల సమయాన్ని మిల్లీసెకన్లలో లెక్కించి సేవ్ చేస్తుంది
    this.tokenExpiry = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
  },

  /**
   * Token ఎక్స్‌పైర్ అయినప్పుడు లేదా 401 ఎర్రర్ వచ్చినప్పుడు Token ని క్లియర్ చేస్తుంది
   */
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
  }
};

export default shiprocketConfig;