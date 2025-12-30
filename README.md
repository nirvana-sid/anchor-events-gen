# gen-anchor-events

Generate TypeScript event types from Anchor IDL files.

## Installation

Install from GitHub using pnpm:

```bash
pnpm add github:nirvana-sid/anchor-events-gen
```

## Usage

```typescript
import { generateEventsFromIDL } from 'anchor-events-gen';

// Generate TypeScript events from IDL
generateEventsFromIDL('./idl/program.json', './src/events.ts');
```

## Input Format

The tool expects an Anchor IDL JSON file with the following structure:

```json
{
  "events": [
    {
      "name": "EventName",
      "fields": [
        {
          "name": "fieldName",
          "type": "u64" | "string" | "publicKey" | { "defined": "CustomType" }
        }
      ]
    }
  ],
  "types": [
    {
      "name": "CustomType",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fieldName",
            "type": "string"
          }
        ]
      }
    }
  ]
}
```

## Output

The tool generates TypeScript interfaces for all events and their custom types, plus utility types and functions:

- Event interfaces (e.g., `UserCreated`, `UserUpdated`)
- Custom type interfaces (e.g., `UserData`)
- `EventRaw` type for raw event data
- `ParsedEvents` type for organized event collections
- `parseEvents()` function for parsing raw events into organized collections

## Example

Given an IDL with events, the tool generates:

```typescript
// Generated event types from program.json
// Do not edit manually

import { BN, web3 } from "@coral-xyz/anchor";

export interface UserData {
  name: string;
  age: number;
  balance: BN;
}

export interface UserCreated {
  user: UserData;
  timestamp: BN;
}

export type ParsedEvents = {
  UserCreated: UserCreated[];
};

export function parseEvents(events: EventRaw[]): ParsedEvents {
  // ... parsing logic
}
```

## License

MIT
