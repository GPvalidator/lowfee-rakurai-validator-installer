const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const run = require("../utils/run")

const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

const SOLANA_DATA_DIR = "/var/lib/solana"
const SOLANA_RECOVERY_DIR = "/var/lib/solana/recovery"

function extractSeedPhrase(output) {
  const match = output
    ? output.toString().match(/recover your new keypair:\s*([\s\S]*?)=+/i)
    : null

  if (match && match[1]) {
    return match[1].replace(/\n/g, " ").trim()
  }

  return ""
}

async function createAuthorizedWithdrawer() {
  console.log("")
  console.log("Creating authorized withdrawer keypair")
  console.log(`${YELLOW}WARNING:${RESET} keep this key secure.`)
  console.log("")

  const dataDir = SOLANA_DATA_DIR
  const recoveryDir = SOLANA_RECOVERY_DIR
  const defaultPath = path.join(dataDir, "authorized-withdrawer-keypair.json")
  const defaultSeedPath = path.join(recoveryDir, "authorized-withdrawer-seed.txt")

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(recoveryDir, { recursive: true })

  try {
    fs.chmodSync(dataDir, 0o700)
  } catch {}

  const answer = await inquirer.prompt([
    {
      type: "input",
      name: "path",
      message: `${BOLD}${CYAN}Enter output path for authorized withdrawer keypair (ENTER = default path):${RESET}`,
      default: defaultPath
    }
  ])

  const keypairPath = (answer.path || defaultPath).trim()
  fs.mkdirSync(path.dirname(keypairPath), { recursive: true })

  const output = await run(
    "solana-keygen",
    [
      "new",
      "--no-bip39-passphrase",
      "--outfile",
      keypairPath,
      "--force"
    ],
    { capture: true }
  )

  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Failed to create authorized withdrawer keypair: ${keypairPath}`)
  }

  fs.chmodSync(keypairPath, 0o600)

  const pubkey = (await run(
    "solana-keygen",
    ["pubkey", keypairPath],
    { capture: true }
  )).toString().trim()

  const seedPhrase = extractSeedPhrase(output)

  const seedContent = [
    "LOW FEE VALIDATION — AUTHORIZED WITHDRAWER RECOVERY",
    `Created: ${new Date().toISOString()}`,
    `Keypair path: ${keypairPath}`,
    `Pubkey: ${pubkey}`,
    "",
    "SEED PHRASE:",
    seedPhrase || "(Could not parse seed phrase automatically from solana-keygen output)",
    ""
  ].join("\n")

  fs.writeFileSync(defaultSeedPath, seedContent, { mode: 0o600 })
  fs.chmodSync(defaultSeedPath, 0o600)

  console.log(`Authorized withdrawer created: ${pubkey}`)
  console.log(`Recovery seed saved to: ${defaultSeedPath}`)

  return {
    withdrawerKeypair: keypairPath,
    withdrawerPubkey: pubkey,
    withdrawerSeedPath: defaultSeedPath
  }
}

module.exports = createAuthorizedWithdrawer
