const readline = require("readline")
const { spawnSync } = require("child_process")

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const GREEN = "\x1b[0;32m"
const YELLOW = "\x1b[0;33m"
const CYAN = "\x1b[0;36m"
const MAG = "\x1b[0;35m"
const BLUE = "\x1b[0;34m"

function cols() {
  return process.stdout.columns || 120
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

function centerColor(raw) {
  const plain = stripAnsi(raw)
  const width = cols()
  const len = plain.length

  if (len >= width) return raw

  const pad = Math.max(0, Math.floor((width - len) / 2))
  return " ".repeat(pad) + raw
}

function centerPlain(text) {
  const width = cols()
  const len = text.length
  const pad = Math.max(0, Math.floor((width - len) / 2))
  return " ".repeat(pad) + text
}

function commandExists(cmd) {
  const res = spawnSync("bash", ["-lc", `command -v ${cmd}`], {
    stdio: "pipe",
    encoding: "utf8"
  })
  return res.status === 0
}

function getBannerAscii() {
  return [
    "██╗      ██████╗ ██╗    ██╗    ███████╗███████╗███████╗",
    "██║     ██╔═══██╗██║    ██║    ██╔════╝██╔════╝██╔════╝",
    "██║     ██║   ██║██║ █╗ ██║    █████╗  █████╗  █████╗  ",
    "██║     ██║   ██║██║███╗██║    ██╔══╝  ██╔══╝  ██╔══╝  ",
    "███████╗╚██████╔╝╚███╔███╔╝    ██║     ███████╗███████╗",
    "╚══════╝ ╚═════╝  ╚══╝╚══╝     ╚═╝     ╚══════╝╚══════╝",
    "",
    "██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗██╗ ██████╗ ███╗   ██╗",
    "██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║",
    "██║   ██║███████║██║     ██║██║  ██║███████║   ██║   ██║██║   ██║██╔██╗ ██║",
    "╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██║██║   ██║██║╚██╗██║",
    " ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║",
    "  ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝"
  ]
}

function bannerLolcat() {
  const ascii = getBannerAscii().map(line => centerPlain(line)).join("\n") + "\n\n" + centerPlain("Created by GPValidator") + "\n"

  const res = spawnSync(
    "bash",
    ["-lc", "lolcat -f -a -d 2 -s 60"],
    {
      input: ascii,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLICOLOR_FORCE: "1",
        FORCE_COLOR: "1",
        TERM: process.env.TERM || "xterm-256color"
      }
    }
  )

  if (res.status === 0 && res.stdout) {
    process.stdout.write(res.stdout)
  } else {
    bannerPlain()
  }
}

function bannerPlain() {
  console.log("")
  console.log(centerColor(`${MAG}${BOLD}██╗      ██████╗ ██╗    ██╗    ███████╗███████╗███████╗${RESET}`))
  console.log(centerColor(`${MAG}${BOLD}██║     ██╔═══██╗██║    ██║    ██╔════╝██╔════╝██╔════╝${RESET}`))
  console.log(centerColor(`${MAG}${BOLD}██║     ██║   ██║██║ █╗ ██║    █████╗  █████╗  █████╗  ${RESET}`))
  console.log(centerColor(`${MAG}${BOLD}██║     ██║   ██║██║███╗██║    ██╔══╝  ██╔══╝  ██╔══╝  ${RESET}`))
  console.log(centerColor(`${CYAN}${BOLD}███████╗╚██████╔╝╚███╔███╔╝    ██║     ███████╗███████╗${RESET}`))
  console.log(centerColor(`${CYAN}${BOLD}╚══════╝ ╚═════╝  ╚══╝╚══╝     ╚═╝     ╚══════╝╚══════╝${RESET}`))
  console.log("")
  console.log(centerColor(`${BLUE}${BOLD}██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗██╗ ██████╗ ███╗   ██╗${RESET}`))
  console.log(centerColor(`${BLUE}${BOLD}██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║${RESET}`))
  console.log(centerColor(`${BLUE}${BOLD}██║   ██║███████║██║     ██║██║  ██║███████║   ██║   ██║██║   ██║██╔██╗ ██║${RESET}`))
  console.log(centerColor(`${BLUE}${BOLD}╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██║██║   ██║██║╚██╗██║${RESET}`))
  console.log(centerColor(`${CYAN}${BOLD} ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║${RESET}`))
  console.log(centerColor(`${CYAN}${BOLD}  ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝${RESET}`))
  console.log("")
  console.log(centerColor(`${DIM}Created by GPValidator${RESET}`))
  console.log("")
}

async function pauseAfterBanner() {
  console.log("")
  console.log(centerColor(`${BOLD}${CYAN}LOW FEE VALIDATION — Rakurai Installer${RESET}`))
  console.log(centerColor(`${DIM}Community script by GPValidator${RESET}`))
  console.log("")
  console.log(centerColor(`${YELLOW}Press ENTER to continue...${RESET}`))

  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rl.question("", () => {
      rl.close()
      resolve()
    })
  })
}

async function banner() {
  console.clear()
  console.log("")

  if (commandExists("lolcat")) {
    bannerLolcat()
  } else {
    bannerPlain()
  }

  await pauseAfterBanner()
}

module.exports = banner
