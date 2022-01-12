import { Button, Grid, Typography } from '@material-ui/core';
import React, { FC, ReactElement, Dispatch, SetStateAction } from 'react';
import styled from 'styled-components';
import { Network } from '../types';

const ContentGrid = styled(Grid)`
  height: 320px;
  margin-top: 16px;
`;

type Props = {
  onStepBack: () => void,
  onStepForward: () => void,
  network: Network
}

/**
 * This is the final page.
 * 
 * @param props.onStepBack the function to execute when the user steps back
 * @param props.onStepForward the function to execute when the user steps forward
 * @param props.network the network the app is running for
 * @returns the react element to render
 */
const Finish: FC<Props> = (props): ReactElement => {
  return (
    <Grid container direction="column" spacing={2}>
      {props.children}
      <Grid item container justifyContent="space-between">
        <Grid item xs={5} />
        <Grid item xs={2}>
          <Button variant="contained" color="primary" onClick={props.onStepForward} tabIndex={2}>Close</Button>
        </Grid>
        <Grid item xs={5} />
      </Grid>
    </Grid>
  );
}

export default Finish;