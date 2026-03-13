const { execSync } = require("child_process")

const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getPubkeyFromKeypair(solanaKeygen, keypairPath) {
  const pubkey = execSync(
    `"${solanaKeygen}" pubkey "${keypairPath}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim()

  if (!pubkey) {
    throw new Error(`Could not derive pubkey from keypair: ${keypairPath}`)
  }

  return pubkey
}

function getSolanaBalance(solanaPath, rpcUrl, keypairPath) {
  const output = execSync(
    `"${solanaPath}" balance --keypair "${keypairPath}" --url "${rpcUrl}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim()

  const match = output.match(/([0-9.]+)\s+SOL/i)
  if (!match) {
    throw new Error(`Could not parse balance from output: ${output}`)
  }

  return Number(match[1])
}

async function waitForFunding({
  solanaPath,
  solanaKeygen,
  rpcUrl,
  feePayerKeypair,
  minimumRequiredSol = 0.05,
  pollIntervalMs = 5000
}) {
  if (!solanaPath) throw new Error("solanaPath is required")
  if (!solanaKeygen) throw new Error("solanaKeygen is required")
  if (!rpcUrl) throw new Error("rpcUrl is required")
  if (!feePayerKeypair) throw new Error("feePayerKeypair is required")

  const feePayerPubkey = getPubkeyFromKeypair(solanaKeygen, feePayerKeypair)

  while (true) {
    const balance = getSolanaBalance(solanaPath, rpcUrl, feePayerKeypair)

    if (balance >= minimumRequiredSol) {
      console.log("")
      console.log(`${BOLD}${GREEN}Balance available:${RESET} ${balance} SOL`)
      console.log(`${BOLD}${GREEN}Minimum required:${RESET} ${minimumRequiredSol} SOL`)
      console.log(`${BOLD}${GREEN}Funding detected. Continuing...${RESET}`)
      console.log("")
      return {
        feePayerPubkey,
        balance
      }
    }

    const missing = Math.max(0, minimumRequiredSol - balance)

    console.log("")
    console.log(`${BOLD}${YELLOW}Insufficient funds to create vote account.${RESET}`)
    console.log(`${BOLD}${CYAN}Send funds to:${RESET} ${feePayerPubkey}`)
    console.log(`${BOLD}${CYAN}Current balance:${RESET} ${balance} SOL`)
    console.log(`${BOLD}${CYAN}Minimum required:${RESET} ${minimumRequiredSol} SOL`)
    console.log(`${BOLD}${CYAN}Send at least:${RESET} ${missing.toFixed(6)} SOL`)
    console.log(`${YELLOW}Waiting for incoming funds... checking again in ${Math.round(pollIntervalMs / 1000)} seconds.${RESET}`)
    console.log("")

    await sleep(pollIntervalMs)
  }
}

module.exports = waitForFunding
