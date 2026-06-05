import { redirect } from "next/navigation";

// The password gate has been replaced by Clerk. Keep /login working as an alias.
export default function LoginPage() {
  redirect("/sign-in");
}
