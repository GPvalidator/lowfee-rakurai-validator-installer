const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")
const run = require("../utils/run")

const WORKDIR = "/opt/lowfee-rakurai"
const REPO = path.join(WORKDIR, "rakurai-validator")

function normalizeReleaseBranch(version) {
  if (!version) {
    throw new Error("Rakurai version is required")
  }

  if (version.startsWith("release/")) {
    return version
  }

  return `release/${version}`
}

function findRakuraiActivationBinary(repoDir) {
  const candidates = [
    path.join(repoDir, "rakurai_programs", "release", "downloads", "rakurai-activation"),
    path.join(repoDir, "target", "release", "rakurai-activation")
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const found = execSync(
      `find "${repoDir}" -type f -name "rakurai-activation" 2>/dev/null | head -n 1`,
      { encoding: "utf8" }
    ).trim()

    if (found && fs.existsSync(found)) {
      return found
    }
  } catch {}

  return ""
}

async function setupRakuraiRepo(version) {
  console.log("Preparing Rakurai repository")

  if (!fs.existsSync(WORKDIR)) {
    fs.mkdirSync(WORKDIR, { recursive: true })
  }

  const releaseBranch = normalizeReleaseBranch(version)

  if (fs.existsSync(path.join(REPO, ".git"))) {
    console.log("Repository already exists → updating")

    await run("git", ["fetch", "--all", "--tags"], { cwd: REPO })

    // clean local build changes first
    await run("git", ["reset", "--hard"], { cwd: REPO })
    await run("git", ["clean", "-fdx"], { cwd: REPO })

    await run("git", ["checkout", "-f", "main"], { cwd: REPO })
    await run("git", ["reset", "--hard", "origin/main"], { cwd: REPO })
    await run("git", ["clean", "-fdx"], { cwd: REPO })
  } else {
    console.log("Cloning Rakurai repository")

    await run("git", [
      "clone",
      "--recurse-submodules",
      "https://github.com/rakurai-io/rakurai-validator.git",
      REPO
    ])
  }

  console.log("Checking out release branch:", releaseBranch)

  await run("git", ["fetch", "--all", "--tags"], { cwd: REPO })
  await run("git", ["checkout", "-f", releaseBranch], { cwd: REPO })
  await run("git", ["reset", "--hard"], { cwd: REPO })
  await run("git", ["clean", "-fdx"], { cwd: REPO })

  try {
    await run("git", ["rm", "--cached", "core/src/banking_stage/rakurai_scheduler"], { cwd: REPO })
  } catch {
    // ignore if path not present
  }

  // clean submodules completely
  try {
    await run("git", ["submodule", "foreach", "--recursive", "git", "reset", "--hard"], { cwd: REPO })
  } catch {}

  try {
    await run("git", ["submodule", "foreach", "--recursive", "git", "clean", "-fdx"], { cwd: REPO })
  } catch {}

  await run("git", ["submodule", "sync", "--recursive"], { cwd: REPO })
  await run("git", ["submodule", "update", "--init", "--recursive"], { cwd: REPO })

  const rakuraiActivationBinary = findRakuraiActivationBinary(REPO)

  console.log("Rakurai repository ready:", REPO)

  if (!rakuraiActivationBinary) {
    console.log("")
    console.log("Expected Rakurai CLI binary was not found anywhere inside the repo.")
    console.log("Repo searched:", REPO)
    console.log("")
    throw new Error(
      "Rakurai CLI setup failed. rakurai-activation was not found after clone/checkout/submodule update."
    )
  }

  try {
    fs.chmodSync(rakuraiActivationBinary, 0o755)
  } catch {}

  console.log("Found rakurai-activation binary:", rakuraiActivationBinary)

  return REPO
}

module.exports = setupRakuraiRepo
