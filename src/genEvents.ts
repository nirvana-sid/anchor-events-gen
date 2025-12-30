import * as fs from "fs"
import * as path from "path"

export interface Field {
  name: string
  type: string | { defined: string } | { array: [string, number] }
  index?: boolean
  docs?: string[]
}

export interface Event {
  name: string
  fields: Field[]
  docs?: string[]
}

export interface IDL {
  events: Event[]
  types: Array<{
    name: string
    docs?: string[]
    type: {
      kind: string
      fields?: Field[]
    }
  }>
}

/**
 * Generates a JSDoc comment from a docs array
 * @param docs - Array of documentation strings
 * @param indent - Indentation string (default: "")
 * @returns JSDoc comment string or empty string if no docs
 */
function generateJsDoc(docs: string[] | undefined, indent: string = ""): string {
  if (!docs || docs.length === 0) return ""

  if (docs.length === 1) {
    return `${indent}/** ${docs[0]} */\n`
  }

  const lines = docs.map(line => `${indent} * ${line}`).join("\n")
  return `${indent}/**\n${lines}\n${indent} */\n`
}

function typeToTypeScript(type: string | { defined: string } | { array: [string, number] }): string {
  if (typeof type === "string") {
    switch (type) {
      case "u64":
      case "i64":
      case "u128":
      case "i128":
        return "BN"
      case "u32":
      case "u16":
      case "usize":
      case "u8":
      case "i32":
      case "i16":
      case "i8":
        return "number"
      case "publicKey":
        return "web3.PublicKey"
      case "bool":
        return "boolean"
      case "string":
        return "string"
      default:
        return type
    }
  } else if ("defined" in type) {
    return type.defined
  } else if ("array" in type) {
    const [elementType, size] = type.array
    return `[${typeToTypeScript(elementType)}${`, ${typeToTypeScript(elementType)}`.repeat(size - 1)}]`
  }
  return "unknown"
}

/**
 * Converts a type to a JSON type
 * @param type - The type to convert
 * @returns The JSON type
 */
function typeToJson(type: string | { defined: string } | { array: [string, number] }): string {
  if (typeof type === "string") {
    switch (type) {
      case "u64":
      case "i64":
      case "u128":
      case "i128":
        return "string"
      case "u32":
      case "usize":
      case "u16":
      case "u8":
      case "i32":
      case "i16":
      case "i8":
        return "number"
      case "publicKey":
        return "string"
      case "bool":
        return "boolean"
      case "string":
        return "string"
      default:
        return type
    }
  } else if ("defined" in type) {
    return type.defined + "JSON"
  } else if ("array" in type) {
    const [elementType, size] = type.array
    return `[${typeToJson(elementType)}${`, ${typeToJson(elementType)}`.repeat(size - 1)}]`
  }
  return "unknown"
}

function generateEventInterface(event: Event): string {
  const fields = event.fields
    .map((field) => {
      const tsType = typeToTypeScript(field.type)
      const fieldDoc = generateJsDoc(field.docs, "  ")
      return `${fieldDoc}  ${field.name}: ${tsType};`
    })
    .join("\n")

  const interfaceDoc = generateJsDoc(event.docs)
  return `${interfaceDoc}export interface ${event.name} {\n${fields}\n}`
}

/**
 * Generates code to convert a field from TypeScript to JSON
 */
function generateToJsonFieldConversion(
  fieldName: string,
  fieldType: string | { defined: string } | { array: [string, number] },
): string {
  if (typeof fieldType === "string") {
    switch (fieldType) {
      case "u64":
      case "i64":
      case "u128":
      case "i128":
        return `${fieldName}: this.data.${fieldName}.toString()`
      case "publicKey":
        return `${fieldName}: this.data.${fieldName}.toBase58()`
      case "u32":
      case "u16":
      case "u8":
      case "i32":
      case "i16":
      case "i8":
      case "bool":
      case "string":
        return `${fieldName}: this.data.${fieldName}`
      default:
        return `${fieldName}: this.data.${fieldName}`
    }
  } else if ("defined" in fieldType) {
    return `${fieldName}: new ${fieldType.defined}Helper(this.data.${fieldName}).toJSON()`
  } else if ("array" in fieldType) {
    const [elementType, size] = fieldType.array
    if (typeof elementType === "string") {
      if (elementType === "u64" || elementType === "i64" || elementType === "u128" || elementType === "i128") {
        return `${fieldName}: [${Array.from({ length: size })
          .map((_, i) => `this.data.${fieldName}[${i}].toString()`)
          .join(", ")}] as any`
      } else if (elementType === "publicKey") {
        return `${fieldName}: [${Array.from({ length: size })
          .map((_, i) => `this.data.${fieldName}[${i}].toBase58()`)
          .join(", ")}] as any`
      } else {
        return `${fieldName}: this.data.${fieldName}`
      }
    } else if (typeof elementType === "object") {
      const definedType = (elementType as { defined: string }).defined
      return `${fieldName}: [${Array.from({ length: size })
        .map((_, i) => `new ${definedType}Helper(this.data.${fieldName}[${i}]).toJSON()`)
        .join(", ")}] as any`
    }
    return `${fieldName}: this.data.${fieldName}`
  }
  return `${fieldName}: this.data.${fieldName}`
}

