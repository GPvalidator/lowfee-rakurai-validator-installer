const inquirer = require("inquirer")

async function chooseInstallMode() {
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "What do you want to do?",
      choices: [
        {
          name: "Install validator from scratch",
          value: "scratch"
        },
        {
          name: "Add Rakurai to existing validator",
          value: "existing"
        },
        {
          name: "Build Rakurai only",
          value: "build"
        }
      ]
    }
  ])

  return answer.mode
}

module.exports = chooseInstallMode
