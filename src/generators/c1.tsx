// c1.tsx — C1 Enroute generator. Ported from scenario-c1-enroute.js: new rules
// default to mode "C1" and the list is filtered by that mode; it reuses S3's
// RulePanel (now a direct ES-module import instead of window.SB.RulePanel).
import { RulePanel } from "./s3";
import { registerGenerator } from "./registry";

function C1Panel(props: any) {
  return <RulePanel mode="C1" {...props} />;
}

registerGenerator({
  id: "C1",
  label: "C1 Enroute",
  render: (props: any) => <C1Panel {...props} />,
});
