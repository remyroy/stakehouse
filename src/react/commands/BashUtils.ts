import { executeCommandSync, executeCommandSyncReturnStdout } from "./ExecuteCommand";

const escapeArgument = (argument: string): string => {
  // TODO: Command line argument escape
  return argument;
}

const doesFileExist = (filename: string): boolean => {
  const cmd = "test -f " + escapeArgument(filename);
  const result = executeCommandSync(cmd);
  return result == 0;
};

//TODO: add error handling
const readlink = (file: string): string => {
  return executeCommandSyncReturnStdout("readlink -f " + escapeArgument(file)).trim();
}

const which = (tool: string): boolean => {
  const cmd = "which " + tool;
  const result = executeCommandSync(cmd);
  return result == 0;
}

const groupId = (group: string): number => {
  const groupValue = executeCommandSyncReturnStdout("cat /etc/group | grep " + escapeArgument(group));
  const groupRegex = /([^:]+):([^:]+):([^:]+)/;
  for (var groupLine of groupValue.split("\n")) {
    if (groupLine.trim() != "") {
      const match = groupLine.match(groupRegex);
      if (match && match.length >= 4) {
        return parseInt(match[3]);
      }
    }
  }
  
  return -1;
}

export {
  doesFileExist,
  readlink,
  which,
  groupId,
  escapeArgument
};