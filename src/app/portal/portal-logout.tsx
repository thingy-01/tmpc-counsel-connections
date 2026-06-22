import { logoutCompany } from "./actions";

/** Clears the email-free company session. */
export default function PortalLogout() {
  return (
    <form action={logoutCompany}>
      <button
        type="submit"
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
      >
        Log out
      </button>
    </form>
  );
}
