import sudo from 'sudo-prompt';

import { commandJoin } from "command-join";
import { generate as generate_password } from "generate-password";

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { withDir } from 'tmp-promise';

import { open, rm, mkdir } from 'fs/promises';

import path from 'path';
import os from 'os';

import {
  ExecutionClient,
  ConsensusClient,
  IMultiClientInstaller,
  NodeStatus,
  ValidatorStatus,
  InstallDetails,
  OutputLogs
} from "./IMultiClientInstaller";
import { Network, networkToExecution } from '../react/types';
import { doesFileExist, doesDirectoryExist } from './BashUtils';

const execFileProm = promisify(execFile);
const execProm = promisify(exec);

const dockerServiceName = 'docker.service';
const dockerGroupName = 'docker';
const installPath = path.join(os.homedir(), '.wagyu-installer');
const ethDockerGitRepository = 'https://github.com/eth-educators/eth-docker.git';
const prysmWalletPasswordFileName = 'prysm-wallet-password';

type SystemdServiceDetails = {
  description: string | undefined;
  loadState: string | undefined;
  activeState: string | undefined;
  subState: string | undefined;
  unitFileState: string | undefined;
}

const writeOutput = (message: string, outputLogs?: OutputLogs): void => {
  if (outputLogs) {
    outputLogs(message);
  }
};

export class EthDockerInstaller implements IMultiClientInstaller {

  title = 'Electron';

  async preInstall(outputLogs?: OutputLogs): Promise<boolean> {

    let packagesToInstall = new Array<string>();

    // We need git installed
    const gitPackageName = 'git';

    writeOutput(`Checking if ${gitPackageName} is installed.`, outputLogs);
    const gitInstalled = await this.checkForInstalledUbuntuPackage(gitPackageName);
    if (!gitInstalled) {
      writeOutput(`${gitPackageName} is not installed. We will install it.`, outputLogs);
      packagesToInstall.push(gitPackageName);
    } else {
      writeOutput(`${gitPackageName} is already installed. We will not install it.`, outputLogs);
    }

    // We need docker installed, enabled and running
    const dockerPackageName = 'docker-compose';
    let needToEnableDockerService = true;
    let needToStartDockerService = false;

    writeOutput(`Checking if ${dockerPackageName} is installed.`, outputLogs);
    const dockerInstalled = await this.checkForInstalledUbuntuPackage(dockerPackageName);
    if (!dockerInstalled) {
      writeOutput(`${dockerPackageName} is not installed. We will install it.`, outputLogs);
      packagesToInstall.push(dockerPackageName);
    } else {
      writeOutput(`${dockerPackageName} is already installed. We will not install it.`, outputLogs);

      writeOutput(`Checking if we need to enable or start the ${dockerServiceName} service.`, outputLogs);
      const dockerServiceDetails = await this.getSystemdServiceDetails(dockerServiceName);
      needToEnableDockerService = dockerServiceDetails.unitFileState != 'enabled';
      if (needToEnableDockerService) {
        writeOutput(`The ${dockerServiceName} service is not enabled. We will enable it.`, outputLogs);
      }
      needToStartDockerService = dockerServiceDetails.subState != 'running';
      if (needToStartDockerService) {
        writeOutput(`The ${dockerServiceName} service is not started. We will start it.`, outputLogs);
      }
    }

    // We need our user to be in docker group
    writeOutput(`Checking if current user is in ${dockerGroupName} group.`, outputLogs);
    const needUserInDockerGroup = !await this.isUserInGroup(dockerGroupName);
    if (needUserInDockerGroup) {
      writeOutput(`Current user is not in ${dockerGroupName} group. We will add it.`, outputLogs);
    }

    // We need our installPath directory
    writeOutput(`Creating install directory in ${installPath}.`, outputLogs);
    await mkdir(installPath, { recursive: true });

    return await this.preInstallAdminScript(
      packagesToInstall,
      needUserInDockerGroup,
      needToEnableDockerService,
      needToStartDockerService,
      outputLogs);
  }

