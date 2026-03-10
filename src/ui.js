const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const GREEN = "\x1b[32m"

function line() {
  console.log("--------------------------------------------------")
}

function step(icon, title) {
  console.log("")
  line()
  console.log(`${BOLD}${GREEN}${icon}  ${title}${RESET}`)
  line()
}

module.exports = { step }
