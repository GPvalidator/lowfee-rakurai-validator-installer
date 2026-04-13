const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const { execSync } = require("child_process")
const run = require("../utils/run")
const getSolanaBinary = require("../utils/solanaBin")
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const SOLANA_DIR = "/var/lib/solana"
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

function findValidatorKeypairs() {
  const candidateNames = [
    "validator-keypair.json",
    "identity.json",
    "id.json",
    "validator.json",
    "validator-identity.json"
  ]

  const searchDirs = [
    "/root",
    "/home",
    "/var/lib/solana",
    "/var/lib",
    "/etc/solana",
    "/opt/solana",
    "/opt",
  ]

  const found = []

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    for (const name of candidateNames) {
      try {
        const out = execSync(
          `find "${dir}" -maxdepth 5 -type f -name "${name}" 2>/dev/null`,
          {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024
          }
        )
        if (out) {
          const files = out
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean)
          found.push(...files)
        }
      } catch {}
    }
  }

  return [...new Set(found)]
}

async function createNewValidatorKeypair() {
  const solanaKeygen = getSolanaBinary("solana-keygen")
  console.log(`Using solana-keygen: ${solanaKeygen}`)
  console.log("")
  console.log("Creating a new validator keypair")
  console.log(`${YELLOW}WARNING:${RESET} the recovery seed phrase is highly sensitive. Keep it secure.`)
  console.log("")
  const dataDir = SOLANA_DIR
  const recoveryDir = SOLANA_RECOVERY_DIR
  const defaultKeypairPath = path.join(dataDir, "identity.json")
  const defaultSeedPath = path.join(recoveryDir, "validator-seed.txt")
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(recoveryDir, { recursive: true })
  try {
    fs.chmodSync(dataDir, 0o700)
  } catch {}
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "keypairPath",
      message: `${BOLD}${CYAN}Enter output path for the new validator keypair (ENTER = default path):${RESET}`,
      default: defaultKeypairPath
    },
    {
      type: "list",
      name: "seedMode",
      message: `${BOLD}${CYAN}Recovery seed phrase handling:${RESET}`,
      default: "default",
      choices: [
        {
          name: `Save to default path (${defaultSeedPath})`,
          value: "default"
        },
        {
          name: "Enter custom path for validator seed file",
          value: "custom"
        },
        {
          name: "Do not save seed phrase to file",
          value: "nosave"
        }
      ]
    },
    {
      type: "input",
      name: "seedPath",
      message: `${BOLD}${CYAN}Enter path for validator seed file:${RESET}`,
      default: defaultSeedPath,
      when: answers => answers.seedMode === "custom",
      validate: input => {
        const value = (input || "").trim()
        if (!value) {
          return "You must specify a file path"
        }
        if (value.endsWith("/")) {
          return "Invalid path. Please include a filename."
        }
        try {
          if (fs.existsSync(value) && fs.statSync(value).isDirectory()) {
            return "Invalid path. This is a directory."
          }
        } catch {}
        return true
      }
    }
  ])
  const keypairPath = (answers.keypairPath || defaultKeypairPath).trim()
  const keypairDir = path.dirname(keypairPath)
  fs.mkdirSync(keypairDir, { recursive: true })
  const output = await run(
    solanaKeygen,
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
    throw new Error(`Failed to create validator keypair: ${keypairPath}`)
  }
  fs.chmodSync(keypairPath, 0o600)
  let identityPubkey = "unknown"
  try {
    const pubkeyOut = await run(
      solanaKeygen,
      ["pubkey", keypairPath],
      { capture: true }
    )
    if (pubkeyOut) {
      identityPubkey = pubkeyOut.toString().trim()
    }
  } catch (err) {
    console.log(`WARN: failed to read validator pubkey for ${keypairPath}: ${err.shortMessage || err.message}`)
  }
  const seedPhrase = extractSeedPhrase(output)
  let identitySeedPath
  if (answers.seedMode !== "nosave") {
    const seedPath =
      answers.seedMode === "custom"
        ? (answers.seedPath || defaultSeedPath).trim()
        : defaultSeedPath
    const seedDir = path.dirname(seedPath)
    fs.mkdirSync(seedDir, { recursive: true })
    const seedContent = [
      "LOW FEE VALIDATION — VALIDATOR IDENTITY RECOVERY",
      `Created: ${new Date().toISOString()}`,
      `Keypair path: ${keypairPath}`,
      `Pubkey: ${identityPubkey}`,
      "",
      "SEED PHRASE:",
      seedPhrase || "(Could not parse seed phrase automatically from solana-keygen output)",
      ""
    ].join("\n")
    fs.writeFileSync(seedPath, seedContent, { mode: 0o600 })
    fs.chmodSync(seedPath, 0o600)
    identitySeedPath = seedPath
    console.log(`Validator seed saved to: ${seedPath}`)
    console.log(`${YELLOW}IMPORTANT:${RESET} This file contains sensitive recovery data. Keep it secure.`)
  }
  console.log(`New validator keypair created: ${keypairPath}`)
  console.log(`Validator identity: ${identityPubkey}`)
  return {
    identityKeypair: keypairPath,
    identityPubkey,
    identitySeedPath
  }
}

