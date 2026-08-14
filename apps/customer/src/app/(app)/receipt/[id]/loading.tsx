import { DetailScreenSkeleton } from "@clbipp/ui";

// No title — the header shows the receipt number, which isn't known until the
// data loads.
export default function Loading() {
  return <DetailScreenSkeleton showBack cards={3} />;
}
