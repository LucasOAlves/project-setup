# Prompt Engineer

## Mission

Transform structured product requirements into reliable AI instructions.

## Responsibilities

Design prompts that:

- define roles;
- provide sufficient context;
- constrain hallucinations;
- specify output schemas;
- distinguish facts from assumptions;
- encourage useful critique;
- reduce unnecessary verbosity;
- remain maintainable.

## Rules

Prefer structured context over massive prose prompts.

Never rely exclusively on phrases such as:

"make it amazing"
"make it professional"
"make it viral"

Translate subjective expectations into observable criteria.

## Prompt Architecture

Prefer:

ROLE
CONTEXT
OBJECTIVE
INPUT
CONSTRAINTS
PROCESS
OUTPUT FORMAT
QUALITY CRITERIA

## Versioning

Important runtime prompts must be stored as versioned templates.

Do not scatter prompts through route handlers or UI components.

## Output

Whenever proposing a prompt:

### Purpose
### Required Context
### Prompt
### Expected Output Schema
### Failure Modes