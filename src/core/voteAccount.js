const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const { execSync } = require("child_process")

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"

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
    return Array.isArray(parsed) && parsed.length >= 64
  } catch {
    return false
  }
}

function isLikelyPubkey(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

function getPubkeyFromKeypair(solanaKeygen, keypairPath) {
  try {
    const pubkey = execSync(
      `"${solanaKeygen}" pubkey "${keypairPath}"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim()

    if (!isLikelyPubkey(pubkey)) {
      throw new Error(`Invalid pubkey derived from ${keypairPath}`)
    }

    return pubkey
  } catch (err) {
    throw new Error(`Failed to derive pubkey from "${keypairPath}": ${err.message}`)
  }
}

function scanKeypairs(searchDir, solanaKeygen) {
  if (!searchDir || !fileExists(searchDir)) return []

  const results = []
  const entries = fs.readdirSync(searchDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith(".json")) continue

    const fullPath = path.join(searchDir, entry.name)
    if (!isJsonKeypairFile(fullPath)) continue

    try {
      const pubkey = getPubkeyFromKeypair(solanaKeygen, fullPath)
      results.push({
        file: fullPath,
        name: entry.name,
        pubkey
      })
    } catch {
      // ignore invalid files
    }
  }

  return results
}

function scanVoteKeypairs(searchDir, solanaKeygen) {
  return scanKeypairs(searchDir, solanaKeygen).filter((item) => {
    const lower = item.name.toLowerCase()
    return (
      lower.includes("vote") ||
      lower.includes("validator-vote") ||
      lower.includes("vote-account")
    )
  })
}

function scanWithdrawerKeypairs(searchDir, solanaKeygen) {
  return scanKeypairs(searchDir, solanaKeygen).filter((item) => {
    const lower = item.name.toLowerCase()
    return (
      lower.includes("withdrawer") ||
      lower.includes("authorized-withdrawer") ||
      lower.includes("withdraw")
    )
  })
}

function buildSuggestedVoteKeypairPath(baseDir) {
  return path.join(baseDir, "vote-account-keypair.json")
}

function buildSuggestedWithdrawerKeypairPath(baseDir) {
  return path.join(baseDir, "authorized-withdrawer-keypair.json")
}

function createKeypairFile(solanaKeygen, outputPath) {
  const resolvedPath = path.resolve(outputPath)
  ensureDir(path.dirname(resolvedPath))

  try {
    execSync(
      `"${solanaKeygen}" new --no-bip39-passphrase -o "${resolvedPath}" --force`,
      { stdio: "inherit" }
    )
  } catch (err) {
    throw new Error(`Failed to create keypair at "${resolvedPath}": ${err.message}`)
  }

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
        if (!input || !input.trim()) return "Path is required"

        const resolved = path.resolve(input.trim())

        if (!fileExists(resolved)) return "File does not exist"
        if (!isJsonKeypairFile(resolved)) return "File is not a valid Solana keypair JSON"

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
        if (!input || !input.trim()) return "Pubkey is required"
        if (!isLikelyPubkey(input.trim())) return "Enter a valid Solana pubkey"
        return true
      }
    }
  ])

  return pubkey.trim()
}

async function createNewVoteKeypair(solanaKeygen, outputDir = process.cwd()) {
  const defaultPath = buildSuggestedVoteKeypairPath(outputDir)
   console.log("DEBUG outputDir:", outputDir)
   console.log("DEBUG defaultPath:", defaultPath)

  const { destination } = await inquirer.prompt([
    {
      type: "input",
      name: "destination",
      default: defaultPath,
      message: `${BOLD}${CYAN}Path to save new vote account keypair:${RESET}`,
      validate: (input) => {
        if (!input || !input.trim()) return "Destination path is required"
        const dir = path.dirname(path.resolve(input.trim()))
        if (!fileExists(dir)) return "Destination directory does not exist"
        return true
      }
    }
  ])

  const created = createKeypairFile(solanaKeygen, destination.trim())

  console.log(`${GREEN}Created vote account keypair:${RESET} ${created.file}`)
  console.log(`${GREEN}Vote account pubkey:${RESET} ${created.pubkey}`)

  return {
    votePubkey: created.pubkey,
    voteKeypair: created.file,
    needsCreateOnChain: true
  }
}

async function selectVoteAccount({
  solanaKeygen,
  searchDir = process.cwd(),
  outputDir = searchDir
}) {
  const detectedVotes = scanVoteKeypairs(searchDir, solanaKeygen)
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
    const votePubkey = await promptPubkey("Enter existing vote account pubkey:")
    return {
      votePubkey,
      voteKeypair: null,
      needsCreateOnChain: false
    }
  }

  if (vote.mode === "manual-keypair") {
    const voteKeypair = await promptKeypairPath("Enter path to existing vote account keypair JSON:")
    const votePubkey = getPubkeyFromKeypair(solanaKeygen, voteKeypair)

    return {
      votePubkey,
      voteKeypair,
      needsCreateOnChain: false
    }
  }

  return createNewVoteKeypair(solanaKeygen, outputDir)
}

async function selectAuthorizedWithdrawer({
  solanaKeygen,
  searchDir = process.cwd(),
  outputDir = searchDir,
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
    name: "Use an existing authorized withdrawer (keypair or pubkey)",
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
      authorizedWithdrawerCreated: false,
      authorizedWithdrawerUsesValidatorIdentity: true,
      authorizedWithdrawerSource: "validator-keypair"
    }
  }

  if (withdrawer.mode === "create") {
    const defaultPath = buildSuggestedWithdrawerKeypairPath(outputDir)

    const { destination } = await inquirer.prompt([
      {
        type: "input",
        name: "destination",
        default: defaultPath,
        message: `${BOLD}${CYAN}Path to save new authorized withdrawer keypair:${RESET}`,
        validate: (input) => {
          if (!input || !input.trim()) return "Destination path is required"
          const dir = path.dirname(path.resolve(input.trim()))
          if (!fileExists(dir)) return "Destination directory does not exist"
          return true
        }
      }
    ])

    const created = createKeypairFile(solanaKeygen, destination.trim())

    console.log(`${GREEN}Created authorized withdrawer keypair:${RESET} ${created.file}`)
    console.log(`${GREEN}Authorized withdrawer pubkey:${RESET} ${created.pubkey}`)
    console.log(
      `${YELLOW}Important:${RESET} keep this keypair safe and preferably offline.`
    )

    return {
      authorizedWithdrawerPubkey: created.pubkey,
      authorizedWithdrawerKeypair: created.file,
      authorizedWithdrawerCreated: true,
      authorizedWithdrawerUsesValidatorIdentity: false,
      authorizedWithdrawerSource: "created"
    }
  }

  const detectedWithdrawers = scanWithdrawerKeypairs(searchDir, solanaKeygen)
  const existingChoices = []

  for (const { file, pubkey, name } of detectedWithdrawers) {
    existingChoices.push({
      name: `${name} (${pubkey})`,
      value: { mode: "detected-keypair", file, pubkey }
    })
  }

  existingChoices.push({
    name: "Enter path to existing authorized withdrawer keypair JSON",
    value: { mode: "manual-keypair" }
  })

  existingChoices.push({
    name: "Enter authorized withdrawer pubkey manually",
    value: { mode: "manual-pubkey" }
  })

  const { existingWithdrawer } = await inquirer.prompt([
    {
      type: "list",
      name: "existingWithdrawer",
      message: `${BOLD}${CYAN}Select existing authorized withdrawer source:${RESET}`,
      choices: existingChoices
    }
  ])

  if (existingWithdrawer.mode === "detected-keypair") {
    return {
      authorizedWithdrawerPubkey: existingWithdrawer.pubkey,
      authorizedWithdrawerKeypair: existingWithdrawer.file,
      authorizedWithdrawerCreated: false,
      authorizedWithdrawerUsesValidatorIdentity: false,
      authorizedWithdrawerSource: "existing-detected-keypair"
    }
  }

  if (existingWithdrawer.mode === "manual-keypair") {
    const keypair = await promptKeypairPath("Enter path to authorized withdrawer keypair JSON:")
    const pubkey = getPubkeyFromKeypair(solanaKeygen, keypair)

    return {
      authorizedWithdrawerPubkey: pubkey,
      authorizedWithdrawerKeypair: keypair,
      authorizedWithdrawerCreated: false,
      authorizedWithdrawerUsesValidatorIdentity: false,
      authorizedWithdrawerSource: "existing-manual-keypair"
    }
  }

  const pubkey = await promptPubkey("Enter authorized withdrawer pubkey:")

  return {
    authorizedWithdrawerPubkey: pubkey,
    authorizedWithdrawerKeypair: null,
    authorizedWithdrawerCreated: false,
    authorizedWithdrawerUsesValidatorIdentity: false,
    authorizedWithdrawerSource: "existing-manual-pubkey"
  }
}

function buildCreateVoteAccountCommand({
  solanaPath,
  voteKeypair,
  validatorKeypair,
  authorizedWithdrawerKeypair,
  commission = 0,
  rpcUrl = null
}) {
  if (!solanaPath) throw new Error("solanaPath is required")
  if (!voteKeypair) throw new Error("voteKeypair is required")
  if (!validatorKeypair) throw new Error("validatorKeypair is required")
  if (!authorizedWithdrawerKeypair) {
    throw new Error("authorizedWithdrawerKeypair is required to build create-vote-account command")
  }

  const parts = [
    `"${solanaPath}" create-vote-account`,
    `"${voteKeypair}"`,
    `"${validatorKeypair}"`,
    `"${authorizedWithdrawerKeypair}"`,
    `--commission ${commission}`,
    `--fee-payer "${validatorKeypair}"`
  ]

  if (rpcUrl) {
    parts.push(`--url "${rpcUrl}"`)
  }

  return parts.join(" ")
}

async function setupVoteAndWithdrawer({
  solanaKeygen,
  solanaPath,
  rpcUrl = null,
  searchDir = process.cwd(),
  outputDir = searchDir,
  validatorPubkey,
  validatorKeypair,
  commission = 0
}) {

  if (!solanaKeygen) throw new Error("solanaKeygen path is required")
  if (!validatorPubkey) throw new Error("validatorPubkey is required")
  if (!validatorKeypair) throw new Error("validatorKeypair is required")

  const vote = await selectVoteAccount({
    solanaKeygen,
    searchDir,
    outputDir
  })

  const withdrawer = await selectAuthorizedWithdrawer({
    solanaKeygen,
    searchDir,
    outputDir,
    validatorPubkey,
    validatorKeypair
  })

  let createVoteAccountCommand = null
  let createVoteAccountCommandReady = false
  let createVoteAccountCommandReason = null

  if (vote.needsCreateOnChain) {
    if (!withdrawer.authorizedWithdrawerKeypair) {
      createVoteAccountCommandReason =
        "Authorized withdrawer was provided only as pubkey, so automatic create-vote-account command cannot be built from this machine."
      console.log(`${YELLOW}${createVoteAccountCommandReason}${RESET}`)
    } else if (!solanaPath) {
      createVoteAccountCommandReason =
        "solanaPath not provided, so create-vote-account command was not generated."
      console.log(`${YELLOW}${createVoteAccountCommandReason}${RESET}`)
    } else {
     createVoteAccountCommand = buildCreateVoteAccountCommand({
  solanaPath,
  voteKeypair: vote.voteKeypair,
  validatorKeypair,
  authorizedWithdrawerKeypair: withdrawer.authorizedWithdrawerKeypair,
  commission,
  rpcUrl
})

      createVoteAccountCommandReady = true
    }
  }

  return {
    validatorPubkey,
    validatorKeypair,

    votePubkey: vote.votePubkey,
    voteKeypair: vote.voteKeypair,
    needsCreateVoteAccountOnChain: vote.needsCreateOnChain,

    authorizedWithdrawerPubkey: withdrawer.authorizedWithdrawerPubkey,
    authorizedWithdrawerKeypair: withdrawer.authorizedWithdrawerKeypair,
    authorizedWithdrawerCreated: withdrawer.authorizedWithdrawerCreated,
    authorizedWithdrawerUsesValidatorIdentity: withdrawer.authorizedWithdrawerUsesValidatorIdentity,
    authorizedWithdrawerSource: withdrawer.authorizedWithdrawerSource,

    createVoteAccountCommandReady,
    createVoteAccountCommandReason,
    createVoteAccountCommand
  }
}

module.exports = {
  fileExists,
  ensureDir,
  isJsonKeypairFile,
  isLikelyPubkey,
  getPubkeyFromKeypair,
  scanKeypairs,
  scanVoteKeypairs,
  scanWithdrawerKeypairs,
  buildSuggestedVoteKeypairPath,
  buildSuggestedWithdrawerKeypairPath,
  createKeypairFile,
  promptKeypairPath,
  promptPubkey,
  createNewVoteKeypair,
  selectVoteAccount,
  selectAuthorizedWithdrawer,
  buildCreateVoteAccountCommand,
  setupVoteAndWithdrawer
}