  async getSystemdServiceDetails(serviceName: string): Promise<SystemdServiceDetails> {
    let resultValue: SystemdServiceDetails = {
      description: undefined,
      loadState: undefined,
      activeState: undefined,
      subState: undefined,
      unitFileState: undefined
    };

    const properties = ['Description', 'LoadState', 'ActiveState', 'SubState', 'UnitFileState'];

    const { stdout, stderr } = await execFileProm('systemctl',
      ['show', serviceName, '--property=' + properties.join(',')]);

    const lines = stdout.split('\n');
    const lineRegex = /(?<key>[^=]+)=(?<value>.*)/;
    for (const line of lines) {
      const found = line.match(lineRegex);
      if (found) {
        const key = found.groups?.key;
        const value = found.groups?.value.trim();

        switch (key) {
          case "Description":
            resultValue.description = value;
            break;
          case "LoadState":
            resultValue.loadState = value;
            break;
          case "ActiveState":
            resultValue.activeState = value;
            break;
          case "SubState":
            resultValue.subState = value;
            break;
          case "UnitFileState":
            resultValue.unitFileState = value;
            break;
        }
      }
    }

    return resultValue;
  }

  async preInstallAdminScript(
    packagesToInstall: Array<string>,
    needUserInDockerGroup: boolean,
    needToEnableDockerService: boolean,
    needToStartDockerService: boolean,
    outputLogs?: OutputLogs): Promise<boolean> {

    if (
      packagesToInstall.length > 0 ||
      needUserInDockerGroup ||
      needToEnableDockerService ||
      needToStartDockerService
    ) {
      // We need to perform some admin commands.
      // Create script and execute it with sudo. This will minimize the amount of password prompts.

      let commandResult = false;

      await withDir(async dirResult => {

        const scriptPath = path.join(dirResult.path, 'commands.sh');
        let scriptContent = '';

        const scriptFile = await open(scriptPath, 'w');
        await scriptFile.write('#!/bin/bash\n');

        // Install APT packages
        if (packagesToInstall.length > 0) {
          const aptUpdate = 'apt -y update\n';
          const aptInstall = 'apt -y install ' + commandJoin(packagesToInstall) + '\n';

          scriptContent += aptUpdate + aptInstall;

          await scriptFile.write(aptUpdate);
          await scriptFile.write(aptInstall);
        }

        // Enable docker service
        if (needToEnableDockerService) {
          const systemctlEnable = 'systemctl enable --now ' + commandJoin([dockerServiceName]) + '\n';

          scriptContent += systemctlEnable;

          await scriptFile.write(systemctlEnable);
        }

        // Start docker service
        if (needToStartDockerService) {
          const systemctlStart = 'systemctl start ' + commandJoin([dockerServiceName]) + '\n';

          scriptContent += systemctlStart;

          await scriptFile.write(systemctlStart);
        }

        // Add user in docker group
        if (needUserInDockerGroup) {
          const userName = await this.getUsername();
          const usermodUser = `usermod -aG ${dockerGroupName} ${userName}\n`;

          scriptContent += usermodUser;

          await scriptFile.write(usermodUser);
        }

        await scriptFile.chmod(0o500);
        await scriptFile.close();

        writeOutput(`Running script ${scriptPath} with the following content as root:\n${scriptContent}`, outputLogs);

        const promise = new Promise<boolean>(async (resolve, reject) => {
          const options = {
            name: this.title
          };
          try {
            sudo.exec(scriptPath, options,
              function (error, stdout, stderr) {
                if (error) reject(error);
                if (stdout) {
                  writeOutput(stdout.toString(), outputLogs);
                }
                resolve(true);
              }
            );
          } catch (error) {
            resolve(false);
          }
        });

        await promise.then(result => {
          commandResult = result;
        }).catch(reason => {
          commandResult = false;
        }).finally(async () => {
          await rm(scriptPath);
        });

      });

      return commandResult;
    } else {
      return true;
    }
  }

  async getUsername(): Promise<string> {
    const { stdout, stderr } = await execFileProm('whoami');
    const userName = stdout.trim();

    return userName;
  }

  async isUserInGroup(groupName: string): Promise<boolean> {
    const userName = await this.getUsername();

    const { stdout, stderr } = await execFileProm('groups', [userName]);
    const groups = stdout.trim().split(' ');
    return groups.findIndex(val => val === groupName) >= 0;
  }

  async checkForInstalledUbuntuPackage(packageName: string): Promise<boolean> {
    const { stdout, stderr } = await execFileProm('apt', ['-qq', 'list', packageName]);
    return stdout.indexOf('[installed]') > 0
  }

