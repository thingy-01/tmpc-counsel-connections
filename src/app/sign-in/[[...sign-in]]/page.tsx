import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          TMCP Counsel Connections
        </h1>
        <p className="mt-2 text-slate-600">
          Texas Minority Counsel Program — Attorney Interview Scheduling
        </p>
      </div>
      <SignIn />
    </div>
  );
}
