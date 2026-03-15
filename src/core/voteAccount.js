const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const { execSync } = require("child_process")

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const GREEN = "\x1b[32m"

const SOLANA_DATA_DIR = "/var/lib/solana"

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function ensureDir(dirPath) {
  if (!fileExists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function isJsonKeypairFile(filePath) {
  try {
    if (!fileExists(filePath)) return false

    const raw = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw)

    return (
      Array.isArray(parsed) &&
      parsed.length === 64 &&
      parsed.every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 255
      )
    )
  } catch {
    return false
  }
}

function isLikelyPubkey(value) {
  return typeof value === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

function getPubkeyFromKeypair(solanaKeygen, keypairPath) {
  try {
    const pubkey = execSync(
      `"${solanaKeygen}" pubkey "${keypairPath}"`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim()

    if (!isLikelyPubkey(pubkey)) {
      throw new Error(`Invalid pubkey`)
    }

    return pubkey

  } catch {
    throw new Error("Invalid keypair")
  }
}

function scanKeypairs(solanaKeygen) {

  let files = []

  try {
    const out = execSync(
      `find / -type f -name "*.json" 2>/dev/null`,
      {
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      }
    )

    files = out.split("\n").map(x => x.trim()).filter(Boolean)

  } catch {
    return []
  }

  const results = []

  for (const file of files) {

    if (!isJsonKeypairFile(file)) continue

    try {

      const pubkey = getPubkeyFromKeypair(solanaKeygen, file)

      results.push({
        file,
        name: path.basename(file),
        pubkey
      })

    } catch {
      // ignorar silenciosamente
    }

  }

  return [...new Map(results.map(x => [x.file, x])).values()]
}

  const results = []

  for (const file of files) {

    if (!isJsonKeypairFile(file)) continue

    try {

      const pubkey = getPubkeyFromKeypair(solanaKeygen, file)

      results.push({
        file,
        name: path.basename(file),
        pubkey
      })

    } catch {}

  }

  return results
}

function scanVoteKeypairs(solanaKeygen) {

  return scanKeypairs(solanaKeygen).filter(item => {

    const lower = item.name.toLowerCase()

    return (
      lower.includes("vote") ||
      lower.includes("validator-vote") ||
      lower.includes("vote-account")
    )

  })

}

function scanWithdrawerKeypairs(solanaKeygen) {

  return scanKeypairs(solanaKeygen).filter(item => {

    const lower = item.name.toLowerCase()

    return (
      lower.includes("withdrawer") ||
      lower.includes("authorized-withdrawer") ||
      lower.includes("withdraw")
    )

  })

}

function createKeypairFile(solanaKeygen, outputPath) {

  const resolvedPath = path.resolve(outputPath)

  ensureDir(path.dirname(resolvedPath))

  execSync(
    `"${solanaKeygen}" new --no-bip39-passphrase -o "${resolvedPath}" --force`,
    { stdio: "inherit" }
  )

  return {
    file: resolvedPath,
    pubkey: getPubkeyFromKeypair(solanaKeygen, resolvedPath)
  }

}

async function promptKeypairPath(messageText) {

  const { keypairPath } = await inquirer.prompt([
    {
      type: "input",
      name: "keypairPath",
      message: `${BOLD}${CYAN}${messageText}${RESET}`,
      validate: (input) => {

        if (!input || !input.trim())
          return "Path is required"

        const resolved = path.resolve(input.trim())

        if (!fileExists(resolved))
          return "File does not exist"

        if (!isJsonKeypairFile(resolved))
          return "File is not a valid Solana keypair"

        return true
      }
    }
  ])

  return path.resolve(keypairPath.trim())

}

async function promptPubkey(messageText) {

  const { pubkey } = await inquirer.prompt([
    {
      type: "input",
      name: "pubkey",
      message: `${BOLD}${CYAN}${messageText}${RESET}`,
      validate: (input) => {

        if (!input || !input.trim())
          return "Pubkey required"

        if (!isLikelyPubkey(input.trim()))
          return "Invalid pubkey"

        return true
      }
    }
  ])

  return pubkey.trim()

}

async function createNewVoteKeypair(solanaKeygen) {

  ensureDir(SOLANA_DATA_DIR)

  const defaultPath = path.join(
    SOLANA_DATA_DIR,
    "vote-account-keypair.json"
  )

  const { destination } = await inquirer.prompt([
    {
      type: "input",
      name: "destination",
      default: defaultPath,
      message: `${BOLD}${CYAN}Path to save new vote account keypair:${RESET}`,
      validate: (input) => {

        if (!input || !input.trim())
          return "Destination required"

        const dir = path.dirname(path.resolve(input.trim()))

        if (!fileExists(dir))
          return "Directory does not exist"

        return true
      }
    }
  ])

  const created = createKeypairFile(
    solanaKeygen,
    destination.trim()
  )

  console.log(`${GREEN}Created vote account keypair:${RESET} ${created.file}`)
  console.log(`${GREEN}Vote account pubkey:${RESET} ${created.pubkey}`)

  return {
    votePubkey: created.pubkey,
    voteKeypair: created.file,
    needsCreateOnChain: true
  }

}

async function selectVoteAccount({ solanaKeygen }) {

  const detectedVotes = scanVoteKeypairs(solanaKeygen)

  const choices = []

  for (const { file, pubkey, name } of detectedVotes) {

    choices.push({
      name: `${name} (${pubkey})`,
      value: { mode: "detected", file, pubkey }
    })

  }

  choices.push({
    name: "Enter existing vote account pubkey manually",
    value: { mode: "manual-pubkey" }
  })

  choices.push({
    name: "Use existing vote account keypair file",
    value: { mode: "manual-keypair" }
  })

  choices.push({
    name: "Create new vote account keypair",
    value: { mode: "create" }
  })

  const { vote } = await inquirer.prompt([
    {
      type: "list",
      name: "vote",
      message: `${BOLD}${CYAN}Select vote account option:${RESET}`,
      choices
    }
  ])

  if (vote.mode === "detected") {

    return {
      votePubkey: vote.pubkey,
      voteKeypair: vote.file,
      needsCreateOnChain: false
    }

  }

  if (vote.mode === "manual-pubkey") {

    const votePubkey =
      await promptPubkey("Enter vote account pubkey:")

    return {
      votePubkey,
      voteKeypair: null,
      needsCreateOnChain: false
    }

  }

  if (vote.mode === "manual-keypair") {

    const voteKeypair =
      await promptKeypairPath(
        "Enter vote account keypair path:"
      )

    const votePubkey =
      getPubkeyFromKeypair(solanaKeygen, voteKeypair)

    return {
      votePubkey,
      voteKeypair,
      needsCreateOnChain: false
    }

  }

  return createNewVoteKeypair(solanaKeygen)

}

async function selectAuthorizedWithdrawer({
  solanaKeygen,
  validatorPubkey = null,
  validatorKeypair = null
}) {

  const choices = [
    {
      name: "Create new authorized withdrawer keypair",
      value: { mode: "create" }
    }
  ]

  if (validatorPubkey && validatorKeypair) {

    choices.push({
      name: `Use validator-keypair as authorized withdrawer (${validatorPubkey})`,
      value: {
        mode: "use-validator",
        pubkey: validatorPubkey,
        keypair: validatorKeypair
      }
    })

  }

  choices.push({
    name: "Use existing authorized withdrawer",
    value: { mode: "existing" }
  })

  const { withdrawer } = await inquirer.prompt([
    {
      type: "list",
      name: "withdrawer",
      message: `${BOLD}${CYAN}Select authorized withdrawer option:${RESET}`,
      choices
    }
  ])

  if (withdrawer.mode === "use-validator") {

    return {
      authorizedWithdrawerPubkey: withdrawer.pubkey,
      authorizedWithdrawerKeypair: withdrawer.keypair,
      authorizedWithdrawerCreated: false
    }

  }

  if (withdrawer.mode === "create") {

    ensureDir(SOLANA_DATA_DIR)

    const defaultPath = path.join(
      SOLANA_DATA_DIR,
      "authorized-withdrawer-keypair.json"
    )

    const { destination } = await inquirer.prompt([
      {
        type: "input",
        name: "destination",
        default: defaultPath,
        message: `${BOLD}${CYAN}Path to save new authorized withdrawer keypair:${RESET}`
      }
    ])

    const created = createKeypairFile(
      solanaKeygen,
      destination.trim()
    )

    console.log(`${GREEN}Created withdrawer keypair:${RESET} ${created.file}`)
    console.log(`${GREEN}Withdrawer pubkey:${RESET} ${created.pubkey}`)

    return {
      authorizedWithdrawerPubkey: created.pubkey,
      authorizedWithdrawerKeypair: created.file,
      authorizedWithdrawerCreated: true
    }

  }

  const detected = scanWithdrawerKeypairs(solanaKeygen)

  const existingChoices = detected.map(item => ({
    name: `${item.name} (${item.pubkey})`,
    value: item
  }))

  existingChoices.push({
    name: "Enter withdrawer keypair path manually",
    value: { manual: true }
  })

  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: `${BOLD}${CYAN}Select withdrawer:${RESET}`,
      choices: existingChoices
    }
  ])

  if (selected.manual) {

    const keypair =
      await promptKeypairPath("Enter withdrawer keypair path:")

    const pubkey =
      getPubkeyFromKeypair(solanaKeygen, keypair)

    return {
      authorizedWithdrawerPubkey: pubkey,
      authorizedWithdrawerKeypair: keypair
    }

  }

  return {
    authorizedWithdrawerPubkey: selected.pubkey,
    authorizedWithdrawerKeypair: selected.file
  }

}

module.exports = {
  selectVoteAccount,
  selectAuthorizedWithdrawer
}
