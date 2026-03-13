const fs = require("fs")
const path = require("path")
const inquirer = require("inquirer")

async function pickDirectory(startDir = "/") {
  let currentDir = startDir

  while (true) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: `📁 ${e.name}`,
        value: path.join(currentDir, e.name)
      }))

    const choices = []

    if (currentDir !== "/") {
      choices.push({
        name: "⬆ .. (go up)",
        value: path.dirname(currentDir)
      })
    }

    dirs.forEach(d => choices.push(d))

    choices.push(new inquirer.Separator())
    choices.push({
      name: `✔ Select this directory (${currentDir})`,
      value: "__SELECT__"
    })

    const { dir } = await inquirer.prompt([
      {
        type: "list",
        name: "dir",
        message: `Choose directory`,
        pageSize: 15,
        choices
      }
    ])

    if (dir === "__SELECT__") {
      return currentDir
    }

    currentDir = dir
  }
}

module.exports = pickDirectory
