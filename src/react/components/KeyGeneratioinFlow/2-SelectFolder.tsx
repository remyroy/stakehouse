import { Button, Grid, Typography } from '@material-ui/core';
import { OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import React, { FC, ReactElement, Dispatch, SetStateAction } from 'react';

type SelectFolderProps = {
  setFolderPath: Dispatch<SetStateAction<string>>,
  folderPath: string,
  setFolderError: Dispatch<SetStateAction<boolean>>,
  folderError: boolean,
  setFolderErrorMsg: Dispatch<SetStateAction<string>>,
  folderErrorMsg: string,
  setModalDisplay: Dispatch<SetStateAction<boolean>>,
  modalDisplay: boolean,
}

/**
 * The page which prompts the user to choose a folder to save keys in
 * 
 * @param props self documenting parameters passed in
 * @returns react element to render
 */
const SelectFolder: FC<SelectFolderProps> = (props): ReactElement => {
  const chooseFolder = () => {
    props.setFolderError(false);

    const options: OpenDialogOptions = {
      properties: ['openDirectory']
    };

    props.setModalDisplay(true);
    window.electronAPI.invokeShowOpenDialog(options)
      .then((value: OpenDialogReturnValue) => {
        if (value !== undefined && value.filePaths.length > 0) {
          props.setFolderPath(value.filePaths[0]);
        } else {
          props.setFolderError(true);
        }
      })
      .finally(() => {
        props.setModalDisplay(false);
      });
  }

  return (
    <Grid item container direction="column" spacing={3}>
      <Grid item xs={12}>
        <Typography variant="body1">
          Choose a folder where we should save your keys.
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Button variant="contained" component="label" onClick={chooseFolder} tabIndex={1} disabled={props.modalDisplay}>
          Browse
        </Button>
      </Grid>
      { props.folderPath != "" &&
        <Grid item xs={12}>
          <Typography >
            You've selected: {props.folderPath}
          </Typography>
        </Grid>
      }
      { props.folderError &&
        <Grid item xs={12}>
          <Typography color="error">
            {props.folderErrorMsg}
          </Typography>
        </Grid>
      }
    </Grid>
  );
}

export default SelectFolder;