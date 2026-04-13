const { execSync } = require("child_process")
const run = require("../utils/run")

function getCurrentRustVersion() {
  try {
    const out = execSync("rustc --version", { encoding: "utf8" }).trim()
    const match = out.match(/rustc (\d+\.\d+\.\d+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

async function installRust() {
  const MINIMUM_RUST = "1.86.0"
  const current = getCurrentRustVersion()

  if (current && compareVersions(current, MINIMUM_RUST) >= 0) {
    console.log(`Rust ${current} already installed (>= ${MINIMUM_RUST})`)
    return
  }

  if (current) {
    console.log(`Rust ${current} is too old (need >= ${MINIMUM_RUST}). Updating...`)
  } else {
    console.log("Rust not found. Installing...")
  }

  await run("bash", [
    "-c",
    "curl https://sh.rustup.rs -sSf | sh -s -- -y"
  ])

  // source cargo env for current process
  try {
    const cargoEnv = execSync("bash -lc 'echo $PATH'", { encoding: "utf8" }).trim()
    process.env.PATH = cargoEnv
  } catch {}

  // install specific version if needed
  try {
    execSync(`bash -lc "rustup install ${MINIMUM_RUST} && rustup default ${MINIMUM_RUST}"`, {
      stdio: "inherit"
    })
  } catch (err) {
    console.log("Warning: could not set Rust version:", err.message)
  }

  const updated = getCurrentRustVersion()
  console.log("Rust version:", updated || "unknown")
}

module.exports = installRust
