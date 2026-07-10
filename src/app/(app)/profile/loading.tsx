import { DetailScreenSkeleton } from "@/components/states/screen-skeletons";

export default function Loading() {
  return <DetailScreenSkeleton title="Profile" showBack={false} cards={3} />;
}
