import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '@repo/api-contract';
import { Button } from '@repo/ui/primitives/button';
import { Input } from '@repo/ui/primitives/input';
import { FormField } from '@repo/ui/composites/form-field';
import { ProblemError } from '@/lib/http/problem-error';
import { useSessionStore } from '@/entities/session';
import { broadcastAuthEvent } from '@/lib/http/broadcast';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const setSession = useSessionStore((s) => s.setSession);
  const navigate = useNavigate();

  const login = useLogin({
    onSuccess: (result) => {
      setSession({
        accessToken: result.accessToken,
        csrfToken: result.csrfToken,
        user: result.user,
        memberships: result.memberships,
      });
      broadcastAuthEvent({ type: 'login' });
      navigate('/', { replace: true });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  // Same message for a wrong email and a wrong password (doc 03 section 4):
  // the backend already returns one INVALID_CREDENTIALS code for both.
  const errorMessage =
    login.error instanceof ProblemError ? login.error.problem.detail : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <FormField label="Email">
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      <FormField label="Password" error={errorMessage}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
