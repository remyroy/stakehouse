import { groupId, copyFile } from "./BashUtils";
import { executeCommandStream } from "./ExecuteCommand";

import fs from "fs";
import os from "os";

const ASKPASS_PATH = "src/scripts/askpass.sh";

const APT_UPDATE_CMD = "sudo apt update -y";
const APT_INSTALL_PREREQUISITES_CMD = "sudo apt install -y docker docker-compose git";
const ENABLE_DOCKER_SERVICE_CMD = "sudo systemctl enable --now docker";
const ADD_USER_DOCKER_GROUP_CMD = "sudo usermod -aG docker $USER";
const CLONE_ETH_DOCKER_CMD = "git clone https://github.com/eth2-educators/eth-docker.git ~/.eth-docker";
const ETH_DOCKER_PULL_CMD = "cd ~/.eth-docker && git pull";
const DEFAULT_ENV_FILE = "~/.eth-docker/default.env";
const LIVE_ENV_FILE = "~/.eth-docker/.env";
const BUILDING_CLIENTS_CMD = "cd ~/.eth-docker && docker-compose build --pull";

type Callback = (success: boolean) => void;
type StdoutCallback = (text: string[]) => void;

const initWithPrerequisites = async (callback: Callback, stdoutCallback: StdoutCallback) => {
  const consoleMessages: string[] = [];
  const internalStdoutCallback = (text: string) => {
    consoleMessages.push(text);
    stdoutCallback(consoleMessages);
  }

  // cache sudo credentials to be used for install later
  const passwordRc = await executeCommandStream("export SUDO_ASKPASS='" + ASKPASS_PATH + "' && sudo -A echo 'Authentication successful.'", internalStdoutCallback);
  if (passwordRc != 0) {
    console.log("password failed");
    callback(false);
    return;
  }

  // TODO: Test if each command was done already before doing it

  const cliAptUpdate = await executeCommandStream(APT_UPDATE_CMD, internalStdoutCallback);
  if (cliAptUpdate != 0) {
    console.log("apt update failed");
    callback(false);
    return;
  }

  const cliAptInstall = await executeCommandStream(APT_INSTALL_PREREQUISITES_CMD, internalStdoutCallback);
  if (cliAptInstall != 0) {
    console.log("apt install prerequisites failed");
    callback(false);
    return;
  }

  const cliEnableDockerService = await executeCommandStream(ENABLE_DOCKER_SERVICE_CMD, internalStdoutCallback);
  if (cliEnableDockerService != 0) {
    console.log("enable docker service failed");
    callback(false);
    return;
  }

  const cliAddUserDockerGroup = await executeCommandStream(ADD_USER_DOCKER_GROUP_CMD, internalStdoutCallback);
  if (cliAddUserDockerGroup != 0) {
    console.log("add user to docker group failed");
    callback(false);
    return;
  }

  // TODO: Check if eth-docker is already installed/pulled
  const cliCloneEthDocker = await executeCommandStream(CLONE_ETH_DOCKER_CMD, internalStdoutCallback);

  const cliEthDockerPull = await executeCommandStream(ETH_DOCKER_PULL_CMD, internalStdoutCallback);
  if (cliEthDockerPull != 0) {
    console.log("eth-docker pull failed");
    callback(false);
    return;
  }

  callback(true);

}

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const installClients = async (callback: Callback, stdoutCallback: StdoutCallback, config: Object) => {
  // Config has be a collection of key-value from https://github.com/eth2-educators/eth-docker/blob/main/default.env
  // It will be merged with the default values from that file so no need to specify them all

  const consoleMessages: string[] = [];
  const internalStdoutCallback = (text: string) => {
    consoleMessages.push(text);
    stdoutCallback(consoleMessages);
  }

  // Copy default.env to .env
  if (!copyFile(DEFAULT_ENV_FILE, LIVE_ENV_FILE)) {
    console.log("Cannot copy environment file");
    callback(false);
    return;
  }

  // Update default environment file with config passed here
  try {
    const expanded_live_env_file = LIVE_ENV_FILE.replace("~", os.homedir());
    let envData = fs.readFileSync(expanded_live_env_file, 'utf8');

    // Replace all key=value from config in envData
    for (const [key, value] of Object.entries(config)) {
      const kvRegex = new RegExp(escapeRegExp(key) + "=.+");
      envData = envData.replace(kvRegex, key + "=" + value);
    }

    fs.writeFileSync(expanded_live_env_file, envData);

  } catch (err) {
    console.log("Failed to read/write environment file");
    callback(false);
    return;
  }

  // Building the clients
  const cliBuildingClients = await executeCommandStream(BUILDING_CLIENTS_CMD, internalStdoutCallback);
  if (cliBuildingClients != 0) {
    console.log("building clients failed");
    callback(false);
    return;
  }

  callback(true);
}

export {
  initWithPrerequisites,
  installClients
}
