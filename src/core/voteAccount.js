const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const run = require("../utils/run")

const CYAN = "\x1b[36m"
const RED = "\x1b[31m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

function findVoteKeypairs() {
  const searchRoots = [process.cwd(), "/root", "/home", "/opt", "/mnt"]
  const candidateNames = [
    "vote-account.json",
    "vote-keypair.json",
    "vote-account-keypair.json"
  ]

  const found = []

  function walk(dir, depth = 0) {
    if (!fs.existsSync(dir) || depth > 6) return

    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry)

      try {
        const stat = fs.statSync(full)

        if (stat.isDirectory()) {
          walk(full, depth + 1)
        } else if (candidateNames.includes(entry)) {
          found.push(full)
        }
      } catch {}
    }
  }

  for (const root of searchRoots) {
    walk(root, 0)
  }

  return [...new Set(found)]
}

async function detectVoteAccount(options = {}) {
  const warningMessage = options.warningMessage || ""

  console.log("Searching for vote keypair files...")

  if (warningMessage) {
    console.log("")
    console.log(`${RED}WARNING:${RESET} ${warningMessage}`)
    console.log("")
  }

  const found = findVoteKeypairs()

  let votePubkey = ""
  let voteKeypair = ""

  if (found.length > 0) {
    const choices = []

    for (const file of found) {
      let pubkey = "unknown"

      try {
        const result = await run(
          "solana-keygen",
          ["pubkey", file],
          { capture: true }
        )

        if (result) {
          pubkey = result.toString().trim()
        }
      } catch {}

      choices.push({
        name: `${file} (${pubkey})`,
        value: { file, pubkey }
      })
    }

    choices.push({
      name: "Enter vote pubkey manually",
      value: "manual"
    })

    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "vote",
        message: `${BOLD}${CYAN}Select vote account:${RESET}`,
        choices
      }
    ])

    if (answer.vote === "manual") {
      const manual = await inquirer.prompt([
        {
          type: "input",
          name: "pubkey",
          message: `${BOLD}${CYAN}Enter vote pubkey:${RESET}`,
          validate: input =>
            input && input.trim().length > 0
              ? true
              : "Vote pubkey cannot be empty"
        }
      ])

      votePubkey = manual.pubkey.trim()
    } else {
      voteKeypair = answer.vote.file
      votePubkey = answer.vote.pubkey
    }
  } else {
    console.log("No vote keypair detected automatically.")

    const manual = await inquirer.prompt([
      {
        type: "input",
        name: "pubkey",
        message: `${BOLD}${CYAN}Enter vote pubkey:${RESET}`,
        validate: input =>
          input && input.trim().length > 0
            ? true
            : "Vote pubkey cannot be empty"
      }
    ])

    votePubkey = manual.pubkey.trim()
  }

  console.log(`Vote account: ${votePubkey}`)

  return {
    votePubkey,
    voteKeypair
  }
}

module.exports = detectVoteAccount
