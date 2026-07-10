import { DetailScreenSkeleton } from "@/components/states/screen-skeletons";

// No title — the real header shows the pickup id, which isn't known until the
// data loads. showBack keeps the header present so it doesn't flash in.
export default function Loading() {
  return <DetailScreenSkeleton showBack cards={2} />;
}
