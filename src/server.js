require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const {
  validateBankAccount,
  getBanks,
  MODE,
  BASE_URL,
} = require("./monnify");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(morgan("tiny"));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "renmonie-backend",
    monnifyMode: MODE,
    monnifyBase: BASE_URL,
  });
});

/**
 * GET /api/banks
 *
 * Returns Monnify's current supported bank directory without exposing
 * Monnify credentials to the Android app.
 */
app.get("/api/banks", async (_req, res) => {
  try {
    const banks = await getBanks();

    const normalized = banks
      .map((bank) => ({
        code: String(
          bank?.code ??
            bank?.bankCode ??
            bank?.bankCodeValue ??
            ""
        ).trim(),
        name: String(
          bank?.name ??
            bank?.bankName ??
            bank?.bankNameValue ??
            ""
        ).trim(),
      }))
      .filter((bank) => bank.code && bank.name);

    return res.status(200).json({
      ok: true,
      banks: normalized,
    });
  } catch (err) {
    console.error("[banks]", err.code || err.name, err.message);

    if (err.code === "MISSING_CREDENTIALS") {
      return res.status(503).json({
        ok: false,
        banks: [],
        message: "Bank directory service not configured",
      });
    }

    return res.status(502).json({
      ok: false,
      banks: [],
      message: "Unable to load supported banks",
    });
  }
});

/**
 * POST /api/verify-account
 * Matches Android AccountVerificationClient contract.
 */
app.post("/api/verify-account", async (req, res) => {
  const accountNumber = String(req.body?.accountNumber || "")
    .replace(/\s+/g, "")
    .trim();
  const bankCode = String(req.body?.bankCode || "").trim();

  if (!/^\d{10}$/.test(accountNumber)) {
    return res.status(400).json({
      verified: false,
      accountName: "",
      bank: bankCode,
      message: "Enter a valid 10-digit account number",
    });
  }

  if (!bankCode) {
    return res.status(400).json({
      verified: false,
      accountName: "",
      bank: "",
      message: "Select a supported bank before verifying",
    });
  }

  try {
    const result = await validateBankAccount(accountNumber, bankCode);

    return res.status(200).json({
      verified: true,
      accountName: result.accountName,
      bank: result.bankCode,
      message: "Account verified",
    });
  } catch (err) {
    console.error("[verify-account]", err.code || err.name, err.message);

    if (err.code === "MISSING_CREDENTIALS") {
      return res.status(503).json({
        verified: false,
        accountName: "",
        bank: bankCode,
        message: "Verification service not configured",
      });
    }

    return res.status(200).json({
      verified: false,
      accountName: "",
      bank: bankCode,
      message:
        err.message && err.message.length < 120
          ? err.message
          : "Account name could not be verified",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ verified: false, message: "Not found" });
});

app.listen(PORT, () => {
  console.log(`RenMonie backend listening on port ${PORT}`);
  console.log(`Monnify mode: ${MODE} (${BASE_URL})`);
});
