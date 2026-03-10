const run = require("../utils/run")

async function installRust(){

  try{
    await run("rustc",["--version"])
    console.log("Rust already installed")
  }
  catch{

    console.log("Installing Rust")

    await run("bash",[
      "-c",
      "curl https://sh.rustup.rs -sSf | sh -s -- -y"
    ])

  }

}

module.exports = installRust
