import principalSvg from "./principal.svg?raw";
import computeSvg from "./compute.svg?raw";
import databaseSvg from "./database.svg?raw";

/** Remove the background circle (cx=24 cy=24 r=22) from icon SVGs. */
function stripIconBackground(svg: string): string {
  return svg.replace(/<circle\s+cx="24"\s+cy="24"\s+r="22"\s+fill="[^"]*"\s*\/>/, "");
}

// Order matters: array index + 1 = icon index in Node.icon
const RAW_ICONS = [principalSvg, computeSvg, databaseSvg];

/** SVG strings with background circle removed, ready for atlas. */
export const ICON_SVGS = RAW_ICONS.map(stripIconBackground);

/** Map AWS resource type to 1-based icon index. */
export const TYPE_ICON_INDEX: Record<string, number> = {
  // Principal (identity) — index 1
  "aws:iam:oidc-provider": 1,
  "aws:iam:role": 1,
  "aws:iam:saml-provider": 1,
  "aws:iam:user": 1,
  // Compute — index 2
  "aws:cloudformation:stack": 2,
  "aws:ec2:instance": 2,
  "aws:ecs:service": 2,
  "aws:ecs:task-definition": 2,
  "aws:lambda:function": 2,
  "aws:ssm:parameter": 2,
  // Database (data) — index 3
  "aws:dynamodb:table": 3,
  "aws:elasticache:cachecluster": 3,
  "aws:es:domain": 3,
  "aws:kinesis:stream": 3,
  "aws:kms:key": 3,
  "aws:rds:cluster": 3,
  "aws:s3:bucket": 3,
  "aws:secretsmanager:secret": 3,
  "aws:sns:topic": 3,
  "aws:sqs:queue": 3,
};
