import "server-only";

import { auth } from "@clerk/nextjs/server";
import { getDevAuth } from "@/lib/dev-auth";

/** Durable actor identifier for staff audit columns. */
export async function staffActorId(): Promise<string> {
  if (getDevAuth()?.role === "admin") return "development-staff";
  const { userId } = await auth();
  if (!userId) throw new Error("Authenticated staff identity required.");
  return userId;
}
