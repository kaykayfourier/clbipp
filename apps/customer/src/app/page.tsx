import { redirect } from "next/navigation";

// The root route is just an entry point (also the PWA's start_url). Unauthenticated
// users are already bounced to /login by middleware; authenticated users landing
// here — e.g. the installed app relaunching at "/" — go to the dashboard, the
// app's home screen.
export default function Home() {
  redirect("/dashboard");
}