  async install(details: InstallDetails, outputLogs?: OutputLogs): Promise<boolean> {
    // Install and update eth-docker
    if (!await this.installUpdateEthDockerCode(details.network, outputLogs)) {
      return false;
    }

    // Create .env file with all the configuration details
    if (!await this.createEthDockerEnvFile(details, outputLogs)) {
      return false;
    }

    // Build the clients
    if (!await this.buildClients(details.network, outputLogs)) {
      return false;
    }

    return true;
  }

  async buildClients(network: Network, outputLogs?: OutputLogs): Promise<boolean> {
    const networkPath = path.join(installPath, network.toLowerCase());
    const ethDockerPath = path.join(networkPath, 'eth-docker');

    const ethdCommand = path.join(ethDockerPath, 'ethd');
    const bashScript = `
/usr/bin/newgrp ${dockerGroupName} <<EONG
${ethdCommand} cmd build --pull
EONG
    `;

    const returnProm = execProm(bashScript, { shell: '/bin/bash', cwd: ethDockerPath });
    const { stdout, stderr } = await returnProm;

    if (returnProm.child.exitCode !== 0) {
      console.log('We failed to build eth-docker clients.');
      return false;
    }

    return true;
  }

  async createEthDockerEnvFile(details: InstallDetails, outputLogs?: OutputLogs): Promise<boolean> {
    const networkPath = path.join(installPath, details.network.toLowerCase());
    const ethDockerPath = path.join(networkPath, 'eth-docker');

    // Start with the default env file.
    const defaultEnvPath = path.join(ethDockerPath, 'default.env');
    const envPath = path.join(ethDockerPath, '.env');

    // Open default env file and update the configs.
    const defaultEnvFile = await open(defaultEnvPath, 'r');
    const defaultEnvConfigs = await defaultEnvFile.readFile({ encoding: 'utf8' });
    await defaultEnvFile.close();

    let envConfigs = defaultEnvConfigs;

    // Writing consensus network
    const networkValue = details.network.toLowerCase();
    envConfigs = envConfigs.replace(/NETWORK=(.*)/, `NETWORK=${networkValue}`);

    // Writing execution network
    const ecNetworkValue = networkToExecution.get(details.network)?.toLowerCase() as string;
    envConfigs = envConfigs.replace(/EC_NETWORK=(.*)/, `EC_NETWORK=${ecNetworkValue}`);

    let composeFileValues = new Array<string>();

    switch (details.consensusClient) {
      case ConsensusClient.LIGHTHOUSE:
        composeFileValues.push('lh-base.yml');
        break;
      case ConsensusClient.NIMBUS:
        composeFileValues.push('nimbus-base.yml');
        break;
      case ConsensusClient.PRYSM:
        composeFileValues.push('prysm-base.yml');
        break;
      case ConsensusClient.TEKU:
        composeFileValues.push('teku-base.yml');
        break;
      case ConsensusClient.LODESTAR:
        composeFileValues.push('lodestar-base.yml');
        break;
    }

    switch (details.executionClient) {
      case ExecutionClient.GETH:
        composeFileValues.push('geth.yml');
        break;
      case ExecutionClient.NETHERMIND:
        composeFileValues.push('nm.yml');
        break;
      case ExecutionClient.BESU:
        composeFileValues.push('besu.yml');
        break;
      case ExecutionClient.ERIGON:
        composeFileValues.push('erigon.yml');
        break;
    }

    const composeFileValue = composeFileValues.join(':');
    envConfigs = envConfigs.replace(/COMPOSE_FILE=(.*)/, `COMPOSE_FILE=${composeFileValue}`);

    // Write our new env file
    const envFile = await open(envPath, 'w');
    envFile.writeFile(envConfigs, { encoding: 'utf8' });
    await envFile.close();

    return true;
  }

