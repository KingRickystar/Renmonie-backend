/**
 * Monnify client — OAuth login + bank account name enquiry (v2).
 * Credentials only from environment variables.
 */

const MODE = (process.env.MONNIFY_MODE || "sandbox").toLowerCase();

const DEFAULT_BASE =
  MODE === "live"
    ? "https://api.monnify.com"
    : "https://sandbox.monnify.com";

const BASE_URL = (process.env.MONNIFY_BASE_URL || DEFAULT_BASE).replace(
  /\/$/,
  ""
);

let cachedToken = null;
let tokenExpiresAt = 0;

function getCredentials() {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;

  if (!apiKey || !secretKey) {
    const err = new Error(
      "MONNIFY_API_KEY and MONNIFY_SECRET_KEY must be set in the environment"
    );
    err.code = "MISSING_CREDENTIALS";
    throw err;
  }

  return { apiKey, secretKey };
}

async function login() {
  const { apiKey, secretKey } = getCredentials();
  const basic = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.requestSuccessful) {
    const err = new Error(
      body.responseMessage || `Monnify login failed (${res.status})`
    );
    err.code = "LOGIN_FAILED";
    err.status = res.status;
    throw err;
  }

  const token = body.responseBody?.accessToken;
  const expiresIn = Number(body.responseBody?.expiresIn || 3600);

  if (!token) {
    const err = new Error("Monnify login response missing accessToken");
    err.code = "LOGIN_FAILED";
    throw err;
  }

  // Refresh 60s before expiry
  cachedToken = token;
  tokenExpiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;

  return token;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  return login();
}

/**
 * @param {string} accountNumber 10-digit NUBAN
 * @param {string} bankCode Monnify bank code
 * @returns {Promise<{ accountName: string, accountNumber: string, bankCode: string }>}
 */
async function validateBankAccount(accountNumber, bankCode) {
  const token = await getAccessToken();

  const url = new URL(`${BASE_URL}/api/v2/disbursements/account/validate`);
  url.searchParams.set("accountNumber", accountNumber);
  url.searchParams.set("bankCode", bankCode);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.requestSuccessful) {
    const err = new Error(
      body.responseMessage || `Account validation failed (${res.status})`
    );
    err.code = "VALIDATE_FAILED";
    err.status = res.status;
    err.monnifyCode = body.responseCode;
    throw err;
  }

  const rb = body.responseBody || {};
  const accountName = String(rb.accountName || "").trim();

  if (!accountName) {
    const err = new Error("Account name not returned by Monnify");
    err.code = "VALIDATE_FAILED";
    throw err;
  }

  return {
    accountName,
    accountNumber: String(rb.accountNumber || accountNumber),
    bankCode: String(rb.bankCode || bankCode),
  };
}

module.exports = {
  validateBankAccount,
  BASE_URL,
  MODE,
};
