const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findInPath(name) {
  try {
    const result = execFileSync("bash", ["-lc", `command -v ${name}`], {
      encoding: "utf8"
    }).trim()

    if (result && fs.existsSync(result)) {
      return result
    }
  } catch {}

  return null
}

function searchCommonLocations(name) {
  const homes = ["/root", "/home", "/Users"]
  const candidates = []

  for (const homeBase of homes) {
    if (!fs.existsSync(homeBase)) continue

    try {
      const entries = fs.readdirSync(homeBase)
      for (const entry of entries) {
        const base =
          homeBase === "/root"
            ? "/root"
            : path.join(homeBase, entry)

        candidates.push(
          path.join(base, ".local/share/solana/install/active_release/bin", name),
          path.join(base, ".local/share/solana/install/releases/stable/bin", name),
          path.join(base, "solana", "bin", name)
        )
      }
    } catch {}
  }

  for (const file of candidates) {
    if (fs.existsSync(file) && isExecutable(file)) {
      return file
    }
  }

  return null
}

function findByWalking(name) {
  const roots = ["/root", "/home", "/opt", "/usr/local", "/usr/bin"]
  const maxDepth = 6

  function walk(dir, depth = 0) {
    if (depth > maxDepth) return null

    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return null
    }

    for (const entry of entries) {
      const full = path.join(dir, entry)

      try {
        const stat = fs.statSync(full)

        if (stat.isDirectory()) {
          const found = walk(full, depth + 1)
          if (found) return found
        } else if (entry === name && isExecutable(full)) {
          return full
        }
      } catch {}
    }

    return null
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const found = walk(root, 0)
    if (found) return found
  }

  return null
}

function getSolanaBinary(name) {
  const fromPath = findInPath(name)
  if (fromPath) return fromPath

  const fromCommon = searchCommonLocations(name)
  if (fromCommon) return fromCommon

  const fromWalk = findByWalking(name)
  if (fromWalk) return fromWalk

  return name
}

module.exports = getSolanaBinary