/**
 * Generates code to convert a field from JSON to TypeScript
 */
function generateFromJsonFieldConversion(
  fieldName: string,
  fieldType: string | { defined: string } | { array: [string, number] },
): string {
  if (typeof fieldType === "string") {
    switch (fieldType) {
      case "u64":
      case "i64":
      case "u128":
      case "i128":
        return `${fieldName}: new BN(json.${fieldName})`
      case "publicKey":
        return `${fieldName}: new web3.PublicKey(json.${fieldName})`
      case "u32":
      case "u16":
      case "u8":
      case "i32":
      case "i16":
      case "i8":
      case "bool":
      case "string":
        return `${fieldName}: json.${fieldName}`
      default:
        return `${fieldName}: json.${fieldName}`
    }
  } else if ("defined" in fieldType) {
    return `${fieldName}: ${fieldType.defined}Helper.fromJSON(json.${fieldName})`
  } else if ("array" in fieldType) {
    const [elementType, size] = fieldType.array
    if (typeof elementType === "string") {
      if (elementType === "u64" || elementType === "i64" || elementType === "u128" || elementType === "i128") {
        return `${fieldName}: [${Array.from({ length: size })
          .map((_, i) => `new BN(json.${fieldName}[${i}])`)
          .join(", ")}] as any`
      } else if (elementType === "publicKey") {
        return `${fieldName}: [${Array.from({ length: size })
          .map((_, i) => `new web3.PublicKey(json.${fieldName}[${i}])`)
          .join(", ")}] as any`
      } else {
        return `${fieldName}: json.${fieldName}`
      }
    } else if (typeof elementType === "object") {
      const definedType = (elementType as { defined: string }).defined
      return `${fieldName}: [${Array.from({ length: size })
        .map((_, i) => `${definedType}Helper.fromJSON(json.${fieldName}[${i}])`)
        .join(", ")}] as any`
    }
    return `${fieldName}: json.${fieldName}`
  }
  return `${fieldName}: json.${fieldName}`
}

/**
 * Generates a JSON-serializable interface for an event
 */
function generateEventJsonInterface(event: Event): string {
  const fields = event.fields
    .map((field) => {
      const jsonType = typeToJson(field.type)
      const fieldDoc = generateJsDoc(field.docs, "  ")
      return `${fieldDoc}  ${field.name}: ${jsonType};`
    })
    .join("\n")

  const interfaceDoc = generateJsDoc(event.docs)
  return `${interfaceDoc}export interface ${event.name}JSON {\n${fields}\n}`
}

function findCustomTypes(events: Event[], allTypes: IDL["types"]): Set<string> {
  const customTypes = new Set<string>()

  for (const event of events) {
    for (const field of event.fields) {
      if (typeof field.type === "object" && "defined" in field.type) {
        customTypes.add(field.type.defined)
      }
    }
  }

  // Recursively find types referenced by custom types
  const processedTypes = new Set<string>()
  const typesToProcess = Array.from(customTypes)

  while (typesToProcess.length > 0) {
    const typeName = typesToProcess.pop()!
    if (processedTypes.has(typeName)) continue
    processedTypes.add(typeName)

    const typeDefinition = allTypes.find((t) => t.name === typeName)
    if (typeDefinition && typeDefinition.type.fields) {
      for (const field of typeDefinition.type.fields) {
        if (typeof field.type === "object" && "defined" in field.type) {
          if (!processedTypes.has(field.type.defined)) {
            typesToProcess.push(field.type.defined)
            customTypes.add(field.type.defined)
          }
        }
      }
    }
  }

  return customTypes
}

function generateCustomTypeInterface(typeDef: IDL["types"][0]): string {
  if (!typeDef.type.fields) return ""

  const fields = typeDef.type.fields
    .map((field) => {
      const tsType = typeToTypeScript(field.type)
      const fieldDoc = generateJsDoc(field.docs, "  ")
      return `${fieldDoc}  ${field.name}: ${tsType};`
    })
    .join("\n")

  const interfaceDoc = generateJsDoc(typeDef.docs)
  return `${interfaceDoc}export interface ${typeDef.name} {\n${fields}\n}`
}