async function detectValidatorKeypair() {
  const solanaKeygen = getSolanaBinary("solana-keygen")
  console.log(`Using solana-keygen: ${solanaKeygen}`)
  console.log("Searching for validator keypair files...")
  const found = findValidatorKeypairs()
  let identityKeypair = ""
  if (found.length > 0) {
    const choices = []
    for (const file of found) {
      let pubkey = "unknown"
      try {
        const result = await run(solanaKeygen, ["pubkey", file], { capture: true })
        if (result) {
          pubkey = result.toString().trim()
        }
      } catch (err) {
        console.log(`WARN: failed to read pubkey for ${file}: ${err.shortMessage || err.message}`)
      }
      choices.push({
        name: `${file} (${pubkey})`,
        value: file
      })
    }
    // "Enter path manually" always first so nothing is preselected by accident
    choices.unshift({
      name: "Enter path manually",
      value: "manual"
    })
    choices.push({
      name: "Create new validator keypair",
      value: "create"
    })

    console.log("")
    console.log(`${YELLOW}Found ${found.length} keypair(s). Please confirm which one is your validator identity:${RESET}`)
    console.log("")

    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "keypair",
        message: `${BOLD}${CYAN}Select validator identity keypair (verify carefully):${RESET}`,
        choices
      }
    ])
    identityKeypair = answer.keypair
    if (identityKeypair === "manual") {
      const manual = await inquirer.prompt([
        {
          type: "input",
          name: "path",
          message: `${BOLD}${CYAN}Enter validator keypair path:${RESET}`,
          default: "/var/lib/solana/identity.json"
        }
      ])
      identityKeypair = manual.path.trim()
    }
    if (identityKeypair === "create") {
      return await createNewValidatorKeypair()
    }
  } else {
    console.log("No validator keypair detected automatically.")
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "mode",
        message: "How do you want to continue?",
        choices: [
          { name: "Enter validator keypair path manually", value: "manual" },
          { name: "Create new validator keypair", value: "create" }
        ]
      }
    ])
    if (answer.mode === "create") {
      return await createNewValidatorKeypair()
    }
    const manual = await inquirer.prompt([
      {
        type: "input",
        name: "path",
        message: `${BOLD}${CYAN}Enter validator keypair path:${RESET}`,
        default: "/var/lib/solana/identity.json"
      }
    ])
    identityKeypair = manual.path.trim()
  }
  if (!fs.existsSync(identityKeypair)) {
    throw new Error(`Keypair file not found: ${identityKeypair}`)
  }
  let identityPubkey = "unknown"
  try {
    const result = await run(
      solanaKeygen,
      ["pubkey", identityKeypair],
      { capture: true }
    )
    if (result) {
      identityPubkey = result.toString().trim()
    }
  } catch (err) {
    console.log(`WARN: failed to read validator pubkey for ${identityKeypair}: ${err.shortMessage || err.message}`)
  }
  console.log("Validator identity:", identityPubkey)
  return {
    identityKeypair,
    identityPubkey
  }
}

module.exports = detectValidatorKeypair
