import type { Edge, Node } from "./graph/types";

export const FIRST_STEP_NODES = new Map<string, Node>([
  [
    "table/achatFinance-67f122a",
    { label: "achatFinance", type: "aws:dynamodb:table" },
  ],
  [
    "table/moleculesToTest-916cef1",
    { label: "moleculesToTest", type: "aws:dynamodb:table" },
  ],
  ["instance/<new>", { label: "<new>", type: "aws:ec2:instance" }],
  [
    "instance/i-014d3e54c0d73c973",
    { label: "i-014d3e...", type: "aws:ec2:instance" },
  ],
  [
    "instance/i-0208dbc5e468df448",
    { label: "i-0208db...", type: "aws:ec2:instance" },
  ],
  [
    "instance/i-02618bda4b1a5e805",
    { label: "i-02618b...", type: "aws:ec2:instance" },
  ],
  [
    "instance/i-03f4fcf6218b42829",
    { label: "i-03f4fc...", type: "aws:ec2:instance" },
  ],
  [
    "instance/i-0646b682c2f834942",
    { label: "i-0646b6...", type: "aws:ec2:instance" },
  ],
  [
    "instance/i-0e8674bb01fe5f35e",
    { label: "i-0e8674...", type: "aws:ec2:instance" },
  ],
  [
    "role/OrganizationAccountAccessRole",
    { label: "OrganizationAccountAccessRole", type: "aws:iam:role" },
  ],
  [
    "role/backEnd1Role-c586f31",
    { label: "backEnd1Role", type: "aws:iam:role" },
  ],
  [
    "role/backEnd2Role-e987d53",
    { label: "backEnd2Role", type: "aws:iam:role" },
  ],
  [
    "role/bastionRole-91ce197",
    { label: "bastionRole", type: "aws:iam:role" },
  ],
  ["role/fetchRole", { label: "fetchRole", type: "aws:iam:role" }],
  [
    "role/frontEnd1Role-13281f0",
    { label: "frontEnd1Role", type: "aws:iam:role" },
  ],
  [
    "role/frontEnd2Role-59ac465",
    { label: "frontEnd2Role", type: "aws:iam:role" },
  ],
  [
    "role/securityOfficeRole-7e94f46",
    { label: "securityOfficeRole", type: "aws:iam:role" },
  ],
  ["user/userManager", { label: "userManager", type: "aws:iam:user" }],
  ["user/userWebDesign", { label: "userWebDesign", type: "aws:iam:user" }],
  ["function/<new>", { label: "<new>", type: "aws:lambda:function" }],
]);

export const FIRST_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "instance/i-014d3e54c0d73c973",
    new Map([["role/frontEnd2Role-59ac465", { type: "privilege" }]]),
  ],
  [
    "instance/i-0208dbc5e468df448",
    new Map([["role/backEnd2Role-e987d53", { type: "privilege" }]]),
  ],
  [
    "instance/i-02618bda4b1a5e805",
    new Map([["role/frontEnd1Role-13281f0", { type: "privilege" }]]),
  ],
  [
    "instance/i-03f4fcf6218b42829",
    new Map([["role/bastionRole-91ce197", { type: "privilege" }]]),
  ],
  [
    "instance/i-0646b682c2f834942",
    new Map([["role/backEnd1Role-c586f31", { type: "privilege" }]]),
  ],
  [
    "role/OrganizationAccountAccessRole",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "privilege" }],
      ["table/moleculesToTest-916cef1", { type: "privilege" }],
      ["instance/<new>", { type: "privilege" }],
      ["instance/i-014d3e54c0d73c973", { type: "privilege" }],
      ["instance/i-0208dbc5e468df448", { type: "privilege" }],
      ["instance/i-02618bda4b1a5e805", { type: "privilege" }],
      ["instance/i-03f4fcf6218b42829", { type: "privilege" }],
      ["instance/i-0646b682c2f834942", { type: "privilege" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "privilege" }],
      ["user/userManager", { type: "privilege" }],
      ["user/userWebDesign", { type: "privilege" }],
      ["function/<new>", { type: "privilege" }],
    ]),
  ],
  [
    "role/backEnd1Role-c586f31",
    new Map([["table/moleculesToTest-916cef1", { type: "privilege" }]]),
  ],
  [
    "role/backEnd2Role-e987d53",
    new Map([["table/achatFinance-67f122a", { type: "privilege" }]]),
  ],
  [
    "role/bastionRole-91ce197",
    new Map<string, Edge>([
      ["instance/<new>", { type: "privilege" }],
      ["instance/i-014d3e54c0d73c973", { type: "privilege" }],
      ["instance/i-0208dbc5e468df448", { type: "privilege" }],
      ["instance/i-02618bda4b1a5e805", { type: "privilege" }],
      ["instance/i-03f4fcf6218b42829", { type: "privilege" }],
      ["instance/i-0646b682c2f834942", { type: "privilege" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "privilege" }],
    ]),
  ],
  [
    "role/fetchRole",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "privilege" }],
      ["table/moleculesToTest-916cef1", { type: "privilege" }],
    ]),
  ],
  [
    "role/securityOfficeRole-7e94f46",
    new Map<string, Edge>([
      ["instance/<new>", { type: "privilege" }],
      ["instance/i-014d3e54c0d73c973", { type: "privilege" }],
      ["instance/i-0208dbc5e468df448", { type: "privilege" }],
      ["instance/i-02618bda4b1a5e805", { type: "privilege" }],
      ["instance/i-03f4fcf6218b42829", { type: "privilege" }],
      ["instance/i-0646b682c2f834942", { type: "privilege" }],
      ["instance/i-0e8674bb01fe5f35e", { type: "privilege" }],
    ]),
  ],
  [
    "user/userManager",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "escalation" }],
      ["table/moleculesToTest-916cef1", { type: "escalation" }],
      ["role/securityOfficeRole-7e94f46", { type: "privilege" }],
    ]),
  ],
  [
    "user/userWebDesign",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "escalation" }],
      ["table/moleculesToTest-916cef1", { type: "escalation" }],
      ["user/userManager", { type: "privilege" }],
      ["user/userWebDesign", { type: "privilege" }],
    ]),
  ],
]);

