const axios = require("axios")
const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const { execSync } = require("child_process")
const run = require("../utils/run")

async function chooseSchedulerVersion(osKey, cluster) {
  console.log("Fetching scheduler versions...")

  const res = await axios.get("https://api.rakurai.io/api/v1/scheduler/versions")
  const all = res.data

  const osEntry = all.find(e => e.os === osKey)

  if (!osEntry) {
    throw new Error(`No scheduler versions for OS ${osKey}`)
  }

  let versions = []

  if (cluster === "mainnet-beta") {
    versions = osEntry.mainnet_and_testnet || []
  } else {
    versions = [
      ...(osEntry.mainnet_and_testnet || []),
      ...(osEntry.testnet_only || [])
    ]
  }

  if (!versions.length) {
    throw new Error("No scheduler versions available")
  }

  const ans = await inquirer.prompt([
    {
      type: "list",
      name: "version",
      message: "Select scheduler version",
      choices: versions.sort().reverse()
    }
  ])

  return ans.version
}

async function downloadScheduler({ repoDir, raaPubkey, signature, version, osKey }) {
  console.log("Downloading scheduler binary")

  const payload = {
    activation_account: raaPubkey,
    signature,
    version,
    os: osKey
  }

  const res = await axios.post(
    "https://api.rakurai.io/api/v1/downloads/scheduler",
    payload,
    { responseType: "arraybuffer" }
  )

  const file = path.join(repoDir, "rakurai-scheduler.tar.gz")

  fs.writeFileSync(file, res.data)

  if (!fs.statSync(file).size) {
    throw new Error("Scheduler download empty")
  }

  return file
}

async function extractScheduler(repoDir) {
  const file = path.join(repoDir, "rakurai-scheduler.tar.gz")

  console.log("Validating archive")

  await run("tar", ["-tzf", file])

  const tmp = path.join(repoDir, "scheduler_extract")

  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp)

  await run("tar", ["-xzf", file, "-C", tmp])

  const files = fs.readdirSync(tmp)
  const lib = files.find(f => f.startsWith("librak") && f.endsWith(".so"))

  if (!lib) {
    throw new Error("Scheduler library not found in archive")
  }

  const src = path.join(tmp, lib)
  const dstDir = path.join(repoDir, "target", "release")

  fs.mkdirSync(dstDir, { recursive: true })

  const dst = path.join(dstDir, lib)

  fs.copyFileSync(src, dst)

  console.log("Scheduler copied:", dst)

  return dst
}

function detectLibclangPath() {
  const searchRoots = [
    "/usr/lib",
    "/usr/local/lib",
    "/usr/lib/x86_64-linux-gnu"
  ]

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue

    try {
      const found = execSync(
        `find "${root}" -type f \$begin:math:text$ \-name \"libclang\.so\" \-o \-name \"libclang\.so\.\*\" \\$end:math:text$ 2>/dev/null | head -n 1`,
        { encoding: "utf8" }
      ).trim()

      if (found) {
        return path.dirname(found)
      }
    } catch {}
  }

  return ""
}

async function buildValidator(repoDir) {
  console.log("Building validator with Rakurai")

  const libclangPath = detectLibclangPath()

  if (libclangPath) {
    console.log("Detected LIBCLANG_PATH:", libclangPath)
  } else {
    console.log("WARNING: libclang shared library not detected")
  }

  await run(
    "cargo",
    ["build", "--release", "--features", "build_validator"],
    {
      cwd: repoDir,
      env: {
        ...process.env,
        ...(libclangPath ? { LIBCLANG_PATH: libclangPath } : {})
      }
    }
  )
}

async function setupScheduler(ctx) {
  const schedulerVersion = await chooseSchedulerVersion(ctx.osKey, ctx.cluster)

  const archive = await downloadScheduler({
    repoDir: ctx.repoDir,
    raaPubkey: ctx.raaPubkey,
    signature: ctx.signature,
    version: schedulerVersion,
    osKey: ctx.osKey
  })

  const schedulerLibrary = await extractScheduler(ctx.repoDir)

  await buildValidator(ctx.repoDir)

  return {
    schedulerVersion,
    archive,
    schedulerLibrary,
    validatorBinary: path.join(ctx.repoDir, "target", "release", "agave-validator")
  }
}

module.exports = setupScheduler
