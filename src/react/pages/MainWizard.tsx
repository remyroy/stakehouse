import React, { FC, ReactElement, useState } from 'react';
import { useParams, useHistory } from "react-router-dom";
import { Stepper, Step, StepLabel, Grid, Typography } from '@material-ui/core';
import styled from 'styled-components';
import { StepKey } from '../types';
import { stepLabels } from '../constants';
import { Network, StepSequenceKey } from '../types';
import VersionFooter from '../components/VersionFooter';

const stepSequenceMap: Record<string, StepKey[]> = {
}

const MainGrid = styled(Grid)`
  width: 100%;
  margin: 0px;
  text-align: center;
`;

const StyledStepper = styled(Stepper)`
  background-color: transparent;
`

type RouteParams = {
  stepSequenceKey: StepSequenceKey;
};

type WizardProps = {
  network: Network
}

/**
 * This is the main wizard through which each piece of functionality for the app runs.
 * 
 * This wizard manages the global stepper showing the user where they are in the process.
 * 
 * @param props passed in data for the component to use
 * @returns the react element to render
 */
const Wizard: FC<WizardProps> = (props): ReactElement => {
  const { stepSequenceKey } = useParams<RouteParams>();
  const history = useHistory();

  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const stepSequence = stepSequenceMap[stepSequenceKey];

  const onStepForward = () => {
    if (activeStepIndex === stepSequence.length - 1) {
      window.electronAPI.ipcRendererSendClose();
      return;
    }
    setActiveStepIndex(activeStepIndex + 1);
  }

  const onStepBack = () => {
    if (activeStepIndex === 0) {
      history.push("/");
    } else {
      setActiveStepIndex(activeStepIndex - 1);
    }
  }

  /**
   * This is the UI stepper component rendering where the user is in the process
   */
  const stepper = (
    <Grid item>
      <StyledStepper activeStep={activeStepIndex} alternativeLabel>
        {stepSequence.map((stepKey: StepKey) => (
          <Step key={stepKey}>
            <StepLabel>{stepLabels[stepKey]}</StepLabel>
          </Step>
        ))}
      </StyledStepper>
    </Grid>
  );

  const commonProps = {
    onStepForward,
    onStepBack,
    children: stepper
  };

  /**
   * This switch returns the correct react components based on the active step.
   * @returns the component to render
   */
  const stepComponentSwitch = (): ReactElement => {
    return <div>No component for this step</div>
  }

  return (
    <MainGrid container spacing={5} direction="column">
      <Grid item container>
        <Grid item xs={10} />
        <Grid item xs={2}>
          <Typography variant="caption" style={{ color: "gray" }}>
            Network: {props.network}
          </Typography>
        </Grid>
      </Grid>
      <Grid item container>
        {stepComponentSwitch()}
      </Grid>
      <VersionFooter />
    </MainGrid>
  );
}

export default Wizard;