  async installUpdateEthDockerCode(network: Network, outputLogs?: OutputLogs): Promise<boolean> {
    const networkPath = path.join(installPath, network.toLowerCase());

    // Make sure the networkPath is a directory
    const networkPathExists = await doesFileExist(networkPath);
    const networkPathIsDir = networkPathExists && await doesDirectoryExist(networkPath);
    if (!networkPathExists) {
      await mkdir(networkPath, { recursive: true });
    } else if (networkPathExists && !networkPathIsDir) {
      await rm(networkPath);
      await mkdir(networkPath, { recursive: true });
    }

    const ethDockerPath = path.join(networkPath, 'eth-docker');

    const ethDockerPathExists = await doesFileExist(ethDockerPath);
    const ethDockerPathIsDir = ethDockerPathExists && await doesDirectoryExist(ethDockerPath);
    let needToClone = !ethDockerPathExists;

    if (ethDockerPathExists && !ethDockerPathIsDir) {
      await rm(ethDockerPath);
      needToClone = true;
    } else if (ethDockerPathIsDir) {
      // Check if eth-docker was already cloned.
      const returnProm = execFileProm('git', ['remote', 'show', 'origin'], { cwd: ethDockerPath });
      const { stdout, stderr } = await returnProm;

      if (returnProm.child.exitCode === 0) {
        // Check for origin being ethDockerGitRepository
        const remoteMatch = stdout.match(/Fetch URL: (?<remote>.+)/);
        if (remoteMatch) {
          if (remoteMatch.groups?.remote.trim() === ethDockerGitRepository) {
            needToClone = false;
          } else {
            // Git repository with the wrong remote.
            await rm(ethDockerPath, { recursive: true, force: true });
            needToClone = true;
          }
        } else {
          console.log('Cannot parse `git remote show origin` output.');
          return false;
        }
      } else {
        // Not a git repository or does not have origin remote
        await rm(ethDockerPath, { recursive: true, force: true });
        needToClone = true;
      }
    }

    if (needToClone) {
      // Clone repository if needed
      const returnProm = execFileProm('git', ['clone', ethDockerGitRepository], { cwd: networkPath });
      const { stdout, stderr } = await returnProm;

      if (returnProm.child.exitCode !== 0) {
        console.log('We failed to clone eth-docker repository.');
        return false;
      }

      // Generate Prysm wallet password and store it in plain text
      const walletPassword = generate_password({
        length: 32,
        numbers: true
      });
      const walletPasswordPath = path.join(ethDockerPath, prysmWalletPasswordFileName);
      const walletPasswordFile = await open(walletPasswordPath, 'w');
      await walletPasswordFile.write(walletPassword);
      await walletPasswordFile.close();
    } else {
      // Update repository
      const returnProm = execFileProm('git', ['pull'], { cwd: ethDockerPath });
      const { stdout, stderr } = await returnProm;

      if (returnProm.child.exitCode !== 0) {
        console.log('We failed to update eth-docker repository.');
        return false;
      }
    }

    return true;
  }

  async postInstall(network: Network, outputLogs?: OutputLogs): Promise<boolean> {
    return this.startNodes(network, outputLogs);
  }

  async stopNodes(network: Network, outputLogs?: OutputLogs): Promise<boolean> {
    const networkPath = path.join(installPath, network.toLowerCase());
    const ethDockerPath = path.join(networkPath, 'eth-docker');

    const ethdCommand = path.join(ethDockerPath, 'ethd');
    const bashScript = `
/usr/bin/newgrp ${dockerGroupName} <<EONG
${ethdCommand} stop
EONG
    `;

    const returnProm = execProm(bashScript, { shell: '/bin/bash', cwd: ethDockerPath });
    const { stdout, stderr } = await returnProm;

    if (returnProm.child.exitCode !== 0) {
      console.log('We failed to stop eth-docker clients.');
      return false;
    }

    return true;
  }

  async startNodes(network: Network, outputLogs?: OutputLogs): Promise<boolean> {
    const networkPath = path.join(installPath, network.toLowerCase());
    const ethDockerPath = path.join(networkPath, 'eth-docker');

    const ethdCommand = path.join(ethDockerPath, 'ethd');
    const bashScript = `
/usr/bin/newgrp ${dockerGroupName} <<EONG
${ethdCommand} start
EONG
    `;

    const returnProm = execProm(bashScript, { shell: '/bin/bash', cwd: ethDockerPath });
    const { stdout, stderr } = await returnProm;

    if (returnProm.child.exitCode !== 0) {
      console.log('We failed to start eth-docker clients.');
      return false;
    }

    return true;
  }

  async updateExecutionClient(outputLogs?: OutputLogs): Promise<void> {
    // TODO: implement
    console.log("Executing updateExecutionClient");
    return;
  }

  async updateConsensusClient(outputLogs?: OutputLogs): Promise<void> {
    // TODO: implement
    console.log("Executing updateConsensusClient");
    return;
  }

