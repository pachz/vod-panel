import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useLocation } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff } from "lucide-react";
import "./login.css";

type LoginStatus = "idle" | "submitting" | "success";
type Mode = "login" | "register";
type PasswordResetStep = "forgot" | { email: string };

type LocationState = {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
};

type PasswordValidation = {
  minLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasNumber: boolean;
};

/**
 * Parses Convex errors and converts them to user-friendly messages
 */
const parseAuthError = (error: any): string => {
  // Extract the raw error message
  let rawMessage = "";
  if (error?.data?.message) {
    rawMessage = error.data.message;
  } else if (error?.message) {
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Convert to lowercase for pattern matching
  const messageLower = rawMessage.toLowerCase();

  // Map technical errors to user-friendly messages
  if (messageLower.includes("invalidaccountid")) {
    return "Invalid email or password. Please check your credentials and try again.";
  }
  
  if (messageLower.includes("invalid email") || messageLower.includes("email not found") || messageLower.includes("user not found")) {
    return "No account found with this email address. Please check your email and try again.";
  }
  
  if (messageLower.includes("invalid password") || messageLower.includes("incorrect password") || messageLower.includes("wrong password")) {
    return "Incorrect password. Please check your password and try again.";
  }
  
  if ((messageLower.includes("account") && messageLower.includes("deactivated")) || messageLower.includes("deleted")) {
    return "This account has been deactivated. Please contact support for assistance.";
  }
  
  if (messageLower.includes("unauthorized")) {
    return "You are not authorized to access this account. Please contact support.";
  }
  
  if (messageLower.includes("email already exists") || messageLower.includes("email already registered") || messageLower.includes("user already exists")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  
  // Password reset specific errors
  if (messageLower.includes("could not verify") || messageLower.includes("could not verify code")) {
    return "Invalid or expired reset code. Please check the code and try again, or request a new one.";
  }
  
  if (messageLower.includes("invalid code") || messageLower.includes("invalid token") || 
      error?.data?.code === "INVALID_TOKEN" || error?.data?.code === "INVALID_CODE") {
    return "Invalid or expired reset code. Please check the code and try again, or request a new one.";
  }
  
  if (messageLower.includes("expired") || messageLower.includes("expire")) {
    return "The reset code has expired. Please request a new one.";
  }
  
  // Check if the message contains stack traces or technical details
  if (rawMessage.includes("at ") || rawMessage.includes("Error:") || rawMessage.includes("Stack:") || rawMessage.includes("Request ID:") || rawMessage.includes("[CONVEX")) {
    // It's a technical error, return a generic user-friendly message
    if (messageLower.includes("signin") || messageLower.includes("login") || messageLower.includes("authenticate")) {
      return "Failed to sign in. Please check your email and password and try again.";
    }
    if (messageLower.includes("register") || messageLower.includes("signup") || messageLower.includes("create")) {
      return "Failed to create account. Please try again or contact support if the problem persists.";
    }
    return "An error occurred. Please try again or contact support if the problem persists.";
  }
  
  // If we have a clean message without technical details, use it
  if (rawMessage && rawMessage.trim().length > 0) {
    return rawMessage;
  }
  
  // Default fallback
  return "An unexpected error occurred. Please try again.";
};

const LoginPage = () => {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authStateLoading } = useConvexAuth();
  const location = useLocation();
  const registerUser = useAction(api.user.registerUser);

  const [mode, setMode] = useState<Mode>("login");
  const [passwordResetStep, setPasswordResetStep] = useState<PasswordResetStep | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | false>(false);
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

  const passwordValidation = useMemo((): PasswordValidation => {
    const pwd = passwordResetStep && passwordResetStep !== "forgot" ? newPassword : password;
    return {
      minLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
    };
  }, [password, newPassword, passwordResetStep]);

  const isPasswordValid = useMemo(() => {
    const validation = passwordValidation;
    return validation.minLength && validation.hasUpperCase && validation.hasLowerCase && validation.hasNumber;
  }, [passwordValidation]);

  const handleGoogleSignIn = async () => {
    if (isProcessing) {
      return;
    }
    setError(false);
    setStatus("submitting");

    try {
      await signIn("google");
    } catch (cause: any) {
      console.error(cause);
      const errorMessage = parseAuthError(cause);
      setError(errorMessage || "Failed to sign in with Google. Please try again.");
      setStatus("idle");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }
    setError(false);
    setStatus("submitting");

    if (mode === "register") {
      try {
        await registerUser({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        // After successful registration, sign in
        await signIn("password", {
          flow: "signIn",
          email: email.trim(),
          password,
        });
      } catch (cause: any) {
        console.error(cause);
        const errorMessage = parseAuthError(cause);
        setError(errorMessage);
        setStatus("idle");
        return;
      }
    } else {
      try {
        await signIn("password", {
          flow: "signIn",
          email: email.trim(),
          password,
        });
      } catch (cause: any) {
        console.error(cause);
        const errorMessage = parseAuthError(cause);
        setError(errorMessage);
        setStatus("idle");
        return;
      }
    }
  };

  const buttonLabel = (() => {
    if (status === "success") {
      return "Redirecting…";
    }
    if (status === "submitting" || authStateLoading) {
      return mode === "register" ? "Creating account…" : "Signing in…";
    }
    return mode === "register" ? "Create Account" : "Log In";
  })();

  const isFormValid = useMemo(() => {
    if (passwordResetStep) {
      if (passwordResetStep === "forgot") {
        return email.trim().length > 0;
      }
      return resetCode.trim().length > 0 && isPasswordValid;
    }
    if (mode === "register") {
      return name.trim().length > 0 && email.trim().length > 0 && isPasswordValid;
    }
    return email.trim().length > 0 && password.length > 0;
  }, [mode, name, email, password, resetCode, isPasswordValid, passwordResetStep]);

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setPasswordResetStep(null);
    setError(false);
    setName("");
    setEmail("");
    setPassword("");
    setResetCode("");
    setNewPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const handleForgotPasswordClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setPasswordResetStep("forgot");
    setError(false);
    setEmail("");
    setPassword("");
    setResetCode("");
    setNewPassword("");
  };

  const handlePasswordResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }
    setError(false);
    setStatus("submitting");

    const formData = new FormData(event.currentTarget);
    const emailValue = formData.get("email") as string;

    try {
      await signIn("password", {
        flow: "reset",
        email: emailValue.trim(),
      });
      setPasswordResetStep({ email: emailValue.trim() });
      setStatus("idle");
    } catch (cause: any) {
      console.error(cause);
      const errorMessage = parseAuthError(cause) || "Failed to send reset code. Please check your email address and try again.";
      setError(errorMessage);
      setStatus("idle");
    }
  };

  const handlePasswordResetVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) {
      return;
    }
    setError(false);
    setStatus("submitting");

    if (!passwordResetStep || passwordResetStep === "forgot") {
      return;
    }

    try {
      await signIn("password", {
        flow: "reset-verification",
        email: passwordResetStep.email,
        code: resetCode.trim(),
        newPassword,
      });
      // Password reset successful, user will be signed in automatically
      setStatus("success");
    } catch (cause: any) {
      console.error(cause);
      // Check for password validation errors first (these should be shown as-is)
      let rawMessage = "";
      if (cause?.data?.message) {
        rawMessage = cause.data.message;
      } else if (cause?.message) {
        rawMessage = cause.message;
      }
      const messageLower = rawMessage.toLowerCase();
      
      // Password validation errors should be shown with context
      if (messageLower.includes("password") && (messageLower.includes("requirement") || messageLower.includes("must") || messageLower.includes("need"))) {
        const errorMessage = "Password does not meet requirements. " + (rawMessage || "Please check the password requirements above.");
        setError(errorMessage);
        setStatus("idle");
        return;
      }
      
      // Use the general error parser for other errors
      const errorMessage = parseAuthError(cause) || "Invalid code or password. Please try again.";
      setError(errorMessage);
      setStatus("idle");
    }
  };

  const cancelPasswordReset = () => {
    setPasswordResetStep(null);
    setError(false);
    setEmail("");
    setResetCode("");
    setNewPassword("");
    setShowNewPassword(false);
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="login-header-section">
          <img 
            src="/RehamDivaLogo.png" 
            alt="Logo" 
            className="login-logo"
          />
          <h1 className="login-title">
            {passwordResetStep
              ? passwordResetStep === "forgot"
                ? "Reset your password"
                : "Enter reset code"
              : mode === "register"
              ? "Create an account"
              : "Log in to Reham Diva"}
          </h1>
        </div>

        {!passwordResetStep && (
          <div className="login-social-buttons">
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={isProcessing}
            className="login-social-button"
          >
            <svg className="login-social-icon" viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Login with Google
          </Button>
          </div>
        )}

        {!passwordResetStep && (
          <div className="login-separator">
            <Separator />
            <span className="login-separator-text">or</span>
            <Separator />
          </div>
        )}

        {passwordResetStep ? (
          passwordResetStep === "forgot" ? (
            <form className="login-form" onSubmit={handlePasswordResetRequest} noValidate>
              <div className="login-field-group">
                <Label htmlFor="reset-email" className="login-label">Email</Label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  placeholder="alan.turing@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isProcessing}
                  className="login-input"
                  required
                />
              </div>

              {error && (
                <p role="alert" className="login-error">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isProcessing || !isFormValid}
                className="login-submit-button"
              >
                {status === "submitting" ? "Sending code…" : "Send reset code"}
              </Button>

              <Button
                type="button"
                onClick={cancelPasswordReset}
                variant="outline"
                className="login-cancel-button"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handlePasswordResetVerification} noValidate>
              <div className="login-field-group">
                <Label htmlFor="reset-code" className="login-label">Reset code</Label>
                <Input
                  id="reset-code"
                  name="code"
                  type="text"
                  autoComplete="one-time-code"
                  value={resetCode}
                  placeholder="12345678"
                  onChange={(e) => setResetCode(e.target.value)}
                  disabled={isProcessing}
                  className="login-input"
                  required
                />
                <p className="login-hint-text">
                  Enter the 8-digit code sent to {passwordResetStep.email}
                </p>
              </div>

              <div className="login-field-group">
                <Label htmlFor="new-password" className="login-label">New password</Label>
                <div className="login-password-wrapper">
                  <Input
                    id="new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    placeholder="••••••••••••"
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isProcessing}
                    className="login-input login-password-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="login-password-toggle"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                {newPassword.length > 0 && (
                  <div className="login-password-requirements">
                    <div className={`login-requirement ${passwordValidation.minLength ? "valid" : ""}`}>
                      At least 8 characters
                    </div>
                    <div className={`login-requirement ${passwordValidation.hasUpperCase ? "valid" : ""}`}>
                      One uppercase letter
                    </div>
                    <div className={`login-requirement ${passwordValidation.hasLowerCase ? "valid" : ""}`}>
                      One lowercase letter
                    </div>
                    <div className={`login-requirement ${passwordValidation.hasNumber ? "valid" : ""}`}>
                      One number
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="login-error">
                  {error}
                </p>
              )}

              {status === "success" && (
                <p className="login-success">
                  Password reset successful. Redirecting…
                </p>
              )}

              <Button
                type="submit"
                disabled={isProcessing || !isFormValid}
                className="login-submit-button"
              >
                {status === "submitting" ? "Resetting password…" : "Reset password"}
              </Button>

              <Button
                type="button"
                onClick={cancelPasswordReset}
                variant="outline"
                className="login-cancel-button"
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </form>
          )
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
          {mode === "register" && (
            <div className="login-field-group">
              <Label htmlFor="name" className="login-label">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                placeholder="John Doe"
                onChange={(e) => setName(e.target.value)}
                disabled={isProcessing}
                className="login-input"
                required
              />
            </div>
          )}

          <div className="login-field-group">
            <Label htmlFor="email" className="login-label">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="alan.turing@example.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={isProcessing}
              className="login-input"
              required
            />
          </div>

          <div className="login-field-group">
            <div className="login-label-row">
              <Label htmlFor="password" className="login-label">Password</Label>
              {mode === "login" && (
                <a href="#" className="login-forgot-link" onClick={handleForgotPasswordClick}>
                  Forgot your password?
                </a>
              )}
            </div>
            <div className="login-password-wrapper">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                placeholder="••••••••••••"
                onChange={(e) => setPassword(e.target.value)}
                disabled={isProcessing}
                className="login-input login-password-input"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-password-toggle"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
            {mode === "register" && password.length > 0 && (
              <div className="login-password-requirements">
                <div className={`login-requirement ${passwordValidation.minLength ? "valid" : ""}`}>
                  At least 8 characters
                </div>
                <div className={`login-requirement ${passwordValidation.hasUpperCase ? "valid" : ""}`}>
                  One uppercase letter
                </div>
                <div className={`login-requirement ${passwordValidation.hasLowerCase ? "valid" : ""}`}>
                  One lowercase letter
                </div>
                <div className={`login-requirement ${passwordValidation.hasNumber ? "valid" : ""}`}>
                  One number
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="login-error">
              {error}
            </p>
          )}

          {status === "success" && (
            <p className="login-success">
              {mode === "register" ? "Account created. Redirecting…" : "Signed in. Redirecting…"}
            </p>
          )}

          <Button
            type="submit"
            disabled={isProcessing || !isFormValid}
            className="login-submit-button"
          >
            {buttonLabel}
          </Button>
        </form>
        )}

        {!passwordResetStep && (
          <div className="login-mode-switch">
          <p className="login-mode-text">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={switchMode}
              className="login-mode-link"
              disabled={isProcessing}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
          </div>
        )}

        {!passwordResetStep && (
          <p className="login-footer-text">
          By signing in, you agree to our{" "}
          <a href="https://vod.borj.dev/en/terms" className="login-footer-link" target="_blank" rel="noopener noreferrer">
            Terms
          </a>{" "}
          and{" "}
          <a href="https://vod.borj.dev/en/privacy" className="login-footer-link" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginPage;

