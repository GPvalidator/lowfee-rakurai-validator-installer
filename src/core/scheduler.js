const axios = require("axios")
const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")
const { execSync } = require("child_process")
const run = require("../utils/run")

function extractBaseVersion(rakuraiVersion) {
  // "v3.1.9-rakurai.0" -> "3.1.9"
  const m = rakuraiVersion.match(/v?(\d+\.\d+\.\d+)/)
  return m ? m[1] : null
}

async function chooseSchedulerVersion(osKey, cluster, rakuraiVersion) {
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

  // auto-select: scheduler version MUST match the validator base version
  // e.g. rakuraiVersion "v3.1.9-rakurai.0" -> scheduler must be "v3.1.9-rakurai.*"
  const baseVersion = rakuraiVersion ? extractBaseVersion(rakuraiVersion) : null

  if (baseVersion) {
    const matching = versions.filter(v => extractBaseVersion(v) === baseVersion)

    if (matching.length > 0) {
      // prefer exact match first, then latest
      const exact = matching.find(v => v === rakuraiVersion)
      const selected = exact || matching.sort().reverse()[0]
      console.log(`Scheduler version auto-selected: ${selected} (matches validator v${baseVersion})`)
      return selected
    }

    console.log(`WARNING: No scheduler version found matching validator v${baseVersion}`)
    console.log("Falling back to manual selection...")
  }

  const ans = await inquirer.prompt([
    {
      type: "list",
      name: "version",
      message: "Select scheduler version (pick one matching your validator version!)",
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

function findSoRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findSoRecursive(full)
      if (found) return found
    } else if (entry.name.startsWith("librak") && entry.name.endsWith(".so")) {
      return full
    }
  }
  return null
}

async function extractScheduler(repoDir) {
  const file = path.join(repoDir, "rakurai-scheduler.tar.gz")

  console.log("Validating archive")

  // list contents for debugging
  try {
    const listing = execSync(`tar -tzf "${file}"`, { encoding: "utf8" })
    console.log("Archive contents:", listing.trim())
  } catch {}

  await run("tar", ["-tzf", file])

  const tmp = path.join(repoDir, "scheduler_extract")

  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp)

  await run("tar", ["-xzf", file, "-C", tmp])

  // search flat first, then recursive (in case archive has subdirectories)
  const files = fs.readdirSync(tmp)
  let lib = files.find(f => f.startsWith("librak") && f.endsWith(".so"))
  let src = lib ? path.join(tmp, lib) : null

  if (!src) {
    // recursive search for .so inside nested dirs
    src = findSoRecursive(tmp)
    if (src) {
      lib = path.basename(src)
    }
  }

  if (!src || !lib) {
    console.log("Files found in extract dir:", files)
    throw new Error("Scheduler library not found in archive")
  }

  const dstDir = path.join(repoDir, "target", "release")

  fs.mkdirSync(dstDir, { recursive: true })

  const dst = path.join(dstDir, lib)

  fs.copyFileSync(src, dst)
  fs.chmodSync(dst, 0o755)

  console.log("Scheduler copied:", dst)

  return dst
}

function is64BitElf(filePath) {
  try {
    // ELF64 magic: bytes 4-5 are 02 00 (little-endian class=2 means 64-bit)
    const buf = Buffer.alloc(5)
    const fd = require("fs").openSync(filePath, "r")
    require("fs").readSync(fd, buf, 0, 5, 0)
    require("fs").closeSync(fd)
    return buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46 && buf[4] === 0x02
  } catch {
    return false
  }
}

