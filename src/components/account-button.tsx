import { UserButton } from "@clerk/nextjs";
import { getDevAuth } from "@/lib/dev-auth";

/**
 * The Clerk account button, or a static badge when running with the
 * DEV_AUTH local bypass (where ClerkProvider is not mounted).
 */
export default function AccountButton() {
  const dev = getDevAuth();
  if (dev) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
        DEV
      </span>
    );
  }
  return <UserButton />;
}
