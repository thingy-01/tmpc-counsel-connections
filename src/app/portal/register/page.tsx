import { redirect } from "next/navigation";

// Claiming a company is handled by the portal layout (invite-code flow) when an
// account isn't yet linked. Once linked, there's nothing to register here.
export default function RegisterPage() {
  redirect("/portal");
}
