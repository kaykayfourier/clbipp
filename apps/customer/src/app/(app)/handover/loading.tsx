import { DetailScreenSkeleton } from "@clbipp/ui";

// Shown while acceptOffer runs + the confirmation renders. hideNav-style detail
// skeleton without a back button (handover is a confirmation, not a sub-page).
export default function Loading() {
  return <DetailScreenSkeleton title="Handover" showBack={false} cards={3} />;
}
