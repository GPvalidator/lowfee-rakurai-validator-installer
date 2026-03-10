const fs = require("fs")

async function detectOS(){

  const data = fs.readFileSync("/etc/os-release","utf8")

  if(data.includes("22.04")){
    console.log("Detected Ubuntu 22.04")

    return {
      osKey: "ubuntu_22.04"
    }
  }

  if(data.includes("24.04")){
    console.log("Detected Ubuntu 24.04")

    return {
      osKey: "ubuntu_24.04"
    }
  }

  throw new Error("Unsupported OS")
}

module.exports = detectOS
