import { redirect } from "next/navigation";
import { getAttorneyIdentity } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AttorneyPage() {
  const identity = await getAttorneyIdentity();
  redirect(identity ? "/attorney/schedule" : "/attorney/login");
}
