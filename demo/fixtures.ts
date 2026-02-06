import type { GraphEdge as Edge, GraphNode as Node } from "./graph/types";

export const FIRST_STEP_NODES = new Map<string, Node>([
  [
    "table/achatFinance-67f122a",
    {
      label: "",
      type: "aws:dynamodb:table",
      x: 22.383325576782227,
      y: 1.5434455871582031,
    },
  ],
  [
    "table/moleculesToTest-916cef1",
    {
      label: "",
      type: "aws:dynamodb:table",
      x: 7.433152198791504,
      y: -20.94068717956543,
    },
  ],
  [
    "instance/<new>",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -1.7538065910339355,
      y: 14.090965270996094,
    },
  ],
  [
    "instance/i-014d3e54c0d73c973",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -6.659629821777344,
      y: -11.149260520935059,
    },
  ],
  [
    "instance/i-0208dbc5e468df448",
    {
      label: "",
      type: "aws:ec2:instance",
      x: 6.955765724182129,
      y: 19.231996536254883,
    },
  ],
  [
    "instance/i-02618bda4b1a5e805",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -22.76485824584961,
      y: 5.718642234802246,
    },
  ],
  [
    "instance/i-03f4fcf6218b42829",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -6.448820114135742,
      y: 21.804420471191406,
    },
  ],
  [
    "instance/i-0646b682c2f834942",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -15.3140869140625,
      y: -11.500433921813965,
    },
  ],
  [
    "instance/i-0e8674bb01fe5f35e",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -17.708986282348633,
      y: -1.5944217443466187,
    },
  ],
  [
    "role/OrganizationAccountAccessRole",
    {
      label: "",
      type: "aws:iam:role",
      x: 5.567564010620117,
      y: 2.4305992126464844,
    },
  ],
  [
    "role/backEnd1Role-c586f31",
    {
      label: "",
      type: "aws:iam:role",
      x: -5.299227237701416,
      y: -24.051401138305664,
    },
  ],
  [
    "role/backEnd2Role-e987d53",
    {
      label: "",
      type: "aws:iam:role",
      x: 19.9084529876709,
      y: 17.185970306396484,
    },
  ],
  [
    "role/bastionRole-91ce197",
    {
      label: "",
      type: "aws:iam:role",
      x: -14.52942943572998,
      y: 14.310629844665527,
    },
  ],
  [
    "role/fetchRole",
    {
      label: "",
      type: "aws:iam:role",
      x: 18.27663803100586,
      y: -19.313879013061523,
    },
  ],
  [
    "role/frontEnd1Role-13281f0",
    {
      label: "",
      type: "aws:iam:role",
      x: -29.47701644897461,
      y: -1.5531500577926636,
    },
  ],
  [
    "role/frontEnd2Role-59ac465",
    {
      label: "",
      type: "aws:iam:role",
      x: -13.677433967590332,
      y: -21.871013641357422,
    },
  ],
  [
    "role/securityOfficeRole-7e94f46",
    {
      label: "",
      type: "aws:iam:role",
      x: -8.530915260314941,
      y: 1.7508339881896973,
    },
  ],
  [
    "user/userManager",
    {
      label: "",
      type: "aws:iam:user",
      x: 9.928110122680664,
      y: -10.14506721496582,
    },
  ],
  [
    "user/userWebDesign",
    {
      label: "",
      type: "aws:iam:user",
      x: 21.513883590698242,
      y: -9.63861083984375,
    },
  ],
  [
    "function/<new>",
    {
      label: "",
      type: "aws:lambda:function",
      x: 16.075899124145508,
      y: 11.319405555725098,
    },
  ],
]);

export const FIRST_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "instance/i-014d3e54c0d73c973",
    new Map([["role/frontEnd2Role-59ac465", { type: "Direct" }]]),
  ],
  [
    "instance/i-0208dbc5e468df448",
    new Map([["role/backEnd2Role-e987d53", { type: "Direct" }]]),
  ],
  [
    "instance/i-02618bda4b1a5e805",
    new Map([["role/frontEnd1Role-13281f0", { type: "Direct" }]]),
  ],
  [
    "instance/i-03f4fcf6218b42829",
    new Map([["role/bastionRole-91ce197", { type: "Direct" }]]),
  ],
  [
    "instance/i-0646b682c2f834942",
    new Map([["role/backEnd1Role-c586f31", { type: "Direct" }]]),
  ],
  [
    "role/OrganizationAccountAccessRole",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "Direct" }],
      ["table/moleculesToTest-916cef1", { type: "Direct" }],
      ["instance/<new>", { type: "Direct" }],
      ["instance/i-014d3e54c0d73c973", { type: "Direct" }],
      ["instance/i-0208dbc5e468df448", { type: "Direct" }],
      ["instance/i-02618bda4b1a5e805", { type: "Direct" }],
      ["instance/i-03f4fcf6218b42829", { type: "Direct" }],
      ["instance/i-0646b682c2f834942", { type: "Direct" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "Direct" }],
      ["user/userManager", { type: "Direct" }],
      ["user/userWebDesign", { type: "Direct" }],
      ["function/<new>", { type: "Direct" }],
    ]),
  ],
  [
    "role/backEnd1Role-c586f31",
    new Map([["table/moleculesToTest-916cef1", { type: "Direct" }]]),
  ],
  [
    "role/backEnd2Role-e987d53",
    new Map([["table/achatFinance-67f122a", { type: "Direct" }]]),
  ],
  [
    "role/bastionRole-91ce197",
    new Map<string, Edge>([
      ["instance/<new>", { type: "Direct" }],
      ["instance/i-014d3e54c0d73c973", { type: "Direct" }],
      ["instance/i-0208dbc5e468df448", { type: "Direct" }],
      ["instance/i-02618bda4b1a5e805", { type: "Direct" }],
      ["instance/i-03f4fcf6218b42829", { type: "Direct" }],
      ["instance/i-0646b682c2f834942", { type: "Direct" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "Direct" }],
    ]),
  ],
  [
    "role/fetchRole",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "Direct" }],
      ["table/moleculesToTest-916cef1", { type: "Direct" }],
    ]),
  ],
  [
    "role/securityOfficeRole-7e94f46",
    new Map<string, Edge>([
      ["instance/<new>", { type: "Direct" }],
      ["instance/i-014d3e54c0d73c973", { type: "Direct" }],
      ["instance/i-0208dbc5e468df448", { type: "Direct" }],
      ["instance/i-02618bda4b1a5e805", { type: "Direct" }],
      ["instance/i-03f4fcf6218b42829", { type: "Direct" }],
      ["instance/i-0646b682c2f834942", { type: "Direct" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "Direct" }],
    ]),
  ],
  [
    "user/userManager",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "Escalation" }],
      ["table/moleculesToTest-916cef1", { type: "Escalation" }],
      ["role/securityOfficeRole-7e94f46", { type: "Direct" }],
    ]),
  ],
  [
    "user/userWebDesign",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "Escalation" }],
      ["table/moleculesToTest-916cef1", { type: "Escalation" }],
      ["user/userManager", { type: "Direct" }],
      ["user/userWebDesign", { type: "Direct" }],
    ]),
  ],
]);

