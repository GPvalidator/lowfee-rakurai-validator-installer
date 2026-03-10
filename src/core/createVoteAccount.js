const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const run = require("../utils/run")

const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const MIN_VOTE_BALANCE = 0.03

function extractSeedPhrase(output) {
  const match = output
    ? output.toString().match(/recover your new keypair:\s*([\s\S]*?)=+/i)
    : null

  if (match && match[1]) {
    return match[1].replace(/\n/g, " ").trim()
  }

  return ""
}

async function getBalance(pubkey, rpcUrl) {
  const balanceOut = await run(
    "solana",
    ["balance", pubkey, "--url", rpcUrl],
    { capture: true }
  )

  const text = balanceOut.toString().trim()
  const match = text.match(/([0-9.]+)/)
  return match ? Number(match[1]) : 0
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForFunding(pubkey, rpcUrl) {
  console.log("")
  console.log(`${YELLOW}WARNING:${RESET} Insufficient SOL to create the vote account.`)
  console.log(`Minimum required: ${MIN_VOTE_BALANCE} SOL`)
  console.log("")
  console.log(`Send at least ${MIN_VOTE_BALANCE} SOL to continue:`)
  console.log(pubkey)
  console.log("")
  console.log("Waiting for funds... checking every 5 seconds.")
  console.log("")

  while (true) {
    const balance = await getBalance(pubkey, rpcUrl)
    console.log(`Current balance: ${balance} SOL`)

    if (balance >= MIN_VOTE_BALANCE) {
      console.log("Sufficient balance detected. Continuing...")
      console.log("")
      return balance
    }

    await sleep(5000)
  }
}

async function createVoteAccount(ctx) {
  console.log("")
  console.log("Creating vote account keypair")
  console.log(`${YELLOW}NOTE:${RESET} this will also create the vote account on-chain.`)
  console.log(`${YELLOW}NOTE:${RESET} the validator identity will be used as fee payer by default.`)
  console.log("")

  const dataDir = path.join(process.cwd(), "data")
  const recoveryDir = path.join(dataDir, "recovery")
  const defaultVoteKeypairPath = path.join(dataDir, "vote-account-keypair.json")
  const defaultSeedPath = path.join(recoveryDir, "vote-account-seed.txt")

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(recoveryDir, { recursive: true })

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "voteKeypairPath",
      message: `${BOLD}${CYAN}Enter output path for vote account keypair (ENTER = default path):${RESET}`,
      default: defaultVoteKeypairPath
    }
  ])

  const voteKeypairPath = answers.voteKeypairPath || defaultVoteKeypairPath
  fs.mkdirSync(path.dirname(voteKeypairPath), { recursive: true })

  const output = await run(
    "solana-keygen",
    [
      "new",
      "--no-bip39-passphrase",
      "--outfile",
      voteKeypairPath,
      "--force"
    ],
    { capture: true }
  )

  if (!fs.existsSync(voteKeypairPath)) {
    throw new Error(`Failed to create vote account keypair: ${voteKeypairPath}`)
  }

  fs.chmodSync(voteKeypairPath, 0o600)

  const votePubkey = (await run(
    "solana-keygen",
    ["pubkey", voteKeypairPath],
    { capture: true }
  )).toString().trim()

  const seedPhrase = extractSeedPhrase(output)

  const seedContent = [
    "LOW FEE VALIDATION — VOTE ACCOUNT RECOVERY",
    `Created: ${new Date().toISOString()}`,
    `Keypair path: ${voteKeypairPath}`,
    `Pubkey: ${votePubkey}`,
    "",
    "SEED PHRASE:",
    seedPhrase || "(Could not parse seed phrase automatically from solana-keygen output)",
    ""
  ].join("\n")

  fs.writeFileSync(defaultSeedPath, seedContent, { mode: 0o600 })
  fs.chmodSync(defaultSeedPath, 0o600)

  console.log(`Vote keypair created: ${votePubkey}`)
  console.log(`Recovery seed saved to: ${defaultSeedPath}`)
  console.log("")
  console.log("Creating vote account on-chain...")

  const validatorPubkey = (await run(
    "solana-keygen",
    ["pubkey", ctx.validatorKeypair],
    { capture: true }
  )).toString().trim()

  const createArgs = [
    "create-vote-account",
    voteKeypairPath,
    ctx.validatorKeypair,
    ctx.withdrawerKeypair,
    "--keypair",
    ctx.validatorKeypair,
    "--url",
    ctx.rpcUrl
  ]

  while (true) {
    try {
      await run("solana", createArgs, { capture: true })
      break
    } catch (err) {
      const msg = String(err?.stderr || err?.message || "")

      if (/insufficient funds|No default signer found/i.test(msg)) {
        await waitForFunding(validatorPubkey, ctx.rpcUrl)
        continue
      }

      throw err
    }
  }

  console.log(`Vote account created on-chain: ${votePubkey}`)

  return {
    voteKeypair: voteKeypairPath,
    votePubkey,
    voteSeedPath: defaultSeedPath
  }
}

module.exports = createVoteAccount
