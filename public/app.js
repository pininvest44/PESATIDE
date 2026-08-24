document.getElementById("stkForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const phoneText = document.getElementById("phoneNumbers").value;
  const amount = document.getElementById("amount").value;
  const referencePrefix = document.getElementById("referencePrefix").value;
  const submitBtn = document.getElementById("submitBtn");
  const logsContainer = document.getElementById("logsContainer");

  const phoneNumbers = phoneText
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (phoneNumbers.length === 0) {
    alert("Please enter at least one phone number.");
    return;
  }

  submitBtn.disabled = true;
  logsContainer.innerHTML = `<div>Starting batch of ${phoneNumbers.length} request(s)...</div>`;

  try {
    const response = await fetch("/api/bulk-stk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumbers, amount, referencePrefix })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.replace("data: ", "").trim();
          if (!jsonStr) continue;

          const data = JSON.parse(jsonStr);
          if (data.complete) {
            logsContainer.innerHTML += `<div style="color:#60a5fa; margin-top:8px;">--- Processing Complete ---</div>`;
          } else {
            const entry = document.createElement("div");
            entry.className = `log-entry ${data.status}`;
            entry.innerText = `[${data.index}/${data.total}] Ref: ${data.reference} | Phone: ${data.phone} | Status: ${data.status} | Details: ${data.message}`;
            logsContainer.appendChild(entry);
            logsContainer.scrollTop = logsContainer.scrollHeight;
          }
        }
      }
    }
  } catch (err) {
    logsContainer.innerHTML += `<div class="log-entry FAILED">Error executing batch: ${err.message}</div>`;
  } finally {
    submitBtn.disabled = false;
  }
});