export const SECOND_STEP_NODES = new Map<string, Node>([
  [
    "table/achatFinance-67f122a",
    {
      label: "",
      type: "aws:dynamodb:table",
      x: -6.028439521789551,
      y: 5.195812225341797,
      selected: false,
    },
  ],
  [
    "table/moleculesToTest-916cef1",
    {
      label: "",
      type: "aws:dynamodb:table",
      x: -6.028439521789551,
      y: -5.195812225341797,
      selected: false,
    },
  ],
  [
    "role/OrganizationAccountAccessRole",
    {
      label: "",
      type: "aws:iam:role",
      x: 5.269041538238525,
      y: 6.445446968078613,
      selected: false,
    },
  ],
  [
    "user/userManager",
    {
      label: "",
      type: "aws:iam:user",
      x: 5.269041061401367,
      y: -6.4454474449157715,
      selected: false,
    },
  ],
  [
    "user/userWebDesign",
    {
      label: "",
      type: "aws:iam:user",
      x: 0.38602033257484436,
      y: 7.522702460960318e-9,
      selected: true,
    },
  ],
]);

export const SECOND_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "role/OrganizationAccountAccessRole",
    new Map([["user/userWebDesign", { type: "Direct" }]]),
  ],
  [
    "user/userWebDesign",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "Escalation" }],
      ["table/moleculesToTest-916cef1", { type: "Escalation" }],
      ["user/userManager", { type: "Direct" }],
      ["user/userWebDesign", { type: "Direct" }],
    ]),
  ],
]);

export const THIRD_STEP_NODES = new Map<string, Node>([
  [
    "table/achatFinance-67f122a",
    {
      label: "",
      type: "aws:dynamodb:table",
      x: -0.8007437586784363,
      y: -11.310714721679688,
      selected: true,
    },
  ],
  [
    "user/userManager",
    {
      label: "",
      type: "aws:iam:user",
      x: 9.993010520935059,
      y: -1.3815494775772095,
      selected: false,
    },
  ],
  [
    "user/userWebDesign",
    {
      label: "",
      type: "aws:iam:user",
      x: 8.564098358154297,
      y: -7.431677341461182,
      selected: true,
    },
  ],
  [
    "role/securityOfficeRole-7e94f46",
    {
      label: "",
      type: "aws:iam:role",
      x: 4.112673759460449,
      y: 3.645914077758789,
    },
  ],
  [
    "instance/i-03f4fcf6218b42829",
    {
      label: "",
      type: "aws:ec2:instance",
      x: 0.02906927466392517,
      y: 10.313651084899902,
    },
  ],
  [
    "role/bastionRole-91ce197",
    {
      label: "",
      type: "aws:iam:role",
      x: -7.313409328460693,
      y: 7.27229642868042,
    },
  ],
  [
    "instance/i-0208dbc5e468df448",
    {
      label: "",
      type: "aws:ec2:instance",
      x: -5.486148357391357,
      y: -0.3300483822822571,
    },
  ],
  [
    "role/backEnd2Role-e987d53",
    {
      label: "",
      type: "aws:iam:role",
      x: -6.089226245880127,
      y: -8.04302978515625,
    },
  ],
]);

export const THIRD_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "user/userWebDesign",
    new Map([["user/userManager", { type: "Escalation" }]]),
  ],
  [
    "user/userManager",
    new Map([["role/securityOfficeRole-7e94f46", { type: "Direct" }]]),
  ],
  [
    "role/securityOfficeRole-7e94f46",
    new Map<string, Edge>([
      ["instance/i-03f4fcf6218b42829", { type: "Escalation" }],
      ["instance/i-0208dbc5e468df448", { type: "Escalation" }],
    ]),
  ],
  [
    "instance/i-03f4fcf6218b42829",
    new Map([["role/bastionRole-91ce197", { type: "Direct" }]]),
  ],
  [
    "role/bastionRole-91ce197",
    new Map([["instance/i-0208dbc5e468df448", { type: "Escalation" }]]),
  ],
  [
    "instance/i-0208dbc5e468df448",
    new Map([["role/backEnd2Role-e987d53", { type: "Direct" }]]),
  ],
  [
    "role/backEnd2Role-e987d53",
    new Map([["table/achatFinance-67f122a", { type: "Direct" }]]),
  ],
]);