/**
 * Generates a JSON-serializable interface for a custom type
 */
function generateCustomTypeJsonInterface(typeDef: IDL["types"][0]): string {
  if (!typeDef.type.fields) return ""

  const fields = typeDef.type.fields
    .map((field) => {
      const jsonType = typeToJson(field.type)
      const fieldDoc = generateJsDoc(field.docs, "  ")
      return `${fieldDoc}  ${field.name}: ${jsonType};`
    })
    .join("\n")

  const interfaceDoc = generateJsDoc(typeDef.docs)
  return `${interfaceDoc}export interface ${typeDef.name}JSON {\n${fields}\n}`
}

/**
 * Generates the file header with imports and interface definitions
 */
function generateHeader(): string {
  return `// Generated event types from Anchor IDL
// Do not edit manually

import { BN, web3 } from "@coral-xyz/anchor";

/**
 * Generic interface for event helper classes
 */
export interface IEventHelper<T, TJSON> {
  toJSON(): TJSON;
  name(): string;
  getData(): T;
}

/**
 * Constructor interface for event helper classes
 */
export interface IEventHelperConstructor<T, TJSON> {
  new(data: T): IEventHelper<T, TJSON>;
  fromJSON(json: TJSON): T;
  eventName: string;
}

`
}

/**
 * Generates all custom type interfaces
 */
function generateCustomTypeInterfaces(customTypes: Set<string>, allTypes: IDL["types"]): string {
  let content = ""
  const generatedTypes = new Set<string>()

  for (const typeName of customTypes) {
    const typeDef = allTypes.find((t) => t.name === typeName)
    if (typeDef && !generatedTypes.has(typeName)) {
      content += generateCustomTypeInterface(typeDef) + "\n\n"
      generatedTypes.add(typeName)
    }
  }

  return content
}

/**
 * Generates all event interfaces
 */
function generateEventInterfaces(events: Event[]): string {
  let content = ""

  for (const event of events) {
    content += generateEventInterface(event) + "\n\n"
  }

  return content
}

/**
 * Generates all custom type JSON interfaces
 */
function generateCustomTypeJsonInterfaces(customTypes: Set<string>, allTypes: IDL["types"]): string {
  let content = ""
  const generatedTypes = new Set<string>()

  for (const typeName of customTypes) {
    const typeDef = allTypes.find((t) => t.name === typeName)
    if (typeDef && !generatedTypes.has(typeName)) {
      content += generateCustomTypeJsonInterface(typeDef) + "\n\n"
      generatedTypes.add(typeName)
    }
  }

  return content
}

/**
 * Generates all event JSON interfaces
 */
function generateEventJsonInterfaces(events: Event[]): string {
  let content = ""

  for (const event of events) {
    content += generateEventJsonInterface(event) + "\n\n"
  }

  return content
}

/**
 * Generates a helper class for a custom type
 */
function generateCustomTypeHelperClass(typeDef: IDL["types"][0]): string {
  if (!typeDef.type.fields) return ""

  const toJsonFields = typeDef.type.fields
    .map((field) => generateToJsonFieldConversion(field.name, field.type))
    .join(",\n      ")

  const fromJsonFields = typeDef.type.fields
    .map((field) => generateFromJsonFieldConversion(field.name, field.type))
    .join(",\n      ")

  return `export class ${typeDef.name}Helper implements IEventHelper<${typeDef.name}, ${typeDef.name}JSON> {
  static readonly eventName = "${typeDef.name}";

  constructor(private data: ${typeDef.name}) {}

  static fromJSON(json: ${typeDef.name}JSON): ${typeDef.name} {
    return {
      ${fromJsonFields}
    };
  }

  toJSON(): ${typeDef.name}JSON {
    return {
      ${toJsonFields}
    };
  }

  name(): string {
    return ${typeDef.name}Helper.eventName;
  }

  getData(): ${typeDef.name} {
    return this.data;
  }
}`
}

/**
 * Generates a helper class for an event
 */
function generateEventHelperClass(event: Event): string {
  const toJsonFields = event.fields
    .map((field) => generateToJsonFieldConversion(field.name, field.type))
    .join(",\n      ")

  const fromJsonFields = event.fields
    .map((field) => generateFromJsonFieldConversion(field.name, field.type))
    .join(",\n      ")

  return `export class ${event.name}Helper implements IEventHelper<${event.name}, ${event.name}JSON> {
  static readonly eventName = "${event.name}";

  constructor(private data: ${event.name}) {}

  static fromJSON(json: ${event.name}JSON): ${event.name} {
    return {
      ${fromJsonFields}
    };
  }

  toJSON(): ${event.name}JSON {
    return {
      ${toJsonFields}
    };
  }

  name(): string {
    return ${event.name}Helper.eventName;
  }

  getData(): ${event.name} {
    return this.data;
  }
}`
}

