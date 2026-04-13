const fs = require("fs")
const run = require("../utils/run")
const { execSync } = require("child_process")

function applySysctlTuning() {
  console.log("Applying Solana network tuning (sysctl)...")

  const tuning = [
    "net.core.rmem_default=134217728",
    "net.core.rmem_max=134217728",
    "net.core.wmem_default=134217728",
    "net.core.wmem_max=134217728",
    "vm.max_map_count=1000000",
    "fs.nr_open=1000000",
    "net.core.optmem_max=134217728"
  ]

  const confPath = "/etc/sysctl.d/21-solana-validator.conf"
  const content = tuning.join("\n") + "\n"

  try {
    fs.writeFileSync(confPath, content)
    execSync("sysctl -p " + confPath, { stdio: "inherit" })
    console.log("Sysctl tuning applied:", confPath)
  } catch (err) {
    console.log("Warning: sysctl tuning failed:", err.message)
    console.log("You may need to apply these settings manually:")
    for (const line of tuning) {
      console.log("  sysctl -w", line)
    }
  }
}

async function installDeps() {

  console.log("Installing dependencies...")

  // fix broken dpkg state if needed
  try {
    execSync("DEBIAN_FRONTEND=noninteractive dpkg --configure -a", { stdio: "inherit" })
  } catch {}

  await run("apt-get", ["update", "-y"])

  await run("apt-get", [
    "install", "-y",
    "curl",
    "jq",
    "git",
    "build-essential",
    "pkg-config",
    "libssl-dev",
    "libudev-dev",
    "libclang-dev",
    "llvm",
    "clang",
    "make",
    "cmake",
    "gcc",
    "g++",
    "tar",
    "unzip",
    "ca-certificates",
    "protobuf-compiler"
  ])

  applySysctlTuning()

}

module.exports = installDeps
