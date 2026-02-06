export const TYPE_COLORS: Record<string, [number, number, number]> = {
  // Principal (identity) — #ba5312
  "aws:iam:oidc-provider": [0.73, 0.33, 0.07],
  "aws:iam:role": [0.73, 0.33, 0.07],
  "aws:iam:saml-provider": [0.73, 0.33, 0.07],
  "aws:iam:user": [0.73, 0.33, 0.07],
  // Compute — #4a90e2
  "aws:cloudformation:stack": [0.29, 0.56, 0.89],
  "aws:ec2:instance": [0.29, 0.56, 0.89],
  "aws:ecs:task-definition": [0.29, 0.56, 0.89],
  "aws:lambda:function": [0.29, 0.56, 0.89],
  // Database (data) — #2d9c4f
  "aws:dynamodb:table": [0.18, 0.61, 0.31],
  "aws:kms:key": [0.18, 0.61, 0.31],
  "aws:s3:bucket": [0.18, 0.61, 0.31],
  "aws:sqs:queue": [0.18, 0.61, 0.31],
};

export const DEFAULT_NODE_COLOR: [number, number, number] = [0.6, 0.6, 0.6];

export const EDGE_TYPE_COLORS: Record<
  string,
  [number, number, number, number]
> = {
  Direct: [0.3, 0.55, 0.75, 0.6],
  Escalation: [0.9, 0.25, 0.2, 0.8],
};

export const DEFAULT_EDGE_COLOR: [number, number, number, number] = [
  0.5, 0.5, 0.5, 0.3,
];

export const NODE_SIZE = 4.0;
export const SELECTED_NODE_SIZE = 5.0;
export const DIM_A = 0.01;
