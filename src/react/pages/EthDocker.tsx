import {
    Black,
    Button,
    ButtonHover,
    Heading,
    MainContent,
  } from "../colors";
import { withRouter } from "react-router-dom";
import React, { useEffect, useRef, useState } from "react";

import { History } from "history";
import { initWithPrerequisites } from "../commands/EthDocker";

import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const LandingHeader = styled.div`
  font-weight: 700;
  font-size: 35;
  margin-top: 120;
  color: ${Heading};
  max-width: 550;
  text-align: center;
`;

const Content = styled.div`
  color: ${MainContent};
  margin-top: 40;
  max-width: 650;
`;

const TestButton = styled.button`
  color: ${Black};
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 24;
  background-color: ${Button};
  padding: 16 24;
  border-radius: 10%;
  text-decoration: none;

  transition: 250ms background-color ease;
  cursor: pointer;
  margin-top: 60;

  &:hover {
    background-color: ${ButtonHover};
  }
`;

const StyledLink = styled.em`
  color: ${Heading};
  cursor: pointer;
`;

const EthDocker = ({ history }: {history: History}) => {
  const anchorRef = useRef(document.createElement("div"));

  const [stdoutText, setStdoutText] = useState([""]);

  useEffect(() => {
    anchorRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [stdoutText]);

  const stdoutCallback = (text: string[]) => {
    console.log("installing cb with " + text.join());
    setStdoutText(stdoutText.concat(text));
  }

  const initCallback = (success: boolean) => {
    if (success) {
      console.log("init succeeded")
    } else {
      console.log("init failed");
    }
  }

  const uiInitWithPrerequisites = () => {
    initWithPrerequisites(initCallback, stdoutCallback);
  }

  const sendToHome = () => {
    history.push("/");
  }
  
  return (
    <Container>
      <LandingHeader>Testing eth-docker integration</LandingHeader>
      <Content>
        <p>Test page for eth-docker integration.</p>
        <TestButton onClick={uiInitWithPrerequisites}>InitWithPrerequisites</TestButton>
      </Content>
      <StyledLink onClick={sendToHome}>Back to Home</StyledLink>
    </Container>
  );
};

export default withRouter(EthDocker);