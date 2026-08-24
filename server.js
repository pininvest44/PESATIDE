const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper function to introduce a delay for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Format phone number to standard 254XXXXXXXXX
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

  // Set response header for Server-Sent Events (SSE) stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const total = phoneNumbers.length;

  for (let i = 0; i < total; i++) {
    const rawPhone = phoneNumbers[i];
    const formattedPhone = formatPhone(rawPhone);
    const orderRef = `${referencePrefix || "ORDER"}-${Date.now()}-${i + 1}`;

    const payload = {
      reference: orderRef,
      amount: Number(amount),
      phone: formattedPhone,
      routeId: routeId,
      accountReference: orderRef,
      description: description || "Bulk STK Payment"
    };

    let logResult = {
      index: i + 1,
      total,
      phone: formattedPhone,
      reference: orderRef,
      status: "FAILED",
      message: ""
    };

    try {
      const apiResponse = await fetch("https://pesatide.com/v1/payments/stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Idempotency-Key": `idemp-${orderRef}`
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

    // Push log to client browser
    res.write(`data: ${JSON.stringify(logResult)}\n\n`);

    // Rate Limiting: 6 requests per minute = 10,000 ms interval between requests
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
