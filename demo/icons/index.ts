import principalSvg from "./principal.svg?raw";
import computeSvg from "./compute.svg?raw";
import databaseSvg from "./database.svg?raw";
import lambdaSvg from "./lambda.svg?raw";
import containerSvg from "./container.svg?raw";
import bucketSvg from "./bucket.svg?raw";
import keySvg from "./key.svg?raw";
import secretSvg from "./secret.svg?raw";
import stackSvg from "./stack.svg?raw";
import parameterSvg from "./parameter.svg?raw";
import cacheSvg from "./cache.svg?raw";
import searchSvg from "./search.svg?raw";
import streamSvg from "./stream.svg?raw";
import notificationSvg from "./notification.svg?raw";
import queueSvg from "./queue.svg?raw";
import federationSvg from "./federation.svg?raw";
import networkSvg from "./network.svg?raw";
import shieldSvg from "./shield.svg?raw";

/** Remove the background circle (cx=24 cy=24 r=22) from icon SVGs. */
function stripIconBackground(svg: string): string {
  return svg.replace(/<circle\s+cx="24"\s+cy="24"\s+r="22"\s+fill="[^"]*"\s*\/>/, "");
}

// Order matters: array index + 1 = icon index in Node.icon
const RAW_ICONS = [
  principalSvg, // 1
  computeSvg, // 2
  databaseSvg, // 3
  lambdaSvg, // 4
  containerSvg, // 5
  bucketSvg, // 6
  keySvg, // 7
  secretSvg, // 8
  stackSvg, // 9
  parameterSvg, // 10
  cacheSvg, // 11
  searchSvg, // 12
  streamSvg, // 13
  notificationSvg, // 14
  queueSvg, // 15
  federationSvg, // 16
  networkSvg, // 17
  shieldSvg, // 18
];

/** SVG strings with background circle removed, ready for atlas. */
export const ICON_SVGS = RAW_ICONS.map(stripIconBackground);

/** Map AWS resource type to 1-based icon index. */
export const TYPE_ICON_INDEX: Record<string, number> = {
  // Principal (identity) — index 1
  "aws:iam:role": 1,
  "aws:iam:user": 1,
  // Compute — index 2
  "aws:ec2:instance": 2,
  // Database — index 3
  "aws:dynamodb:table": 3,
  "aws:rds:cluster": 3,
  // Lambda — index 4
  "aws:lambda:function": 4,
  // Container — index 5
  "aws:ecs:service": 5,
  "aws:ecs:task-definition": 5,
  // Bucket — index 6
  "aws:s3:bucket": 6,
  // Key — index 7
  "aws:kms:key": 7,
  // Secret — index 8
  "aws:secretsmanager:secret": 8,
  // Stack — index 9
  "aws:cloudformation:stack": 9,
  // Parameter — index 10
  "aws:ssm:parameter": 10,
  // Cache — index 11
  "aws:elasticache:cachecluster": 11,
  // Search — index 12
  "aws:es:domain": 12,
  // Stream — index 13
  "aws:kinesis:stream": 13,
  // Notification — index 14
  "aws:sns:topic": 14,
  // Queue — index 15
  "aws:sqs:queue": 15,
  // Federation — index 16
  "aws:iam:oidc-provider": 16,
  "aws:iam:saml-provider": 16,
};
