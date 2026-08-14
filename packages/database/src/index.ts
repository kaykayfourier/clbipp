// Single entry point for everything database-shaped: the Prisma singleton,
// plus every generated model type and enum. App code imports the client and
// its types from "@clbipp/database" only — never from a generated path.
export { prisma } from "./client";
export * from "./generated/client";
