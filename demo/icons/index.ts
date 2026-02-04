import cloudformationSvg from "./cloudformation-stack.svg?raw";
import dynamodbSvg from "./dynamodb-table.svg?raw";
import ec2Svg from "./ec2-instance.svg?raw";
import ecsSvg from "./ecs-task-definition.svg?raw";
import iamOidcSvg from "./iam-oidc-provider.svg?raw";
import iamRoleSvg from "./iam-role.svg?raw";
import iamSamlSvg from "./iam-saml-provider.svg?raw";
import iamUserSvg from "./iam-user.svg?raw";
import kmsSvg from "./kms-key.svg?raw";
import lambdaSvg from "./lambda-function.svg?raw";
import s3Svg from "./s3-bucket.svg?raw";
import sqsSvg from "./sqs-queue.svg?raw";

/** Remove the background circle (cx=24 cy=24 r=22) from icon SVGs. */
function stripIconBackground(svg: string): string {
  return svg.replace(/<circle\s+cx="24"\s+cy="24"\s+r="22"\s+fill="[^"]*"\s*\/>/, "");
}

// Order matters: array index + 1 = icon index in Node.icon
const RAW_ICONS = [
  cloudformationSvg,
  dynamodbSvg,
  ec2Svg,
  ecsSvg,
  iamOidcSvg,
  iamRoleSvg,
  iamSamlSvg,
  iamUserSvg,
  kmsSvg,
  lambdaSvg,
  s3Svg,
  sqsSvg,
];

/** SVG strings with background circle removed, ready for atlas. */
export const ICON_SVGS = RAW_ICONS.map(stripIconBackground);

/** Map AWS resource type to 1-based icon index. */
export const TYPE_ICON_INDEX: Record<string, number> = {
  "aws:cloudformation:stack": 1,
  "aws:dynamodb:table": 2,
  "aws:ec2:instance": 3,
  "aws:ecs:task-definition": 4,
  "aws:iam:oidc-provider": 5,
  "aws:iam:role": 6,
  "aws:iam:saml-provider": 7,
  "aws:iam:user": 8,
  "aws:kms:key": 9,
  "aws:lambda:function": 10,
  "aws:s3:bucket": 11,
  "aws:sqs:queue": 12,
};
