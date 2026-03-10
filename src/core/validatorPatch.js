const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const run = require("../utils/run")

const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const GREEN = "\x1b[32m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

function banner(msg) {
  console.log("")
  console.log("--------------------------------------------------")
  console.log(msg)
  console.log("--------------------------------------------------")
  console.log("")
}

function findFilesRecursive(baseDir, names, maxDepth = 5, depth = 0, found = []) {
  if (!fs.existsSync(baseDir) || depth > maxDepth) return found

  let entries = []
  try {
    entries = fs.readdirSync(baseDir)
  } catch {
    return found
  }

  for (const entry of entries) {
    const full = path.join(baseDir, entry)

    try {
      const stat = fs.statSync(full)

      if (stat.isDirectory()) {
        findFilesRecursive(full, names, maxDepth, depth + 1, found)
      } else if (names.includes(entry)) {
        found.push(full)
      }
    } catch {}
  }

  return found
}

function getManualSnippet(ctx) {
  return [
    `--rewards-merkle-root-authority ${ctx.rewardsAuthority} \\`,
    `--rakurai-activation-program-id ${ctx.programId} \\`,
    `--reward-distribution-program-id ${ctx.rewardProgramId}`
  ].join("\n")
}

function ensureTrailingBackslash(line) {
  if (line.trim().endsWith("\\")) return line
  return `${line} \\`
}

function patchScriptContent(content, ctx) {
  const flags = [
    `    --rewards-merkle-root-authority ${ctx.rewardsAuthority} \\`,
    `    --rakurai-activation-program-id ${ctx.programId} \\`,
    `    --reward-distribution-program-id ${ctx.rewardProgramId}`
  ]

  const alreadyHasAllFlags =
    content.includes(`--rewards-merkle-root-authority ${ctx.rewardsAuthority}`) &&
    content.includes(`--rakurai-activation-program-id ${ctx.programId}`) &&
    content.includes(`--reward-distribution-program-id ${ctx.rewardProgramId}`)

  if (alreadyHasAllFlags) {
    return { content, changed: false }
  }

  const lines = content.split("\n")

  let lastFlagIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith("--")) {
      lastFlagIndex = i
    }
  }

  if (lastFlagIndex === -1) {
    const newContent = content.trimEnd() + "\n\n" + flags.join("\n") + "\n"
    return { content: newContent, changed: true }
  }

  lines[lastFlagIndex] = ensureTrailingBackslash(lines[lastFlagIndex].replace(/[ \t]+$/, ""))

  const before = lines.slice(0, lastFlagIndex + 1)
  const after = lines.slice(lastFlagIndex + 1)
  const newLines = [...before, ...flags, ...after]

  return {
    content: newLines.join("\n"),
    changed: true
  }
}

async function detectSystemdService() {
  const serviceNames = ["solana.service", "sol.service", "validator.service"]

  for (const serviceName of serviceNames) {
    try {
      const output = await run(
        "systemctl",
        ["cat", serviceName],
        { capture: true }
      )

      if (!output || !output.toString().trim()) continue

      const text = output.toString()

      // Busca ExecStart que apunte a script .sh
      const scriptMatch = text.match(/ExecStart=(\S+\.sh)\b/)
      if (scriptMatch && scriptMatch[1]) {
        return {
          found: true,
          serviceName,
          mode: "script",
          scriptPath: scriptMatch[1],
          raw: text
        }
      }

      // Si existe el servicio pero el ExecStart no es script, asumimos inline
      if (/ExecStart=/.test(text)) {
        return {
          found: true,
          serviceName,
          mode: "inline",
          raw: text
        }
      }
    } catch {}
  }

  return { found: false }
}

async function patchValidatorScript(ctx) {
  banner("Patch validator start script automatically?")

  const ans = await inquirer.prompt([
    {
      type: "confirm",
      name: "patch",
      message: `${BOLD}${CYAN}Apply patch?${RESET}`,
      default: true
    }
  ])

  if (!ans.patch) {
    console.log("Skipping validator patch")
    return
  }

  const systemd = await detectSystemdService()

  const candidates = [
    ...findFilesRecursive("/root", ["solana.sh", "validator.sh", "start-validator.sh"], 4),
    ...findFilesRecursive("/home", ["solana.sh", "validator.sh", "start-validator.sh"], 4),
    ...findFilesRecursive("/opt", ["solana.sh", "validator.sh", "start-validator.sh"], 4)
  ]

  const uniqueCandidates = [...new Set(candidates)]
  const choices = []

  if (systemd.found && systemd.mode === "script" && systemd.scriptPath) {
    choices.push({
      name: `Use script from detected systemd service (${systemd.serviceName}): ${systemd.scriptPath}`,
      value: { mode: "script", path: systemd.scriptPath }
    })
  }

  if (systemd.found && systemd.mode === "inline") {
    choices.push({
      name: `Detected ${systemd.serviceName} with inline ExecStart (show manual snippet)`,
      value: { mode: "service-inline", serviceName: systemd.serviceName }
    })
  }

  if (uniqueCandidates.length > 0) {
    for (const file of uniqueCandidates) {
      choices.push({
        name: `Use detected script: ${file}`,
        value: { mode: "script", path: file }
      })
    }
  }

  choices.push(
    {
      name: "Enter script path manually",
      value: { mode: "manual" }
    },
    {
      name: "I use solana.service / systemd service (show manual snippet)",
      value: { mode: "service" }
    },
    {
      name: "Skip patch",
      value: { mode: "skip" }
    }
  )

  const selection = await inquirer.prompt([
    {
      type: "list",
      name: "target",
      message: `${BOLD}${CYAN}Select how to patch validator startup:${RESET}`,
      choices
    }
  ])

  const target = selection.target

  if (target.mode === "skip") {
    console.log("Skipping validator patch")
    return
  }

  if (target.mode === "service" || target.mode === "service-inline") {
    banner("Manual snippet for solana.service / systemd")
    console.log("Add these flags to your validator command manually:")
    console.log("")
    console.log(getManualSnippet(ctx))
    console.log("")
    console.log(`${YELLOW}TIP:${RESET} Inspect the service with:`)
    if (target.serviceName) {
      console.log(`systemctl cat ${target.serviceName}`)
    } else {
      console.log("systemctl cat solana.service")
    }
    console.log("")
    return
  }

  let file = target.path || ""

  if (target.mode === "manual") {
    const manual = await inquirer.prompt([
      {
        type: "input",
        name: "path",
        message: `${BOLD}${CYAN}Enter validator start script path (ENTER = /root/solana.sh):${RESET}`,
        default: "/root/solana.sh"
      }
    ])

    file = manual.path
  }

  if (!file || !fs.existsSync(file)) {
    banner("Manual snippet")
    console.log(`${YELLOW}WARNING:${RESET} Validator script not found.`)
    console.log("Add these flags manually to your validator startup command:")
    console.log("")
    console.log(getManualSnippet(ctx))
    console.log("")
    return
  }

  console.log(`Patching validator script: ${file}`)

  const original = fs.readFileSync(file, "utf8")
  const result = patchScriptContent(original, ctx)

  if (!result.changed) {
    console.log(`${GREEN}OK:${RESET} Rakurai flags already present — skipping patch`)
    return
  }

  fs.writeFileSync(file, result.content)
  console.log(`${GREEN}OK:${RESET} Validator script patched successfully`)
}

module.exports = patchValidatorScript
