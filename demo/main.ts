import { Renderer } from "../src/index";
import type { Node } from "../src/index";
import resources from "./small.minimal-resources.json";

interface Resource {
  InternalArn: string;
  InternalType: string;
  x: number;
  y: number;
}

const TYPE_COLORS: Record<string, [number, number, number]> = {
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

const DEFAULT_COLOR: [number, number, number] = [0.6, 0.6, 0.6];

function toNodes(data: Resource[]): Node[] {
  return data.map((res) => {
    const [r, g, b] = TYPE_COLORS[res.InternalType] ?? DEFAULT_COLOR;
    return { x: res.x, y: res.y, r, g, b, radius: 2 };
  });
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const nodes = toNodes(resources as Resource[]);
const renderer = new Renderer({ canvas, nodes });

renderer.render();

window.addEventListener("resize", () => {
  renderer.render();
});

document.getElementById("fit-btn")?.addEventListener("click", () => {
  renderer.fitToNodes();
});
