# Shift Happens documentation

This folder contains the design documents of Shift Happens. Each document answers one deliverable of the course.

## Deliverables

| # | Deliverable | Document | Status |
|---|---|---|---|
| 3 | Product description: SRS, UML, identity management | [01-srs.md](01-srs.md) | Done |
| 4 | Architecture: style, containers, services, AWS mapping | [02-architecture.md](02-architecture.md), [ADR-0001](adr/0001-architecture-style.md) | Done |
| 5 | Error handling design | [03-error-handling.md](03-error-handling.md), [OpenAPI specification](api/openapi.yaml) | Done |
| 6 | Concurrency patterns usage | [04-concurrency.md](04-concurrency.md) | Done |
| 7 | Data model | Not started | Planned |
| 8 | Resiliency model | Not started | Planned |
| 9 | Security model | Not started | Planned |
| 10 | Deployment model | Not started | Planned |
| 11 | Analytics model | Not started | Planned |
| 12 | Monitoring and alerting model | Not started | Planned |

## Where to find the course requirements

| Requirement | Location |
|---|---|
| High-level architecture | [01-srs.md](01-srs.md), section 2.7, and [02-architecture.md](02-architecture.md) |
| Functional requirements (min 10) | [01-srs.md](01-srs.md), section 3.2: 18 requirements |
| Non-functional requirements (min 5) | [01-srs.md](01-srs.md), section 3.3: 9 requirements |
| Actors and personas (min 2) | [01-srs.md](01-srs.md), section 2.4: 3 primary actors, 4 system actors |
| UML diagrams | [01-srs.md](01-srs.md), section 2.2 (use case) and appendixes A and B (class, state) |
| Identity management | [01-srs.md](01-srs.md), section 3.3.2.1 |
| Diagrams as code | All diagrams are Mermaid code in the Markdown files |
| APIs with errors 400, 403, 404, 409, 422, 429 (min 10) | [api/openapi.yaml](api/openapi.yaml) and [03-error-handling.md](03-error-handling.md): 12 operations |
| Concurrency flows (min 5) | [04-concurrency.md](04-concurrency.md): 6 scenarios with sequence diagrams |

## Conventions

- The documents use ASD-STE100 Simplified Technical English.
- Requirement statements use the keywords "shall", "should" and "may" as RFC 2119 defines them.
- All diagrams are Mermaid code. GitHub shows them as pictures. The use case diagram also has a rendered copy in [diagrams/use-case.svg](diagrams/use-case.svg).
- The API specification uses OpenAPI 3.1. All error responses use the RFC 9457 problem details format.

## Checks

You need Node.js 22.13 or later. Run the commands from the repository root.

```sh
npm ci
npm run docs:check
```

The `docs:check` script runs these checks:

| Script | What it checks |
|---|---|
| `npm run docs:lint:md` | Markdown style (markdownlint) |
| `npm run docs:lint:links` | Relative links and anchors (remark-validate-links) |
| `npm run docs:lint:api` | The OpenAPI file is valid, and all examples agree with their schemas (Redocly) |
| `npm run docs:check:mermaid` | All Mermaid diagrams render with Mermaid 12, the version that GitHub uses |

Other scripts:

| Script | What it does |
|---|---|
| `npm run docs:build:api` | Builds a readable HTML page of the API in `dist/api.html` |
| `npm run docs:export:diagrams` | Writes the Mermaid diagrams that have an `%% export: <name>` line to `docs/diagrams/<name>.svg` |

The GitHub Actions workflow [docs.yml](../.github/workflows/docs.yml) runs `npm run docs:check` on every pull request.
