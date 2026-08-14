// Barrel for @clbipp/pdf — the three documents the platform issues.
//
// Importing this pulls in ./render, which is "server-only". That is deliberate:
// there is no legitimate reason for a client component to reach into this
// package, and the build error is a better outcome than a 3 MB PDF renderer
// silently landing in a browser bundle.
export * from './types'
export * from './render'
