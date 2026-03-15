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
  // Estrategia 1: buscar cualquier archivo libclang*.so* en /usr
  // Cubre todos los patrones de Ubuntu:
  //   libclang.so, libclang.so.1, libclang-14.so.1, libclang-18.so.1, etc.
  try {
    const found = execSync(
      `find /usr -type f -name "libclang*.so*" 2>/dev/null | head -n 1`,
      { encoding: "utf8" }
    ).trim()

    if (found) {
      return path.dirname(found)
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

async function buildValidator(repoDir) {
  console.log("Building validator with Rakurai")

  const libclangPath = detectLibclangPath()

  if (!libclangPath) {
    throw new Error("libclang shared library not detected")
  }

  console.log("Detected LIBCLANG_PATH:", libclangPath)

  ensureLibclangSymlink(libclangPath)

  await run(
    "cargo",
    ["build", "--release", "--features", "build_validator"],
    {
      cwd: repoDir,
      env: {
        ...process.env,
        LIBCLANG_PATH: libclangPath
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
