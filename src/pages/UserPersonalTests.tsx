import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Search } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

const UserPersonalTests = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFilter = searchParams.get("search") || undefined;
  const { language, t, isRTL } = useLanguage();

  const [searchInput, setSearchInput] = useState(searchFilter || "");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tests = useQuery(api.personalTest.listPublishedPersonalTests, {
    search: searchFilter,
  });

  useEffect(() => {
    setSearchInput(searchFilter || "");
  }, [searchFilter]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        const value = searchInput.trim();
        if (value) {
          newParams.set("search", value);
        } else {
          newParams.delete("search");
        }
        return newParams;
      }, { replace: true });
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, setSearchParams]);

  const sortedTests = useMemo(() => {
    if (!tests) return [];
    return [...tests].sort((a, b) => a.name.localeCompare(b.name));
  }, [tests]);

  const handleOpenTest = (testId: Id<"personalTests">) => {
    const searchParams = new URLSearchParams();
    if (language === "ar") {
      searchParams.set("lang", "ar");
    }
    const query = searchParams.toString();
    navigate(`/my-tests/${testId}${query ? `?${query}` : ""}`);
  };

  const isLoading = tests === undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("personalTests")}
        </h1>
        <p className="text-muted-foreground">{t("personalTestsSubtitle")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("searchPersonalTests")}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : sortedTests.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center space-y-3">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("noPersonalTestsAvailable")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTests.map((test) => {
            const title = language === "ar" ? test.name_ar : test.name;
            const subtitle = language === "ar" ? test.name : test.name_ar;
            const description =
              language === "ar"
                ? test.description_ar ?? test.description
                : test.description ?? test.description_ar;

            return (
              <Card key={test._id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg leading-snug">{title}</CardTitle>
                  <p className={cn("text-sm text-muted-foreground", language === "ar" ? "text-right" : "text-left")} dir={language === "ar" ? "ltr" : "rtl"}>
                    {subtitle}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {test.questionCount}{" "}
                    {test.questionCount === 1 ? t("question") : t("questions")}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="cta"
                    className="w-full"
                    onClick={() => handleOpenTest(test._id)}
                  >
                    {t("startPersonalTest")}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserPersonalTests;
