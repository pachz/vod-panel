import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, XCircle, Calendar } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

const Payments = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const subscription = useQuery(api.paymentInternal.getMySubscription);
  const [isLoading, setIsLoading] = useState(false);

  // Handle success/cancel redirects
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      toast.success("Payment successful! Your subscription is being activated...");
      // Remove query params
      setSearchParams({});
    } else if (canceled === "true") {
      toast.info("Payment was canceled. You can try again anytime.");
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleTestSubscribe = async () => {
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckoutSession();
      if (checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = checkoutUrl;
      } else {
        toast.error("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast.error("Failed to create checkout session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), "MMM d, yyyy");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case "trialing":
        return <Badge variant="default" className="bg-blue-500">Trialing</Badge>;
      case "past_due":
        return <Badge variant="destructive">Past Due</Badge>;
      case "canceled":
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            Payments
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
              Alpha
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage subscriptions and payment processing
          </p>
        </div>
      </div>

      {/* Subscription Status Card */}
      {subscription !== undefined && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
            </CardTitle>
            <CardDescription>
              Your current subscription information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription === null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-5 w-5" />
                  <p>You don&apos;t have an active subscription.</p>
                </div>
                <Button
                  variant="cta"
                  onClick={handleTestSubscribe}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  {isLoading ? "Creating checkout session..." : "Subscribe Now"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Subscription Active</span>
                  </div>
                  {getStatusBadge(subscription.status)}
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Current Period</p>
                      <p className="text-sm font-medium">
                        {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                      </p>
                    </div>
                  </div>
                  
                  {subscription.cancelAtPeriodEnd && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-orange-500" />
                      <div>
                        <p className="text-sm text-muted-foreground">Cancellation</p>
                        <p className="text-sm font-medium text-orange-500">
                          Will cancel on {formatDate(subscription.currentPeriodEnd)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscribe Card */}
      {(!subscription || subscription.status === "canceled") && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Test Subscription
            </CardTitle>
            <CardDescription>
              Test the Stripe payment flow with a test subscription. This will redirect you to Stripe&apos;s checkout page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click the button below to test the subscription flow. You&apos;ll be redirected to Stripe&apos;s secure checkout page.
              </p>
              <Button
                variant="cta"
                onClick={handleTestSubscribe}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? "Creating checkout session..." : "Test Subscribe"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Payments;

