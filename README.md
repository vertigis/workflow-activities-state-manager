# Workflow State Engine – Activity Pack

A deterministic, policy‑enforcing workflow engine designed for **ArcGIS Enterprise + VertiGIS Studio Workflows**, used to implement **non‑bypassable business processes** such as Utility Network asset lifecycle management, permitting, inspections, and regulatory workflows.

---

## Overview

The **Workflow State Engine Activity Pack** provides a reusable execution framework for building **guided, auditable, and defensible workflows** where:

- Business rules **must not be bypassed**
- Lifecycle transitions must be **explicit and deterministic**
- Data edits must be **atomic and undoable**
- Validation, execution, and audit concerns are **cleanly separated**

The engine is configuration‑driven and executes workflows defined as **state machines**, rather than UI‑driven scripts.

---

## What This Is (and Is Not)

### ✅ What it *is*
- A **state‑based execution engine**
- A **policy enforcement layer** for GIS workflows
- A **coordination mechanism** for VertiGIS Workflow handlers
- A **repeatable execution model** for complex lifecycle logic

### ❌ What it is *not*
- Not a BPMN engine
- Not a UI framework
- Not a general task scheduler
- Not a replacement for ArcGIS Utility Network rules

---

## Key Capabilities

- ✅ Deterministic state progression
- ✅ Explicit lifecycle transitions
- ✅ Token‑based parallel execution
- ✅ WAIT / RESUME semantics for long‑running processes
- ✅ Atomic, undoable edits
- ✅ First‑class audit and history logging
- ✅ Schema‑driven decision making (Asset Groups, Asset Types, Categories)
- ✅ Designed for regulatory and safety‑critical workflows

---

## Core Concepts

### State
A named step in a workflow. States are one of:
- `handler` – executes business logic
- `join` – synchronizes parallel tokens
- `terminal` – ends execution

### Handler
A VertiGIS Workflow activity that:
- Receives execution context
- Applies business logic (or validation)
- Returns an explicit outcome

### Instance
Represents the **overall workflow execution** (e.g., “Retire Assets”).

### Token
Represents a **parallel or scoped sub‑workflow** (e.g., ENV review, TECH review).

---

## Execution Modes

| Mode | Description |
|----|------------|
| INSTANCE | Controls the overall lifecycle |
| TOKEN | Executes parallel or scoped logic |

**Rules**
- Tokens may not enter join states
- Tokens may not modify instance‑level state
- Join states only execute in INSTANCE mode

---

## Configuration‑Driven Design

Workflows are defined using JSON / JSONC configuration files.

### Example

```jsonc
{
  "processKey": "ASSET_RETIRE_MIDSTREAM_GAS",
  "startState": "INITIATE",
  "states": {
    "INITIATE": { "type": "handler", "handler": "WF_State_InitiateRetire" },
    "VALIDATE": { "type": "handler", "handler": "WF_State_ValidateRetireEligibility" },
    "EXECUTE":  { "type": "handler", "handler": "WF_State_ExecuteRetirement" },
    "END":      { "type": "terminal" }
  }
}