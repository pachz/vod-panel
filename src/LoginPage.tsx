import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useAction, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "../convex/_generated/api";
import {
  GTM_GOOGLE_OAUTH_PENDING_KEY,
  pushGtmCompleteRegistration,
} from "@/lib/gtm";
import { useLanguage } from "@/hooks/use-language";
import { LanguageToggle } from "@/components/LanguageToggle";
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

type TranslationKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0];

/**
 * Parses Convex errors and converts them to user-friendly messages
 */
const parseAuthError = (
  error: unknown,
  t: (key: TranslationKey) => string,
): string => {
  // Extract the raw error message
  let rawMessage = "";
  const err = error as {
    data?: { message?: string; code?: string };
    message?: string;
  };
  if (err?.data?.message) {
    rawMessage = err.data.message;
  } else if (err?.message) {
    rawMessage = err.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Convert to lowercase for pattern matching
  const messageLower = rawMessage.toLowerCase();

  // Map technical errors to user-friendly messages
  if (messageLower.includes("invalidaccountid")) {
    return t("loginErrorInvalidCredentials");
  }

  if (
    messageLower.includes("invalid email") ||
    messageLower.includes("email not found") ||
    messageLower.includes("user not found")
  ) {
    return t("loginErrorEmailNotFound");
  }

  if (
    messageLower.includes("invalid password") ||
    messageLower.includes("incorrect password") ||
    messageLower.includes("wrong password")
  ) {
    return t("loginErrorWrongPassword");
  }

  if (
    (messageLower.includes("account") && messageLower.includes("deactivated")) ||
    messageLower.includes("deleted")
  ) {
    return t("loginErrorDeactivated");
  }

  if (messageLower.includes("unauthorized")) {
    return t("loginErrorUnauthorized");
  }

  if (
    messageLower.includes("email already exists") ||
    messageLower.includes("email already registered") ||
    messageLower.includes("user already exists")
  ) {
    return t("loginErrorEmailExists");
  }

  // Password reset specific errors
  if (
    messageLower.includes("could not verify") ||
    messageLower.includes("could not verify code")
  ) {
    return t("loginErrorInvalidResetCode");
  }

  if (
    messageLower.includes("invalid code") ||
    messageLower.includes("invalid token") ||
    err?.data?.code === "INVALID_TOKEN" ||
    err?.data?.code === "INVALID_CODE"
  ) {
    return t("loginErrorInvalidResetCode");
  }

  if (messageLower.includes("expired") || messageLower.includes("expire")) {
    return t("loginErrorResetCodeExpired");
  }

  // Check if the message contains stack traces or technical details
  if (
    rawMessage.includes("at ") ||
    rawMessage.includes("Error:") ||
    rawMessage.includes("Stack:") ||
    rawMessage.includes("Request ID:") ||
    rawMessage.includes("[CONVEX")
  ) {
    // It's a technical error, return a generic user-friendly message
    if (
      messageLower.includes("signin") ||
      messageLower.includes("login") ||
      messageLower.includes("authenticate")
    ) {
      return t("loginErrorSignInFailed");
    }
    if (
      messageLower.includes("register") ||
      messageLower.includes("signup") ||
      messageLower.includes("create")
    ) {
      return t("loginErrorRegisterFailed");
    }
    return t("loginErrorGeneric");
  }

  // If we have a clean message without technical details, use it
  if (rawMessage && rawMessage.trim().length > 0) {
    return rawMessage;
  }

  // Default fallback
  return t("loginErrorUnexpected");
};

/** Heuristic: OAuth just created this user (not a returning login). */
const GTM_NEW_GOOGLE_USER_MAX_AGE_MS = 5 * 60 * 1000;

const LoginPage = () => {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authStateLoading } = useConvexAuth();
  const location = useLocation();
  const { language, t, isRTL, localizedPath, localizedSiteUrl } = useLanguage();
  const registerUser = useAction(api.user.registerUser);
  const currentUser = useQuery(api.user.getCurrentUser, isAuthenticated ? {} : "skip");

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

  const termsUrl = localizedSiteUrl("terms");
  const privacyUrl = localizedSiteUrl("privacy");

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect");
    let path = "/";

    if (redirect?.startsWith("/")) {
      path = redirect;
    } else {
      const state = location.state as LocationState | null;
      if (state?.from) {
        const target = `${state.from.pathname ?? ""}${state.from.search ?? ""}${state.from.hash ?? ""}`;
        if (target.startsWith("/")) {
          path = target;
        }
      }
    }

    return localizedPath(path);
  }, [location, localizedPath]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.add("login-body");
      return () => {
        document.body.classList.remove("login-body");
      };
    }
    return undefined;
  }, []);

  // Login page is light-only: force light mode so inputs and layout aren't dark
  // when navigating here from a panel that was in dark mode (theme is on document root).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    return () => {
      root.classList.remove("light");
      // ThemeProvider will re-apply theme from localStorage after login
    };
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

  useEffect(() => {
    if (!isAuthenticated || authStateLoading || currentUser === undefined || currentUser === null) {
      return;
    }
    if (typeof sessionStorage === "undefined") {
      return;
    }
    if (sessionStorage.getItem(GTM_GOOGLE_OAUTH_PENDING_KEY) !== "1") {
      return;
    }
    const age = Date.now() - currentUser._creationTime;
    sessionStorage.removeItem(GTM_GOOGLE_OAUTH_PENDING_KEY);
    if (age > GTM_NEW_GOOGLE_USER_MAX_AGE_MS) {
      return;
    }
    pushGtmCompleteRegistration({
      user_id: currentUser._id,
      registration_method: "google",
      user_status: "active",
      language,
    });
  }, [isAuthenticated, authStateLoading, currentUser, language]);

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
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(GTM_GOOGLE_OAUTH_PENDING_KEY, "1");
      }
      await signIn("google");
    } catch (cause: unknown) {
      console.error(cause);
      const errorMessage = parseAuthError(cause, t);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(GTM_GOOGLE_OAUTH_PENDING_KEY);
      }
      setError(errorMessage || t("loginErrorGoogleSignIn"));
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
        const normalizedEmail = email.trim().toLowerCase();
        const registration = await registerUser({
          name: name.trim(),
          email: normalizedEmail,
          password,
        });
        if (registration.wasNewUser) {
          pushGtmCompleteRegistration({
            user_id: registration.userId,
            registration_method: "password",
            user_status: "active",
            language,
          });
        }
        // After successful registration, sign in
        await signIn("password", {
          flow: "signIn",
          email: normalizedEmail,
          password,
        });
      } catch (cause: unknown) {
        console.error(cause);
        const errorMessage = parseAuthError(cause, t);
        setError(errorMessage);
        setStatus("idle");
        return;
      }
    } else {
      try {
        await signIn("password", {
          flow: "signIn",
          email: email.trim().toLowerCase(),
          password,
        });
      } catch (cause: unknown) {
        console.error(cause);
        const errorMessage = parseAuthError(cause, t);
        setError(errorMessage);
        setStatus("idle");
        return;
      }
    }
  };

  const buttonLabel = (() => {
    if (status === "success") {
      return t("loginRedirecting");
    }
    if (status === "submitting" || authStateLoading) {
      return mode === "register" ? t("loginCreatingAccount") : t("loginSigningIn");
    }
    return mode === "register" ? t("loginCreateAccount") : t("loginLogIn");
  })();

  const isValidEmailFormat = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const isFormValid = useMemo(() => {
    if (passwordResetStep) {
      if (passwordResetStep === "forgot") {
        return isValidEmailFormat(email);
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
    const normalizedEmail = emailValue.trim().toLowerCase();

    try {
      await signIn("password", {
        flow: "reset",
        email: normalizedEmail,
      });
    } catch {
      // Do not reveal whether the email exists; always show the same success state
    } finally {
      setPasswordResetStep({ email: normalizedEmail });
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
    } catch (cause: unknown) {
      console.error(cause);
      const err = cause as { data?: { message?: string }; message?: string };
      let rawMessage = "";
      if (err?.data?.message) {
        rawMessage = err.data.message;
      } else if (err?.message) {
        rawMessage = err.message;
      }
      const messageLower = rawMessage.toLowerCase();

      // Password validation errors should be shown with context
      if (
        messageLower.includes("password") &&
        (messageLower.includes("requirement") ||
          messageLower.includes("must") ||
          messageLower.includes("need"))
      ) {
        setError(t("loginErrorPasswordRequirements"));
        setStatus("idle");
        return;
      }

      // On reset-verification, show a clear message for wrong/expired code
      setError(t("loginErrorWrongResetCode"));
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

  const pageTitle = passwordResetStep
    ? passwordResetStep === "forgot"
      ? t("loginResetPasswordTitle")
      : t("loginEnterResetCodeTitle")
    : mode === "register"
      ? t("loginCreateAccountTitle")
      : t("loginTitle");

  const renderPasswordRequirements = (pwd: string) => {
    if (pwd.length === 0) {
      return null;
    }

    return (
      <div className="login-password-requirements">
        <div className={`login-requirement ${passwordValidation.minLength ? "valid" : ""}`}>
          {t("loginPasswordMinLength")}
        </div>
        <div className={`login-requirement ${passwordValidation.hasUpperCase ? "valid" : ""}`}>
          {t("loginPasswordUppercase")}
        </div>
        <div className={`login-requirement ${passwordValidation.hasLowerCase ? "valid" : ""}`}>
          {t("loginPasswordLowercase")}
        </div>
        <div className={`login-requirement ${passwordValidation.hasNumber ? "valid" : ""}`}>
          {t("loginPasswordNumber")}
        </div>
      </div>
    );
  };

  return (
    <div className="login-container" dir={isRTL ? "rtl" : "ltr"}>
      <div className="login-language-toggle">
        <LanguageToggle />
      </div>
      <div className="login-content">
        <div className="login-header-section">
          <img
            src="/RehamDivaLogo.png"
            alt="Logo"
            className="login-logo"
          />
          <h1 className="login-title">{pageTitle}</h1>
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
              {t("loginWithGoogle")}
            </Button>
          </div>
        )}

        {!passwordResetStep && (
          <div className="login-separator">
            <Separator />
            <span className="login-separator-text">{t("loginOr")}</span>
            <Separator />
          </div>
        )}

        {passwordResetStep ? (
          passwordResetStep === "forgot" ? (
            <form className="login-form" onSubmit={handlePasswordResetRequest} noValidate>
              <div className="login-field-group">
                <Label htmlFor="reset-email" className="login-label">{t("loginEmail")}</Label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  placeholder={t("loginEmailPlaceholder")}
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
                {status === "submitting" ? t("loginSendingCode") : t("loginSendResetCode")}
              </Button>

              <Button
                type="button"
                onClick={cancelPasswordReset}
                variant="outline"
                className="login-cancel-button"
                disabled={isProcessing}
              >
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handlePasswordResetVerification} noValidate>
              <p role="alert" className="login-info-message">
                {t("loginResetEmailInfo")}
              </p>
              <div className="login-field-group">
                <Label htmlFor="reset-code" className="login-label">{t("loginResetCode")}</Label>
                <Input
                  id="reset-code"
                  name="code"
                  type="text"
                  autoComplete="one-time-code"
                  value={resetCode}
                  placeholder={t("loginResetCodePlaceholder")}
                  onChange={(e) => setResetCode(e.target.value)}
                  disabled={isProcessing}
                  className="login-input"
                  required
                />
                <p className="login-hint-text">
                  {t("loginResetCodeHint").replace("{email}", passwordResetStep.email)}
                </p>
              </div>

              <div className="login-field-group">
                <Label htmlFor="new-password" className="login-label">{t("loginNewPassword")}</Label>
                <div className="login-password-wrapper">
                  <Input
                    id="new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    placeholder={t("loginPasswordPlaceholder")}
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
                {renderPasswordRequirements(newPassword)}
              </div>

              {error && (
                <p role="alert" className="login-error">
                  {error}
                </p>
              )}

              {status === "success" && (
                <p className="login-success">
                  {t("loginPasswordResetSuccess")}
                </p>
              )}

              <Button
                type="submit"
                disabled={isProcessing || !isFormValid}
                className="login-submit-button"
              >
                {status === "submitting" ? t("loginResettingPassword") : t("loginResetPassword")}
              </Button>

              <Button
                type="button"
                onClick={cancelPasswordReset}
                variant="outline"
                className="login-cancel-button"
                disabled={isProcessing}
              >
                {t("cancel")}
              </Button>
            </form>
          )
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <div className="login-field-group">
                <Label htmlFor="name" className="login-label">{t("loginName")}</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  placeholder={t("loginNamePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isProcessing}
                  className="login-input"
                  required
                />
              </div>
            )}

            <div className="login-field-group">
              <Label htmlFor="email" className="login-label">{t("loginEmail")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                placeholder={t("loginEmailPlaceholder")}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isProcessing}
                className="login-input"
                required
              />
            </div>

            <div className="login-field-group">
              <div className="login-label-row">
                <Label htmlFor="password" className="login-label">{t("loginPassword")}</Label>
                {mode === "login" && (
                  <a href="#" className="login-forgot-link" onClick={handleForgotPasswordClick}>
                    {t("loginForgotPassword")}
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
                  placeholder={t("loginPasswordPlaceholder")}
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
              {mode === "register" && renderPasswordRequirements(password)}
            </div>

            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}

            {status === "success" && (
              <p className="login-success">
                {mode === "register"
                  ? t("loginAccountCreatedRedirecting")
                  : t("loginSignedInRedirecting")}
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
              {mode === "login" ? t("loginNoAccount") : t("loginHasAccount")}
              <button
                type="button"
                onClick={switchMode}
                className="login-mode-link"
                disabled={isProcessing}
              >
                {mode === "login" ? t("loginSignUp") : t("loginLogInLink")}
              </button>
            </p>
          </div>
        )}

        {!passwordResetStep && (
          <p className="login-footer-text">
            {t("loginTermsPrefix")}
            <a href={termsUrl} className="login-footer-link" target="_blank" rel="noopener noreferrer">
              {t("loginTerms")}
            </a>
            {t("loginAnd")}
            <a href={privacyUrl} className="login-footer-link" target="_blank" rel="noopener noreferrer">
              {t("loginPrivacyPolicy")}
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
