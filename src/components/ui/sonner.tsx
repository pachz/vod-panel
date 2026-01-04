import type { ComponentProps } from "react";

import { useTheme } from "@/components/ThemeProvider";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg data-[type=error]:bg-destructive data-[type=error]:text-destructive-foreground data-[type=error]:border-destructive",
          description: "group-[.toast]:text-muted-foreground data-[type=error]:text-destructive-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error: "bg-destructive text-destructive-foreground border-destructive",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