  async importKeys(
    network: Network,
    keyStoreDirectoryPath: string,
    keyStorePassword: string,
    outputLogs?: OutputLogs): Promise<boolean> {

    const networkPath = path.join(installPath, network.toLowerCase());
    const ethDockerPath = path.join(networkPath, 'eth-docker');

    const ethdCommand = path.join(ethDockerPath, 'ethd');
    const argKeyStoreDirectoryPath = commandJoin([keyStoreDirectoryPath]);
    const argKeyStorePassword = commandJoin([keyStorePassword]);

    const walletPasswordPath = path.join(ethDockerPath, prysmWalletPasswordFileName);
    const walletPasswordFile = await open(walletPasswordPath, 'r');
    const walletPassword = commandJoin([await walletPasswordFile.readFile({ encoding: 'utf8' })]);
    await walletPasswordFile.close();

    const bashScript = `
/usr/bin/newgrp ${dockerGroupName} <<EONG
WALLET_PASSWORD=${walletPassword} KEYSTORE_PASSWORD=${argKeyStorePassword} ${ethdCommand} keyimport --non-interactive --path ${argKeyStoreDirectoryPath}
EONG
    `;

    const returnProm = execProm(bashScript, { shell: '/bin/bash', cwd: ethDockerPath });
    const { stdout, stderr } = await returnProm;

    if (returnProm.child.exitCode !== 0) {
      console.log('We failed to import keys with eth-docker.');
      return false;
    }

    return true;
  }

  async exportKeys(): Promise<void> {
    // TODO: implement
    return;
  }

  async switchExecutionClient(targetClient: ExecutionClient): Promise<boolean> {
    // TODO: implement
    console.log("Executing switchExecutionClient");
    return false;
  }

  async switchConsensusClient(targetClient: ConsensusClient): Promise<boolean> {
    // TODO: implement
    console.log("Executing switchConsensusClient");
    return false;
  }

  async uninstall(): Promise<boolean> {
    // TODO: implement
    console.log("Executing uninstall");
    return false;
  }


  // Data
  async getCurrentExecutionClient(): Promise<ExecutionClient> {
    // TODO: implement
    console.log("Executing getCurrentExecutionClient");
    return ExecutionClient.GETH;
  }

  async getCurrentConsensusClient(): Promise<ConsensusClient> {
    // TODO: implement
    console.log("Executing getCurrentConsensusClient");
    return ConsensusClient.LIGHTHOUSE;
  }

  async getCurrentExecutionClientVersion(): Promise<string> {
    // TODO: implement
    console.log("Executing getCurrentExecutionClientVersion");
    return "0.1";
  }

  async getCurrentConsensusClientVersion(): Promise<string> {
    // TODO: implement
    console.log("Executing getCurrentConsensusClientVersion");
    return "0.1";
  }

  async getLatestExecutionClientVersion(client: ExecutionClient): Promise<string> {
    // TODO: implement
    console.log("Executing getLatestExecutionClientVersion");
    return "0.1";
  }

  async getLatestConsensusClientVersion(client: ConsensusClient): Promise<string> {
    // TODO: implement
    console.log("Executing getLatestConsensusClientVersion");
    return "0.1";
  }

  async executionClientStatus(): Promise<NodeStatus> {
    // TODO: implement
    console.log("Executing executionClientStatus");
    return NodeStatus.UNKNOWN;
  }

  async consensusBeaconNodeStatus(): Promise<NodeStatus> {
    // TODO: implement
    console.log("Executing consensusBeaconNodeStatus");
    return NodeStatus.UNKNOWN;
  }

  async consensusValidatorStatus(): Promise<ValidatorStatus> {
    // TODO: implement
    console.log("Executing consensusValidatorStatus");
    return ValidatorStatus.UNKNOWN;
  }

  async consensusValidatorCount(): Promise<number> {
    // TODO: implement
    console.log("Executing consensusValidatorCount");
    return -1;
  }

  async executionClientPeerCount(): Promise<number> {
    // TODO: implement
    console.log("Executing executionClientPeerCount");
    return -1;
  }

  async consensusClientPeerCount(): Promise<number> {
    // TODO: implement
    console.log("Executing consensusClientPeerCount");
    return -1;
  }

  async executionClientLatestBlock(): Promise<number> {
    // TODO: implement
    console.log("Executing executionClientLatestBlock");
    return -1;
  }

  async consensusClientLatestBlock(): Promise<number> {
    // TODO: implement
    console.log("Executing consensusClientLatestBlock");
    return -1;
  }
}
