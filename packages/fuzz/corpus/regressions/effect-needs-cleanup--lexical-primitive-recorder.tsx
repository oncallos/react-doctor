// rule: effect-needs-cleanup
// weakness: name-heuristic
// source: closed local observe stores data without registering a resource
// verdict: pass
import { useEffect } from "react";

let lastEvent: string;
const recorder = {
  observe(event: string): void {
    lastEvent = event;
  },
};
export const Screen = () => {
  useEffect(() => {
    recorder.observe("opened");
  }, []);
  return <div>{lastEvent}</div>;
};
