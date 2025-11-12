import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useLocation } from "react-router-dom";
import "./login.css";

type LoginStatus = "idle" | "submitting" | "success";

type LocationState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
};

const LoginLayout = ({ children }: React.PropsWithChildren) => (
  <main className="login-page">{children}</main>
);

const LoginCard = ({ children }: React.PropsWithChildren) => (
  <section className="login-card">{children}</section>
);

const LoginHeader = () => (
  <header className="login-header">
    <h1>Welcome back</h1>
    <p>
      CoursHub Management Panel
    </p>
  </header>
);

type LoginFieldProps = {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

const LoginField = ({
  id,
  label,
  type,
  autoComplete,
  value,
  placeholder,
  disabled,
  onChange,
}: LoginFieldProps) => (
  <label className="login-field" htmlFor={id}>
    <span>{label}</span>
    <input
      id={id}
      name={id}
      type={type}
      autoComplete={autoComplete}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="login-input"
      disabled={disabled}
      required
    />
  </label>
);

const LoginButton = ({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) => (
  <button type="submit" className="login-button" disabled={disabled}>
    {label}
  </button>
);

const LoginStatusMessage = ({ error, status }: { error: boolean; status: LoginStatus }) => {
  if (error) {
    return <p role="alert" className="login-status login-status--error">Failed to log in.</p>;
  }
  if (status === "success") {
    return (
      <p className="login-status login-status--success">
        Signed in. Redirecting…
      </p>
    );
  }
  return <p className="login-status login-status--placeholder" aria-hidden="true" />;
};

const LoginPage = () => {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authStateLoading } = useConvexAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<LoginStatus>("idle");

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect");
    if (redirect?.startsWith("/")) {
      return redirect;
    }

    const state = location.state as LocationState | null;
    if (state?.from) {
      const target = `${state.from.pathname ?? ""}${state.from.search ?? ""}${state.from.hash ?? ""}`;
      if (target.startsWith("/")) {
        return target;
      }
    }

    return "/";
  }, [location]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("login-body");
      return () => {
        document.body.classList.remove("login-body");
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!authStateLoading && isAuthenticated) {
      setStatus("success");
      const timeout = window.setTimeout(() => {
        window.location.assign(redirectPath);
      }, 900);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [authStateLoading, isAuthenticated, redirectPath]);

  const isProcessing = useMemo(() => {
    if (status === "success") {
      return true;
    }
    return status === "submitting" || authStateLoading;
  }, [authStateLoading, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }
    setError(false);
    setStatus("submitting");

    try {
      await signIn("password", {
        flow: "signIn",
        email: email.trim(),
        password,
      });
    } catch (cause) {
      console.error(cause);
      setError(true);
      setStatus("idle");
      return;
    }
  };

  const buttonLabel = (() => {
    if (status === "success") {
      return "Redirecting…";
    }
    if (status === "submitting" || authStateLoading) {
      return "Signing in…";
    }
    return "Sign in";
  })();

  return (
    <LoginLayout>
      <LoginCard>
        <LoginHeader />
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <LoginField
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            value={email}
            placeholder="you@example.com"
            onChange={setEmail}
            disabled={isProcessing}
          />
          <LoginField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            placeholder="••••••••"
            onChange={setPassword}
            disabled={isProcessing}
          />
          <LoginButton disabled={isProcessing} label={buttonLabel} />
          <LoginStatusMessage error={error} status={status} />
        </form>
      </LoginCard>
    </LoginLayout>
  );
};

export default LoginPage;