/**
 * Generates all custom type helper classes
 */
function generateCustomTypeHelperClasses(customTypes: Set<string>, allTypes: IDL["types"]): string {
  let content = ""
  const generatedTypes = new Set<string>()

  for (const typeName of customTypes) {
    const typeDef = allTypes.find((t) => t.name === typeName)
    if (typeDef && !generatedTypes.has(typeName)) {
      content += generateCustomTypeHelperClass(typeDef) + "\n\n"
      generatedTypes.add(typeName)
    }
  }

  return content
}

/**
 * Generates all event helper classes
 */
function generateEventHelperClasses(events: Event[]): string {
  let content = ""

  for (const event of events) {
    content += generateEventHelperClass(event) + "\n\n"
  }

  return content
}

/**
 * Generates the EventRaw type definition
 */
function generateEventRawType(): string {
  return `export type EventRaw = {
  name: EventName;
  data: unknown;
};\n\n`
}

/**
 * Generates the ParsedEvents type definition
 */
function generateParsedEventsType(events: Event[]): string {
  let content = `export type ParsedEvents = {\n`

  for (const event of events) {
    content += `  ${event.name}: ${event.name}[];\n`
  }

  content += `};\n\n`

  return content
}

/**
 * Generates the event helper registry
 */
function generateEventHelperRegistry(events: Event[]): string {
  let content = `/**
 * Registry of all event helper classes
 */
export const EVENT_HELPER_REGISTRY: Record<string, IEventHelperConstructor<any, any>> = {\n`

  for (const event of events) {
    content += `  '${event.name}': ${event.name}Helper,\n`
  }

  content += `};\n\n`

  return content
}

function generateEventNameStringType(events: Event[]): string {
  let content = `export type EventName = ${events.map((event) => `"${event.name}"`).join(" | ")};\n\n`
  return content
}

/**
 * Generates the factory function to create event helpers from EventRaw
 */
function generateEventHelperFactory(events: Event[]): string {
  return `/**
 * Creates an event helper from an EventRaw object
 * @param event - The raw event to create a helper for
 * @returns An event helper instance, or null if the event type is unknown
 */
export function createEventHelper(event: EventRaw): IEventHelper<any, any> | null {
  const HelperClass = EVENT_HELPER_REGISTRY[event.name];
  if (HelperClass) {
    return new HelperClass(event.data);
  }
  console.warn(\`Unknown event type: \${event.name}\`);
  return null;
}\n`
}

/**
 * Generates the parseEvents function implementation
 */
function generateParseEventsFunction(events: Event[]): string {
  let content = `export function parseEvents(events: EventRaw[]): ParsedEvents {
  const result: ParsedEvents = {\n`

  for (const event of events) {
    content += `    ${event.name}: [],\n`
  }

  content += `  };

  for (const event of events) {
    switch (event.name) {\n`

  for (const event of events) {
    content += `      case '${event.name}':\n`
    content += `        result.${event.name}.push(event.data as ${event.name});\n`
    content += `        break;\n`
  }

  content += `      default:
        console.warn(\`Unknown event type: \${event.name}\`);
    }
  }

  return result;
}\n`

  return content
}

export async function generateEventsFromIDL(idlPath: string, outputPath: string): Promise<void> {
  const idlContent = await fs.promises.readFile(idlPath, "utf-8")
  const idl: IDL = JSON.parse(idlContent)

  // Find all custom types used in events
  const customTypes = findCustomTypes(idl.events, idl.types)

  // Generate TypeScript content by composing sections
  const content = [
    generateHeader(),
    generateCustomTypeInterfaces(customTypes, idl.types),
    generateEventInterfaces(idl.events),
    generateCustomTypeJsonInterfaces(customTypes, idl.types),
    generateEventJsonInterfaces(idl.events),
    generateCustomTypeHelperClasses(customTypes, idl.types),
    generateEventHelperClasses(idl.events),
    generateEventNameStringType(idl.events),
    generateEventRawType(),
    generateEventHelperRegistry(idl.events),
    generateEventHelperFactory(idl.events),
    generateParsedEventsType(idl.events),
    generateParseEventsFunction(idl.events),
  ].join("")

  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, content.trim() + "\n")

  console.log(`Generated ${idl.events.length} event types to ${outputPath}`)
  console.log(`Included ${customTypes.size} custom types: ${Array.from(customTypes).join(", ")}`)
}
