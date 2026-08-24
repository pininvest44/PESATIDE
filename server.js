const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatPhone(phone) {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.slice(1);
  } else if (cleaned.startsWith("7") || cleaned.startsWith("1")) {
    cleaned = "254" + cleaned;
  }
  return cleaned;
}

app.post("/api/bulk-stk", async (req, res) => {
  const { phoneNumbers, amount, referencePrefix, description } = req.body;

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: "At least one phone number is required." });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valid amount is required." });
  }

  const apiKey = process.env.PESATIDE_API_KEY;
  const routeId = process.env.PESATIDE_ROUTE_ID;

  if (!apiKey || !routeId) {
    return res.status(500).json({ error: "Server missing Pesatide configuration." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const total = phoneNumbers.length;
  const cleanPrefix = (referencePrefix || "ORD").replace(/[^a-zA-Z0-9]/g, "");

  for (let i = 0; i < total; i++) {
    const rawPhone = phoneNumbers[i];
    const formattedPhone = formatPhone(rawPhone);
    const internalOrderRef = `${referencePrefix || "ORDER"}-${Date.now()}-${i + 1}`;
    
    // Safaricom M-Pesa Constraints:
    // accountReference: Max 12 chars
    // description: Max 13 chars
    const shortAccountRef = `${cleanPrefix}${i + 1}${Date.now().toString().slice(-6)}`.slice(0, 12);
    const shortDesc = (description || "Order Payment").slice(0, 13);

    const payload = {
      reference: internalOrderRef,
      amount: Number(amount),
      phone: formattedPhone,
      routeId: routeId,
      accountReference: shortAccountRef,
      description: shortDesc
    };

    let logResult = {
      index: i + 1,
      total,
      phone: formattedPhone,
      reference: internalOrderRef,
      accountReference: shortAccountRef,
      status: "FAILED",
      message: ""
    };

    try {
      const apiResponse = await fetch("https://pesatide.com/v1/payments/stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Idempotency-Key": `idemp-${internalOrderRef}`
        },
        body: JSON.stringify(payload)
      });

      const data = await apiResponse.json();

      if (apiResponse.ok) {
        logResult.status = "SUCCESS";
        logResult.message = data.message || "STK Prompt initiated successfully.";
      } else {
        logResult.status = "FAILED";
        logResult.message = data.message || data.error || "Failed to initiate prompt.";
      }
    } catch (err) {
      logResult.status = "FAILED";
      logResult.message = err.message || "Network error communicating with Pesatide API.";
    }

    res.write(`data: ${JSON.stringify(logResult)}\n\n`);

    // Rate limiting: 6 requests/min = 10 sec delay between requests
    if (i < total - 1) {
      await sleep(10000);
    }
  }

  res.write(`data: ${JSON.stringify({ complete: true })}\n\n`);
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
