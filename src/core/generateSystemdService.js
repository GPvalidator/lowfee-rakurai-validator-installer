const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")

const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

async function generateSystemdService(ctx) {
  console.log("")
  console.log("Generating systemd service")
  console.log("")

  const defaultServicePath = "/etc/systemd/system/solana.service"
  const defaultUser = "root"

  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "generate",
      message: `${BOLD}${CYAN}Generate systemd service?${RESET}`,
      default: true
    },
    {
      type: "input",
      name: "servicePath",
      message: `${BOLD}${CYAN}Enter systemd service path:${RESET}`,
      default: defaultServicePath,
      when: answers => answers.generate
    },
    {
      type: "input",
      name: "serviceUser",
      message: `${BOLD}${CYAN}Enter service user:${RESET}`,
      default: defaultUser,
      when: answers => answers.generate
    }
  ])

  if (!answers.generate) {
    console.log("Skipping systemd service generation")
    return null
  }

  const servicePath = answers.servicePath || defaultServicePath
  const serviceUser = answers.serviceUser || defaultUser

  fs.mkdirSync(path.dirname(servicePath), { recursive: true })

const content = `[Unit]
Description=Solana Validator
After=network.target
Wants=network.target

[Service]
Type=simple
User=${serviceUser}

LimitNOFILE=1000000
TasksMax=infinity

Environment=RUST_BACKTRACE=1
Environment=LD_LIBRARY_PATH=${ctx.repoDir}/target/release:/root/rakurai-validator/target/release

ExecStart=${ctx.scriptPath}

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`

  fs.writeFileSync(servicePath, content)
  fs.chmodSync(servicePath, 0o644)

  console.log(`Systemd service created: ${servicePath}`)

  return {
    servicePath,
    serviceUser,
    enableCommand: "systemctl enable solana.service",
    startCommand: "systemctl start solana.service",
    reloadCommand: "systemctl daemon-reload"
  }
}

module.exports = generateSystemdService
