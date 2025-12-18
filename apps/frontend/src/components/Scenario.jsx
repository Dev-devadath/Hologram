import { CameraControls, Environment } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { Avatar } from "./Avatar";

export const Scenario = () => {
  const cameraControls = useRef();
  useEffect(() => {
    cameraControls.current.setLookAt(0, 2.2, 5, 0, 1.0, 0, true);
  }, []);
  return (
    <>
      <CameraControls ref={cameraControls} />
      {/* Change preset to: "sunset", "dawn", "night", "warehouse", "forest", "apartment", "studio", "city", "park", "lobby" */}
      <Environment preset="warehouse" />
      <Avatar />
    </>
  );
};
