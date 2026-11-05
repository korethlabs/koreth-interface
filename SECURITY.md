# Security Policy

## Status of this software

Koreth is **pre-beta, unaudited, and not production-ready**. It has not been through an
external security review. This repository is the web interface to a lending protocol
that itself is not audited, and the deployment at `app.koreth.finance` points at a test
chain. Do not use it to custody funds, and do not treat anything it displays as
accurate. Assume bugs are present, including bugs that would mislead you about a
position or a balance.

## Supported versions

Only `main` is supported. Tags, branches and prior commits receive no security fixes; a
report is acted on only if it still reproduces against `main`.

## Reporting a vulnerability

Use **GitHub private vulnerability reporting**: open this repository's **Security** tab
and press **Report a vulnerability**. That opens a private advisory visible only to the
reporter and the maintainers, and it is the primary channel for every security report.

Please **do not** open a public issue, a pull request, or any other public thread for a
suspected vulnerability. A public report discloses the problem before there is a fix.

A finding in the **deployed application** at `app.koreth.finance` goes through this same
private channel — there is no separate address for it. Say that you were looking at the
deployed app rather than the source, and give the route or the action that triggers the
behaviour.

What helps in a report: which page or component is affected, what an attacker gets out
of it, and the steps to reproduce it.

## What belongs here, and what does not

This repository is a frontend. In scope is this application's own code: how it reads and
presents on-chain and indexed data, how it constructs and bounds transactions before a
wallet signs them, wallet connection, and the build and dependency supply chain.

A figure the interface shows that is **wrong but not exploitable** — a mis-scaled
number, a stale value, a chart that reads oddly — is a bug rather than a security
report, and belongs in a normal public issue where it can be reproduced openly. A wrong
figure that **bounds a transaction**, so that acting on what the interface offers loses
value, is a security report; use the private channel.

The **contracts live in separate repositories** and have their own security policies.
A report about contract behaviour belongs there. If you are not sure which repository
owns the problem, report it here and say what you were looking at, so it can be routed.

## What to expect

Reports are reviewed on a best-effort basis. Koreth is a small team and there is **no
response-time commitment** — no acknowledgement SLA, no fix deadline, and no guarantee
that a given report will be acted on.

There is **no bug bounty programme**. No payment, reward or other compensation is
offered for a report.