export const SECOND_STEP_NODES = new Map<string, Node>([
  [
    "user/userWebDesign",
    { selected: true, label: "userWebDesign", type: "aws:iam:user" },
  ],
  [
    "role/OrganizationAccountAccessRole",
    {
      selected: false,
      label: "OrganizationAccountAccessRole",
      type: "aws:iam:role",
    },
  ],
  [
    "table/achatFinance-67f122a",
    { selected: false, label: "achatFinance", type: "aws:dynamodb:table" },
  ],
  [
    "table/moleculesToTest-916cef1",
    { selected: false, label: "moleculesToTest", type: "aws:dynamodb:table" },
  ],
  [
    "user/userManager",
    { selected: false, label: "userManager", type: "aws:iam:user" },
  ],
]);

export const SECOND_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "role/OrganizationAccountAccessRole",
    new Map([["user/userWebDesign", { type: "privilege" }]]),
  ],
  [
    "user/userWebDesign",
    new Map<string, Edge>([
      ["table/achatFinance-67f122a", { type: "escalation" }],
      ["table/moleculesToTest-916cef1", { type: "escalation" }],
      ["user/userManager", { type: "privilege" }],
      ["user/userWebDesign", { type: "privilege" }],
    ]),
  ],
]);

export const THIRD_STEP_NODES = new Map<string, Node>([
  ["user/userManager", { label: "userManager", type: "aws:iam:user" }],
  [
    "role/securityOfficeRole-7e94f46",
    { label: "securityOfficeRole", type: "aws:iam:role" },
  ],
  [
    "instance/i-03f4fcf6218b42829",
    { label: "i-03f4fc...", type: "aws:ec2:instance" },
  ],
  [
    "role/bastionRole-91ce197",
    { label: "bastionRole", type: "aws:iam:role" },
  ],
  [
    "instance/i-0208dbc5e468df448",
    { label: "i-0208db...", type: "aws:ec2:instance" },
  ],
  [
    "role/backEnd2Role-e987d53",
    { label: "backEnd2Role", type: "aws:iam:role" },
  ],
  [
    "table/achatFinance-67f122a",
    { selected: true, label: "achatFinance", type: "aws:dynamodb:table" },
  ],
  [
    "user/userWebDesign",
    { selected: true, label: "userWebDesign", type: "aws:iam:user" },
  ],
]);

export const THIRD_STEP_EDGES = new Map<string, Map<string, Edge>>([
  [
    "user/userWebDesign",
    new Map([["user/userManager", { type: "escalation" }]]),
  ],
  [
    "user/userManager",
    new Map([["role/securityOfficeRole-7e94f46", { type: "privilege" }]]),
  ],
  [
    "role/securityOfficeRole-7e94f46",
    new Map<string, Edge>([
      ["instance/i-03f4fcf6218b42829", { type: "escalation" }],
      ["instance/i-0208dbc5e468df448", { type: "escalation" }],
    ]),
  ],
  [
    "instance/i-03f4fcf6218b42829",
    new Map([["role/bastionRole-91ce197", { type: "privilege" }]]),
  ],
  [
    "role/bastionRole-91ce197",
    new Map([["instance/i-0208dbc5e468df448", { type: "escalation" }]]),
  ],
  [
    "instance/i-0208dbc5e468df448",
    new Map([["role/backEnd2Role-e987d53", { type: "privilege" }]]),
  ],
  [
    "role/backEnd2Role-e987d53",
    new Map([["table/achatFinance-67f122a", { type: "privilege" }]]),
  ],
]);
