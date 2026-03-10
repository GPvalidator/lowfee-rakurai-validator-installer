const axios = require("axios")
const inquirer = require("inquirer")

async function chooseRakuraiVersion() {
  console.log("Fetching Rakurai versions from GitHub...")

  const res = await axios.get(
    "https://api.github.com/repos/rakurai-io/rakurai-validator/branches?per_page=100",
    {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "lowfee-rakurai-installer"
      }
    }
  )

  const versions = res.data
    .map(branch => branch.name)
    .filter(name => /^v\d+\.\d+\.\d+-rakurai\.\d+$/.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

  if (!versions.length) {
    throw new Error("No Rakurai versions found from GitHub")
  }

  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "version",
      message: "Select Rakurai version",
      pageSize: 20,
      choices: versions
    }
  ])

  console.log("Rakurai version selected:", answer.version)
  return answer.version
}

module.exports = chooseRakuraiVersion