function detectLibclangPath() {
  // Estrategia 1: buscar libclang*.so* en /usr, excluyendo el subdirectorio
  // de runtime interno de clang (/lib/clang/) que contiene libs 32-bit.
  // Cubre todos los patrones de Ubuntu:
  //   libclang.so, libclang.so.1, libclang-14.so.1, libclang-18.so.1, etc.
  try {
    const allFound = execSync(
      `find /usr -type f -name "libclang*.so*" ! -path "*/lib/clang/*" 2>/dev/null`,
      { encoding: "utf8" }
    ).trim().split("\n").filter(Boolean)

    for (const found of allFound) {
      if (is64BitElf(found)) {
        return path.dirname(found)
      }
    }
  } catch {}

  // Estrategia 2: buscar via ldconfig (si está en el cache del sistema)
  try {
    const ldconfig = execSync(
      `ldconfig -p 2>/dev/null | grep libclang | awk '{print $NF}' | head -n 1`,
      { encoding: "utf8" }
    ).trim()

    if (ldconfig && fs.existsSync(ldconfig)) {
      return path.dirname(ldconfig)
    }
  } catch {}

  // Estrategia 3: buscar directorios llvm conocidos ordenados por versión descendente
  const llvmVersions = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10]
  for (const v of llvmVersions) {
    const candidate = `/usr/lib/llvm-${v}/lib`
    try {
      if (!fs.existsSync(candidate)) continue
      const files = fs.readdirSync(candidate)
      const match = files.find(f => f.startsWith("libclang") && f.includes(".so"))
      if (match) {
        return candidate
      }
    } catch {}
  }

  // Estrategia 4: rutas fijas conocidas para Ubuntu sin versión explícita
  const fallbackPaths = [
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib/aarch64-linux-gnu",
    "/usr/lib64",
    "/usr/lib",
  ]
  for (const dir of fallbackPaths) {
    try {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir)
      const match = files.find(f => f.startsWith("libclang") && f.includes(".so"))
      if (match) {
        return dir
      }
    } catch {}
  }

  return ""
}

function ensureLibclangSymlink(libclangPath) {
  const so = path.join(libclangPath, "libclang.so")

  // Si ya existe libclang.so, no hay nada que hacer
  if (fs.existsSync(so)) return

  try {
    const files = fs.readdirSync(libclangPath)

    // Buscar cualquier libclang*.so* para usar como destino del symlink
    // Priorizar libclang.so.1 si existe, sino el primero que encontremos
    const candidates = files.filter(
      f => f.startsWith("libclang") && f.includes(".so")
    )

    const target = candidates.find(f => f === "libclang.so.1") || candidates[0]

    if (target) {
      console.log(`Creating libclang.so symlink -> ${target}`)
      fs.symlinkSync(target, so)
    }
  } catch (err) {
    console.log("Warning creating libclang symlink:", err.message)
  }
}

function getCargoPath() {
  // ensure we find cargo even if rustup was just installed in this session
  const candidates = [
    process.env.HOME + "/.cargo/bin/cargo",
    "/root/.cargo/bin/cargo"
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return "cargo"
}

async function buildValidator(repoDir) {
  console.log("Building validator with Rakurai")

  const libclangPath = detectLibclangPath()

  if (!libclangPath) {
    throw new Error("libclang shared library not detected")
  }

  console.log("Detected LIBCLANG_PATH:", libclangPath)

  ensureLibclangSymlink(libclangPath)

  const cargoPath = getCargoPath()
  console.log("Using cargo:", cargoPath)

  // ensure PATH includes cargo/rustup binaries
  const cargoDir = path.dirname(cargoPath)
  const envPath = process.env.PATH || ""
  const fullPath = envPath.includes(cargoDir) ? envPath : `${cargoDir}:${envPath}`

  await run(
    cargoPath,
    ["build", "--release", "--features", "build_validator"],
    {
      cwd: repoDir,
      env: {
        ...process.env,
        PATH: fullPath,
        LIBCLANG_PATH: libclangPath
      }
    }
  )
}

async function setupScheduler(ctx) {
  const schedulerVersion = await chooseSchedulerVersion(ctx.osKey, ctx.cluster, ctx.rakuraiVersion)

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
