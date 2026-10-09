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

/** In-memory transfer log for simulator status lookups (resets on restart). */
const transferStore = new Map();

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

/**
 * POST /api/transfers
 * Matches Android TransferClient.submit contract.
 *
 * RenMonie is a UI/UX simulator. This endpoint records a sandbox transfer
 * and returns success so the app can complete the local debit + receipt flow.
 * It does not move real money.
 */
app.post("/api/transfers", (req, res) => {
  const amount = Number(req.body?.amount);
  const reference = String(req.body?.reference || "").trim();
  const destinationBankCode = String(req.body?.destinationBankCode || "").trim();
  const destinationAccountNumber = String(
    req.body?.destinationAccountNumber || ""
  )
    .replace(/\s+/g, "")
    .trim();
  const destinationAccountName = String(
    req.body?.destinationAccountName || ""
  ).trim();
  const narration = String(req.body?.narration || "RenMonie transfer").trim();

  if (!Number.isFinite(amount) || amount < 1) {
    return res.status(400).json({
      ok: false,
      reference,
      status: "FAILED",
      message: "Enter a valid transfer amount",
      amount: 0,
    });
  }

  if (!reference) {
    return res.status(400).json({
      ok: false,
      reference: "",
      status: "FAILED",
      message: "Transfer reference is required",
      amount: 0,
    });
  }

  if (!destinationBankCode) {
    return res.status(400).json({
      ok: false,
      reference,
      status: "FAILED",
      message: "Destination bank is required",
      amount: 0,
    });
  }

  if (!/^\d{10}$/.test(destinationAccountNumber)) {
    return res.status(400).json({
      ok: false,
      reference,
      status: "FAILED",
      message: "Enter a valid 10-digit destination account number",
      amount: 0,
    });
  }

  if (destinationAccountName.length < 2) {
    return res.status(400).json({
      ok: false,
      reference,
      status: "FAILED",
      message: "Verified recipient name is required",
      amount: 0,
    });
  }

  const record = {
    ok: true,
    reference,
    status: "SUCCESS",
    message: "Transfer accepted (simulator)",
    amount: Math.floor(amount),
    destinationBankCode,
    destinationAccountNumber,
    destinationAccountName,
    narration,
    createdAt: new Date().toISOString(),
  };

  transferStore.set(reference, record);

  console.log(
    "[transfers] accepted", 
    reference,
    amount,
    destinationAccountNumber,
    destinationBankCode
  );

  return res.status(200).json({
    ok: true,
    reference: record.reference,
    status: record.status,
    message: record.message,
    amount: record.amount,
  });
});

/**
 * GET /api/transfers/:reference
 * Matches Android TransferClient.status contract.
 */
app.get("/api/transfers/:reference", (req, res) => {
  const reference = String(req.params.reference || "").trim();
  const record = transferStore.get(reference);

  if (!record) {
    return res.status(404).json({
      ok: false,
      reference,
      status: "NOT_FOUND",
      message: "Transfer reference not found",
      amount: 0,
    });
  }

  return res.status(200).json({
    ok: true,
    reference: record.reference,
    status: record.status,
    message: record.message,
    amount: record.amount,
  });
});

app.use((_req, res) => {
  res.status(404).json({ verified: false, message: "Not found" });
});

app.listen(PORT, () => {
  console.log(`RenMonie backend listening on port ${PORT}`);
  console.log(`Monnify mode: ${MODE} (${BASE_URL})`);
});
