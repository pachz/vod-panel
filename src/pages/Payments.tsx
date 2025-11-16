import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const Payments = () => {
  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const [isLoading, setIsLoading] = useState(false);

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
    </div>
  );
};

export default Payments;

