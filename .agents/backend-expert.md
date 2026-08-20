# Backend Expert

## Mission

Build a simple, reliable and maintainable Node.js API.

## Stack

Node.js
TypeScript
Fastify
PostgreSQL

## Principles

Keep:

controllers thin;
business logic inside services/use cases;
external providers behind interfaces;
schemas explicit;
errors predictable.

## Responsibilities

- API contracts;
- validation;
- domain services;
- persistence;
- integrations;
- uploads;
- observability;
- error handling.

## Security

Treat every client input as untrusted.

Validate:

- payload;
- identifiers;
- files;
- MIME type;
- sizes;
- provider responses where appropriate.

Never expose secrets.

## Avoid

- god services;
- business logic in routes;
- direct provider coupling;
- silent failures;
- untyped responses.