// Barrel for the console chrome. Screens import { ConsoleShell } from
// '@/components/shell' — but in practice only (admin)/layout.tsx does, because
// the shell is rendered once for the whole group.
//
// 🔴 Nothing in this directory may be moved into packages/ui (AD11/AD12).
export * from './console-shell'
export * from './nav'
