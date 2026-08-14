import { LoadingState } from "@clbipp/ui";

// /track just resolves which pickup to show and redirects, so a centred loader
// is the right fallback here (there's no stable layout to skeleton yet).
export default function Loading() {
  return <LoadingState label="Loading…" />;
}
