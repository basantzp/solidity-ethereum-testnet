// Client Application for Solidity Ethereum Testnet (SETH)

const API_BASE = "";

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error("Stats unavailable");
    const data = await res.json();

    document.getElementById("stat-block-height").textContent = `#${data.blockHeight}`;
    document.getElementById("stat-total-tx").textContent = data.totalTransactions;
    document.getElementById("stat-contracts").textContent = data.totalContracts;
    document.getElementById("stat-supply").textContent = `${parseFloat(data.totalSupplyEth).toLocaleString()} SETH`;
    document.getElementById("stat-contract-addr").textContent = data.contractAddress;
  } catch (err) {
    console.error("Error fetching stats:", err);
  }
}

async function fetchBlocks() {
  try {
    const res = await fetch(`${API_BASE}/api/blocks`);
    if (!res.ok) return;
    const blocks = await res.json();

    document.getElementById("block-count-badge").textContent = `${blocks.length} Blocks`;
    const tbody = document.getElementById("blocks-table-body");

    if (blocks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">No blocks found</td></tr>`;
      return;
    }

    tbody.innerHTML = blocks.map(b => `
      <tr>
        <td><strong>#${b.number}</strong></td>
        <td class="hash-cell" title="${b.hash}">${b.hash}</td>
        <td class="hash-cell" title="${b.miner}">${b.miner}</td>
        <td>${b.txCount} txs</td>
        <td>${b.gasUsed.toLocaleString()}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Error fetching blocks:", err);
  }
}

async function fetchAccounts() {
  try {
    const res = await fetch(`${API_BASE}/api/accounts`);
    if (!res.ok) return;
    const accounts = await res.json();

    document.getElementById("account-count-badge").textContent = `${accounts.length} Accounts`;
    const tbody = document.getElementById("accounts-table-body");

    if (accounts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No registered accounts</td></tr>`;
      return;
    }

    tbody.innerHTML = accounts.map(a => `
      <tr>
        <td><span class="badge ${a.isContract ? 'badge-accent' : ''}">${a.isContract ? 'CONTRACT' : 'EOA'}</span></td>
        <td class="hash-cell" title="${a.address}">${a.address}</td>
        <td><strong>${parseFloat(a.balanceEth).toFixed(2)}</strong> SETH</td>
        <td>nonce: ${a.nonce}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Error fetching accounts:", err);
  }
}

async function refreshAll() {
  await Promise.all([fetchStats(), fetchBlocks(), fetchAccounts()]);
}

// Faucet Form Handler
document.getElementById("faucet-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const recipient = document.getElementById("faucet-address").value.trim();
  const msgBox = document.getElementById("faucet-msg");

  msgBox.className = "msg-box";
  msgBox.style.display = "block";
  msgBox.textContent = "Processing faucet drip...";

  try {
    const res = await fetch(`${API_BASE}/api/faucet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Faucet failed");

    msgBox.className = "msg-box success";
    msgBox.textContent = `[✓] 5.0 SETH successfully dripped to ${recipient}! New Balance: ${data.newBalance} SETH`;
    refreshAll();
  } catch (err) {
    msgBox.className = "msg-box error";
    msgBox.textContent = `[-] ${err.message}`;
  }
});

// Transfer Form Handler
document.getElementById("transfer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fromIndex = document.getElementById("transfer-signer").value;
  const to = document.getElementById("transfer-to").value.trim();
  const valueEth = document.getElementById("transfer-amount").value.trim();
  const msgBox = document.getElementById("transfer-msg");

  msgBox.className = "msg-box";
  msgBox.style.display = "block";
  msgBox.textContent = "Submitting virtual transaction...";

  try {
    const res = await fetch(`${API_BASE}/api/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromIndex, to, valueEth })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transfer failed");

    msgBox.className = "msg-box success";
    msgBox.textContent = `[✓] Sent ${valueEth} SETH! TxHash: ${data.txHash.slice(0, 20)}...`;
    refreshAll();
  } catch (err) {
    msgBox.className = "msg-box error";
    msgBox.textContent = `[-] ${err.message}`;
  }
});

// Mine Form Handler
document.getElementById("mine-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const extraData = document.getElementById("mine-tag").value.trim();
  const msgBox = document.getElementById("mine-msg");

  msgBox.className = "msg-box";
  msgBox.style.display = "block";
  msgBox.textContent = "Mining next block on-chain...";

  try {
    const res = await fetch(`${API_BASE}/api/mine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Mining failed");

    msgBox.className = "msg-box success";
    msgBox.textContent = `[✓] Block #${data.blockNumber} Mined! Miner rewarded +2.0 SETH`;
    refreshAll();
  } catch (err) {
    msgBox.className = "msg-box error";
    msgBox.textContent = `[-] ${err.message}`;
  }
});

document.getElementById("refresh-btn").addEventListener("click", refreshAll);

// Init & Polling
refreshAll();
setInterval(refreshAll, 6000);
