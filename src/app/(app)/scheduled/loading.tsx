import { DetailScreenSkeleton } from "@/components/states/screen-skeletons";

export default function Loading() {
  return <DetailScreenSkeleton title="Scheduled" showBack cards={3} />;
}
