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

function scanKeypairs(solanaKeygen, searchDir) {

  // Si se pasa searchDir, buscar solo ahí; si no, usar directorios por defecto
  const dirsToSearch = searchDir
    ? [searchDir]
    : [
        "/root",
        "/home",
        "/var/lib/solana",
        "/var/lib",
        "/etc/solana",
        "/opt/solana",
        "/opt"
      ]

  let files = []

  for (const dir of dirsToSearch) {
    if (!fs.existsSync(dir)) continue
    try {
      const out = execSync(
        `find "${dir}" -maxdepth 5 -type f -name "*.json" 2>/dev/null`,
        {
          encoding: "utf8",
          maxBuffer: 100 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"]
        }
      )
      if (out) {
        files.push(...out.split("\n").map(x => x.trim()).filter(Boolean))
      }
    } catch {}
  }

  files = [...new Set(files)]

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

function scanVoteKeypairs(solanaKeygen, searchDir) {

  const keypairs = scanKeypairs(solanaKeygen, searchDir) || []

  return keypairs.filter(item => {

    if (!item || !item.name) return false

    const lower = item.name.toLowerCase()

    return (
      lower.includes("vote") ||
      lower.includes("validator-vote") ||
      lower.includes("vote-account")
    )

  })

}

function scanWithdrawerKeypairs(solanaKeygen, searchDir) {

  return scanKeypairs(solanaKeygen, searchDir).filter(item => {

    const lower = item.name.toLowerCase()

    return (
      lower.includes("withdrawer") ||
      lower.includes("authorized-withdrawer") ||
      lower.includes("withdraw")
    )

  })

}

function buildCreateVoteAccountCommand({
  solanaPath,
  voteKeypair,
  validatorKeypair,
  authorizedWithdrawerKeypair,
  commission = 0,
  rpcUrl
}) {
  return [
    `"${solanaPath}"`,
    "create-vote-account",
    `"${voteKeypair}"`,
    `"${validatorKeypair}"`,
    `"${authorizedWithdrawerKeypair}"`,
    `--commission ${commission}`,
    `--url "${rpcUrl}"`,
    `--keypair "${validatorKeypair}"`
  ].join(" ")
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

async function createNewVoteKeypair(solanaKeygen, outputDir) {

  const baseDir = outputDir || SOLANA_DATA_DIR
  ensureDir(baseDir)

  const defaultPath = path.join(baseDir, "vote-account-keypair.json")

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

  const created = createKeypairFile(solanaKeygen, destination.trim())

  console.log(`${GREEN}Created vote account keypair:${RESET} ${created.file}`)
  console.log(`${GREEN}Vote account pubkey:${RESET} ${created.pubkey}`)

  return {
    votePubkey: created.pubkey,
    voteKeypair: created.file,
    needsCreateOnChain: true
  }

}

async function selectVoteAccount({ solanaKeygen, searchDir, outputDir }) {

  const detectedVotes = scanVoteKeypairs(solanaKeygen, searchDir)

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

    const votePubkey = await promptPubkey("Enter vote account pubkey:")

    return {
      votePubkey,
      voteKeypair: null,
      needsCreateOnChain: false
    }

  }

  if (vote.mode === "manual-keypair") {

    const voteKeypair = await promptKeypairPath("Enter vote account keypair path:")
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
  searchDir,
  outputDir,
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

    const baseDir = outputDir || SOLANA_DATA_DIR
    ensureDir(baseDir)

    const defaultPath = path.join(baseDir, "authorized-withdrawer-keypair.json")

    const { destination } = await inquirer.prompt([
      {
        type: "input",
        name: "destination",
        default: defaultPath,
        message: `${BOLD}${CYAN}Path to save new authorized withdrawer keypair:${RESET}`
      }
    ])

    const created = createKeypairFile(solanaKeygen, destination.trim())

    console.log(`${GREEN}Created withdrawer keypair:${RESET} ${created.file}`)
    console.log(`${GREEN}Withdrawer pubkey:${RESET} ${created.pubkey}`)

    return {
      authorizedWithdrawerPubkey: created.pubkey,
      authorizedWithdrawerKeypair: created.file,
      authorizedWithdrawerCreated: true
    }

  }

  const detected = scanWithdrawerKeypairs(solanaKeygen, searchDir)

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

    const keypair = await promptKeypairPath("Enter withdrawer keypair path:")
    const pubkey = getPubkeyFromKeypair(solanaKeygen, keypair)

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

async function setupVoteAndWithdrawer({
  solanaKeygen,
  solanaPath,
  rpcUrl,
  searchDir,
  outputDir,
  validatorPubkey,
  validatorKeypair,
  commission = 0
}) {

  const vote = await selectVoteAccount({
    solanaKeygen,
    searchDir,
    outputDir
  })

  // Cuenta existente, no necesita crearse on-chain
  if (!vote.needsCreateOnChain) {
    return {
      votePubkey: vote.votePubkey,
      voteKeypair: vote.voteKeypair,
      authorizedWithdrawerPubkey: null,
      authorizedWithdrawerKeypair: null,
      createVoteAccountCommandReady: false,
      needsCreateVoteAccountOnChain: false
    }
  }

  // Nueva keypair: pedir withdrawer y construir comando on-chain
  const withdrawer = await selectAuthorizedWithdrawer({
    solanaKeygen,
    searchDir,
    outputDir,
    validatorPubkey,
    validatorKeypair
  })

  if (!withdrawer.authorizedWithdrawerKeypair) {
    return {
      votePubkey: vote.votePubkey,
      voteKeypair: vote.voteKeypair,
      authorizedWithdrawerPubkey: withdrawer.authorizedWithdrawerPubkey,
      authorizedWithdrawerKeypair: null,
      createVoteAccountCommandReady: false,
      needsCreateVoteAccountOnChain: true,
      createVoteAccountCommandReason:
        "Creating a new vote account on-chain requires an authorized withdrawer keypair file."
    }
  }

  const createVoteAccountCommand = buildCreateVoteAccountCommand({
    solanaPath,
    voteKeypair: vote.voteKeypair,
    validatorKeypair,
    authorizedWithdrawerKeypair: withdrawer.authorizedWithdrawerKeypair,
    commission,
    rpcUrl
  })

  return {
    votePubkey: vote.votePubkey,
    voteKeypair: vote.voteKeypair,
    authorizedWithdrawerPubkey: withdrawer.authorizedWithdrawerPubkey,
    authorizedWithdrawerKeypair: withdrawer.authorizedWithdrawerKeypair,
    createVoteAccountCommandReady: true,
    createVoteAccountCommand,
    needsCreateVoteAccountOnChain: true
  }

}

module.exports = {
  selectVoteAccount,
  selectAuthorizedWithdrawer,
  setupVoteAndWithdrawer,
  buildCreateVoteAccountCommand
}
