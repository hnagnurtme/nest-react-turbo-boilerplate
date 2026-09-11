import { LoginForm } from '../components/login-form';

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-2xl font-semibold">Sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
