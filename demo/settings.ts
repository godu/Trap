export const TYPE_COLORS: Record<string, [number, number, number]> = {
  "aws:cloudformation:stack": [0.98, 0.51, 0.25],
  "aws:dynamodb:table": [0.29, 0.47, 0.82],
  "aws:ec2:instance": [0.95, 0.77, 0.06],
  "aws:ecs:task-definition": [0.95, 0.49, 0.13],
  "aws:iam:oidc-provider": [0.86, 0.21, 0.27],
  "aws:iam:role": [0.86, 0.21, 0.27],
  "aws:iam:saml-provider": [0.86, 0.21, 0.27],
  "aws:iam:user": [0.72, 0.15, 0.22],
  "aws:kms:key": [0.62, 0.31, 0.71],
  "aws:lambda:function": [0.95, 0.61, 0.07],
  "aws:s3:bucket": [0.22, 0.66, 0.36],
  "aws:sqs:queue": [0.95, 0.35, 0.53],
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
